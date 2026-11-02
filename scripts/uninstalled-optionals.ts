// Usage: node uninstalled-optionals.ts (in the npm project directory)
// Prints a JSON array of optional dependencies that npm did not install, such as binaries for other platforms. npm list
// still reports them without a path, which licensed treats as an error, while they are not part of the installed product.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

type NpmPackage = {
  path?: string;
  optionalDependencies?: Record<string, string>;
  dependencies?: Record<string, NpmPackage>;
};

export const uninstalledOptionals = (tree: NpmPackage) => {
  const installed = new Set<string>();
  const uninstalled = new Set<string>();
  const visit = (parent: NpmPackage) => {
    for (const [name, dependency] of Object.entries(parent.dependencies ?? {})) {
      if (dependency.path) {
        installed.add(name);
      } else if (parent.optionalDependencies?.[name]) {
        uninstalled.add(name);
      }
      visit(dependency);
    }
  };
  visit(tree);

  return [...uninstalled].filter(name => !installed.has(name)).sort((a, b) => a.localeCompare(b));
};

// npm list exits with 1 when it finds problems, such as a missing peer dependency, but still prints the tree
const npmList = () => {
  try {
    return execFileSync('npm', ['list', '--json', '--long', '--all', '--omit=dev'], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (error) {
    return (error as {stdout?: string}).stdout ?? '{}';
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(uninstalledOptionals(JSON.parse(npmList()))));
}
