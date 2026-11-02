// Usage: node changes.ts
// Writes run=true|false to $GITHUB_OUTPUT. A pull request that touches no dependency file skips the license check,
// as long as license records already exist; every other event runs it.
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const shared = ['**/.licensed.yml', '.github/workflows/**'];

export const defaultPatterns: Record<string, string[]> = {
  npm: ['**/package-lock.json', ...shared],
  maven: ['**/pom.xml', '.mvn/**', ...shared],
  gradle: ['**/*.gradle.kts', '**/*.gradle', '**/libs.versions.toml', '**/gradle-wrapper.properties', ...shared]
};

const escape = (char: string) => char.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`);

const wildcards: Record<string, string> = {'*': '[^/]*', '?': '[^/]'};

export const globToRegExp = (glob: string) => {
  let source = '';
  let position = 0;
  while (position < glob.length) {
    if (glob.startsWith('**/', position)) {
      source += '(?:.*/)?';
      position += 3;
    } else if (glob.startsWith('**', position)) {
      source += '.*';
      position += 2;
    } else {
      const char = glob[position++];
      source += wildcards[char] ?? escape(char);
    }
  }

  return new RegExp(`^${source}$`);
};

export const shouldRun = (changedFiles: string[] | undefined, patterns: string[], hasRecords: boolean) => {
  if (!changedFiles || !hasRecords) {
    return true;
  }

  const regexes = patterns.map(globToRegExp);
  return changedFiles.some(file => regexes.some(regex => regex.test(file)));
};

const pullRequestFiles = () => {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request' || !process.env.GITHUB_EVENT_PATH) {
    return undefined;
  }

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const output = execFileSync('gh', [
    'api', '--paginate', `repos/${process.env.GITHUB_REPOSITORY}/pulls/${event.pull_request.number}/files`, '--jq', '.[].filename'
  ], {encoding: 'utf8'});
  return output.split('\n').filter(file => file.length > 0);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tool = process.env.LICENSE_SOURCE ?? '';
  const configured = (process.env.PATHS ?? '').split('\n').map(path => path.trim()).filter(path => path.length > 0);
  const patterns = configured.length > 0 ? configured : defaultPatterns[tool] ?? [];
  const hasRecords = existsSync(join(process.env.WORKING_DIRECTORY ?? '.', '.licenses', tool));
  const run = shouldRun(pullRequestFiles(), patterns, hasRecords);

  if (!run) {
    console.log('No dependency files changed, skipping the license check');
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'No dependency files changed, the license check was skipped.\n');
    }
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
  }
}
