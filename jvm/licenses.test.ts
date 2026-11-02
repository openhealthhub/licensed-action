import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type Bom, type Config, findProblems, isAllowed, toRecords, writeRecords } from './licenses.ts';

const config: Config = {
  allowed: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
  ignored: { maven: ['com.openhealthhub:*'] },
  reviewed: { maven: ['ch.qos.logback:logback-core'] }
};

const component = (group: string, name: string, version: string, licenses: object[]) =>
  ({ group, name, version, licenses });

const bom: Bom = {
  components: [
    component('org.example', 'permissive', '1.0', [{ license: { id: 'MIT' } }]),
    component('org.example', 'dual', '1.0', [{ license: { id: 'EPL-2.0' } }, { license: { id: 'Apache-2.0' } }]),
    component('org.example', 'renamed', '1.0', [{ license: { name: 'Apache  Software License 2.0 ' } }]),
    component('org.example', 'copyleft', '1.0', [{ expression: 'EPL-2.0 OR GPL-2.0-with-classpath-exception' }]),
    component('org.example', 'unlicensed', '1.0', []),
    component('org.example', 'custom', '1.0', [{ license: { name: 'Example Vendor Licence' } }]),
    component('org.example', 'relicensed', '1.0', [{ license: { id: 'LGPL-2.1-only' } }]),
    component('org.example', 'relicensed', '2.0', [{ license: { id: 'Apache-2.0' } }]),
    component('ch.qos.logback', 'logback-core', '1.5.0', [{ license: { id: 'EPL-2.0' } }]),
    component('com.openhealthhub', 'common-spring-logging', '1.0', [])
  ]
};

describe('isAllowed', () => {
  const allowed = ['mit', 'apache-2.0', 'bsd-3-clause'];

  it('evaluates SPDX expressions', () => {
    assert.ok(isAllowed('mit', allowed));
    assert.ok(isAllowed('epl-2.0 OR apache-2.0', allowed));
    assert.ok(!isAllowed('epl-2.0 OR lgpl-2.1-only', allowed));
    assert.ok(isAllowed('mit AND bsd-3-clause', allowed));
    assert.ok(!isAllowed('mit AND epl-2.0', allowed));
    assert.ok(isAllowed('epl-2.0 AND mpl-2.0 OR mit', allowed));
    assert.ok(!isAllowed('(epl-2.0 OR mit) AND mpl-2.0', allowed));
    assert.ok(isAllowed('((cddl-1.0 OR mit))', allowed));
    assert.ok(!isAllowed('gpl-2.0 WITH classpath-exception-2.0', allowed));
    assert.ok(!isAllowed('none', allowed));
    assert.ok(!isAllowed('other', allowed));
    assert.ok(isAllowed('other OR apache-2.0', allowed));
  });
});

describe('records', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'licenses-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips ignored dependencies and combines versions', () => {
    const records = toRecords(bom, config, 'maven');

    assert.equal(records.length, 8);
    assert.ok(!records.some(record => record.name.startsWith('com.openhealthhub:')));
    const relicensed = records.find(record => record.name === 'org.example:relicensed');
    assert.equal(relicensed?.version, '1.0, 2.0');
    assert.equal(relicensed?.license, '(lgpl-2.1-only) AND (apache-2.0)');
  });

  it('fails on an SBOM without dependencies, as resolving them failed', () => {
    assert.throws(() => toRecords({components: []}, config, 'maven'), /lists no dependencies/);
    assert.throws(() => toRecords({}, config, 'maven'), /lists no dependencies/);
  });

  it('reports dependencies that are not allowed or reviewed', () => {
    assert.deepEqual(findProblems(toRecords(bom, config, 'maven'), config, 'maven'), [
      "org.example:copyleft (1.0): license '(epl-2.0 or gpl-2.0-with-classpath-exception)' is not allowed",
      'org.example:custom (1.0): unrecognised license ["Example Vendor Licence"], ' +
        'map it in license-names.json or review the dependency',
      "org.example:relicensed (1.0, 2.0): license '(lgpl-2.1-only) AND (apache-2.0)' is not allowed",
      'org.example:unlicensed (1.0): no license declared'
    ]);
  });

  it('writes a record per dependency', () => {
    writeRecords(toRecords(bom, config, 'maven'), dir, 'maven');

    assert.equal(
      readFileSync(join(dir, 'maven', 'org.example', 'custom.dep.yml'), 'utf8'),
      '---\nname: "org.example:custom"\nversion: "1.0"\ntype: "maven"\nlicense: "other"\ndeclared:\n- "Example Vendor Licence"\n'
    );
  });

  it('removes records of dropped dependencies', () => {
    const stale = join(dir, 'maven', 'org.example', 'dropped.dep.yml');
    mkdirSync(join(dir, 'maven', 'org.example'), { recursive: true });
    writeFileSync(stale, '');

    writeRecords([], dir, 'maven');

    assert.ok(!existsSync(stale));
  });
});
