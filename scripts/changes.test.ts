import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {defaultPatterns, globToRegExp, shouldRun} from './changes.ts';

describe('globToRegExp', () => {
  it('matches files in the root and in subdirectories', () => {
    assert.ok(globToRegExp('**/pom.xml').test('pom.xml'));
    assert.ok(globToRegExp('**/pom.xml').test('backend/pom.xml'));
    assert.ok(!globToRegExp('**/pom.xml').test('backend/pom.xml.bak'));
  });

  it('keeps a single star within one directory', () => {
    assert.ok(globToRegExp('**/*.gradle.kts').test('app/build.gradle.kts'));
    assert.ok(globToRegExp('.mvn/*').test('.mvn/maven.config'));
    assert.ok(!globToRegExp('.mvn/*').test('.mvn/wrapper/maven-wrapper.properties'));
    assert.ok(globToRegExp('.github/workflows/**').test('.github/workflows/licenses.yml'));
  });

  it('treats regex characters literally', () => {
    assert.ok(!globToRegExp('**/pom.xml').test('pomXxml'));
  });
});

describe('shouldRun', () => {
  const maven = defaultPatterns.maven;

  it('runs outside pull requests', () => {
    assert.ok(shouldRun(undefined, maven, true));
  });

  it('runs when no records exist yet', () => {
    assert.ok(shouldRun(['README.md'], maven, false));
  });

  it('runs when a dependency file changed', () => {
    assert.ok(shouldRun(['src/Main.java', 'module/pom.xml'], maven, true));
    assert.ok(shouldRun(['.github/workflows/licenses.yml'], maven, true));
    assert.ok(shouldRun(['frontend/package-lock.json'], defaultPatterns.npm, true));
    assert.ok(shouldRun(['gradle/libs.versions.toml'], defaultPatterns.gradle, true));
  });

  it('skips a pull request without dependency changes', () => {
    assert.ok(!shouldRun(['src/Main.java', 'README.md'], maven, true));
    assert.ok(!shouldRun(['.licenses/maven/org.slf4j/slf4j-api.dep.yml'], maven, true));
    assert.ok(!shouldRun([], maven, true));
  });
});
