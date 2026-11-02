// Usage:
//   node licenses.ts cache  <bom.json> <config.json> <type> <cache-dir>
//   node licenses.ts status <bom.json> <config.json> <type>
import {appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

type Licensing = { license?: { id?: string; name?: string }; expression?: string };

type Component = {
  group?: string;
  name: string;
  version?: string;
  licenses?: Licensing[];
  externalReferences?: { type: string; url: string }[];
  properties?: { name: string; value: string }[];
  components?: Component[];
};

export type Bom = { components?: Component[] };

type LegacyLicense = string | { type?: string };

export type Config = {
  allowed?: string[];
  reviewed?: Record<string, string[]>;
  ignored?: Record<string, string[]>;
};

export type DependencyRecord = {
  name: string;
  version: string;
  type: string;
  homepage?: string;
  license: string;
  declared?: string[];
};

const normalise = (name: string) => name.toLowerCase().replaceAll(/\s+/g, ' ').trim();

const licenseNames = new Map(
  Object.entries<string>(JSON.parse(readFileSync(new URL('license-names.json', import.meta.url), 'utf8')))
    .map(([name, id]) => [normalise(name), id.toLowerCase()])
);

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));

const matches = (patterns: string[], name: string) =>
  patterns.some(pattern => {
    const regex = pattern.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`).replaceAll('*', '.*').replaceAll('?', '.');
    return new RegExp(`^${regex}$`).test(name);
  });

const flatten = (components: Component[] = []): Component[] =>
  components.flatMap(component => [component, ...flatten(component.components)]);

const term = (licensing: Licensing) => {
  if (licensing.expression) {
    return `(${licensing.expression.toLowerCase()})`;
  }

  if (licensing.license?.id) {
    return licensing.license.id.toLowerCase();
  }

  return licenseNames.get(normalise(licensing.license?.name ?? '')) ?? 'other';
};

const expression = (component: Component) => {
  const licenses = component.licenses ?? [];
  if (licenses.length === 0) {
    return 'none';
  }

  return [...new Set(licenses.map(term))].join(' OR ');
};

const declaredNames = (component: Component) =>
  (component.licenses ?? [])
    .filter(licensing => term(licensing) === 'other')
    .map(licensing => licensing.license?.name ?? '');

const unique = <T>(values: T[]) => [...new Set(values)];

// npm packages are named like @scope/name or name, Maven and Gradle artifacts like group:artifact
const nameOf = (component: Component, type: string) => {
  if (type === 'npm') {
    return component.group ? `${component.group}/${component.name}` : component.name;
  }

  return `${component.group}:${component.name}`;
};

export const toRecords = (bom: Bom, config: Config, type: string): DependencyRecord[] => {
  const components = flatten(bom.components).filter(component => type === 'npm' || component.group);
  if (components.length === 0) {
    throw new Error('The SBOM lists no dependencies, so dependency resolution probably failed');
  }

  const ignored = config.ignored?.[type] ?? [];
  const byName = Map.groupBy(components, component => nameOf(component, type));

  return [...byName]
    .filter(([name]) => !matches(ignored, name))
    .map(([name, versions]) => {
      const expressions = unique(versions.map(expression));
      const declared = unique(versions.flatMap(declaredNames));
      return {
        name,
        version: unique(versions.map(component => component.version)).join(', '),
        type,
        homepage: versions[0].externalReferences?.find(reference => reference.type === 'website')?.url,
        license: expressions.length === 1 ? expressions[0] : expressions.map(e => `(${e})`).join(' AND '),
        ...(declared.length > 0 && {declared})
      };
    });
};

const toYaml = (record: DependencyRecord) =>
  [
    '---',
    ...Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .flatMap(([key, value]) =>
        Array.isArray(value)
          ? [`${key}:`, ...value.map(item => `- ${JSON.stringify(item)}`)]
          : [`${key}: ${JSON.stringify(value)}`]
      ),
    ''
  ].join('\n');

export const writeRecords = (records: DependencyRecord[], cacheDir: string, type: string) => {
  const typeDir = join(cacheDir, type);
  rmSync(typeDir, {recursive: true, force: true});
  for (const record of records) {
    const path = join(typeDir, `${record.name.replace(':', '/')}.dep.yml`);
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, toYaml(record));
  }
};

const tokenize = (expression: string) => expression.toLowerCase().match(/\(|\)|[^\s()]+/g) ?? [];

// Evaluates an SPDX-style expression; AND binds stronger than OR, "x WITH y" is a single license.
export const isAllowed = (expression: string, allowed: string[]) => {
  const tokens = tokenize(expression);
  let position = 0;

  const parseTerm = (): boolean => {
    let token = tokens[position++];
    if (token === '(') {
      const result = parseOr();
      position++;
      return result;
    }

    if (tokens[position] === 'with') {
      token = `${token} with ${tokens[position + 1]}`;
      position += 2;
    }
    return allowed.includes(token);
  };
  const parseAnd = () => {
    let result = parseTerm();
    while (tokens[position] === 'and') {
      position++;
      result = parseTerm() && result;
    }
    return result;
  };
  const parseOr = () => {
    let result = parseAnd();
    while (tokens[position] === 'or') {
      position++;
      result = parseAnd() || result;
    }
    return result;
  };

  return parseOr();
};

const describe = (record: DependencyRecord) => {
  const dependency = `${record.name} (${record.version})`;
  if (record.license === 'none') {
    return `${dependency}: no license declared`;
  }

  if (/\bother\b/.test(record.license)) {
    return `${dependency}: unrecognised license ${JSON.stringify(record.declared)}, ` +
      'map it in license-names.json or review the dependency';
  }

  return `${dependency}: license '${record.license}' is not allowed`;
};

export const findProblems = (records: DependencyRecord[], config: Config, type: string) => {
  const reviewed = config.reviewed?.[type] ?? [];
  const allowed = (config.allowed ?? []).map(license => license.toLowerCase());
  return records
    .filter(record => !matches(reviewed, record.name) && !isAllowed(record.license, allowed))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(describe);
};

// Old npm packages declare {"type": "MIT"} as license or a licenses array, which CycloneDX npm does not read
export const addLegacyNpmLicenses = (bom: Bom, projectDir: string) => {
  for (const component of flatten(bom.components)) {
    const path = component.properties?.find(property => property.name === 'cdx:npm:package:path')?.value;
    const packageJson = path && join(projectDir, path, 'package.json');
    if ((component.licenses ?? []).length > 0 || !packageJson || !existsSync(packageJson)) {
      continue;
    }

    const {license, licenses} = readJson<{license?: LegacyLicense; licenses?: LegacyLicense[]}>(packageJson);
    const types = [license, ...(licenses ?? [])]
      .map(legacy => typeof legacy === 'object' ? legacy?.type : undefined)
      .filter((type): type is string => Boolean(type));
    if (types.length > 0) {
      component.licenses = types.map(id => ({license: {id}}));
    }
  }

  return bom;
};

const readBom = (bomPath: string, type: string) => {
  const bom = readJson<Bom>(bomPath);
  return type === 'npm' ? addLegacyNpmLicenses(bom, process.cwd()) : bom;
};

const cache = (bomPath: string, configPath: string, type: string, cacheDir: string) => {
  const records = toRecords(readBom(bomPath, type), readJson(configPath), type);
  writeRecords(records, cacheDir, type);
  console.log(`Cached ${records.length} ${type} dependencies in ${join(cacheDir, type)}`);
};

const status = (bomPath: string, configPath: string, type: string) => {
  const config = readJson<Config>(configPath);
  const problems = findProblems(toRecords(readBom(bomPath, type), config, type), config, type);
  if (problems.length === 0) {
    console.log(`All ${type} dependency licenses are allowed`);
    return;
  }

  const report = problems.map(problem => `- ${problem}`).join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${problems.length} ${type} license problems\n\n${report}\n`);
  }
  process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'cache' && args.length === 4) {
      cache(args[0], args[1], args[2], args[3]);
    } else if (command === 'status' && args.length === 3) {
      status(args[0], args[1], args[2]);
    } else {
      console.error('Usage: licenses.ts cache <bom.json> <config.json> <type> <cache-dir> | status <bom.json> <config.json> <type>');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
