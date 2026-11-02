# licensed-action

Checks the licenses of a repository's dependencies against the allowed licenses in `.licensed.yml`, commits a record
per dependency to `.licenses/` and fails when a dependency has no license or a license that is not allowed.
A repository can add `reviewed` and `ignored` dependencies in its own `.licensed.yml`; it is merged with the one in this
repository.

| Action                              | Projects         |
|-------------------------------------|------------------|
| `openhealthhub/licensed-action/npm` | npm              |
| `openhealthhub/licensed-action/jvm` | Maven and Gradle |

Both generate a CycloneDX SBOM of the runtime dependencies and check the licenses the packages declare with
`scripts/licenses.ts`. For npm that is the `license` in each package.json, including the old `{"type": "MIT"}` form.

Both take `github-token` and an optional `working-directory`. The job needs `permissions: contents: write` to commit
the records to the pull request branch.

Run the workflow on every pull request, without a `paths` filter, so it can be a required check. On a pull request
that changes none of the dependency files the action returns right away; the defaults are the lockfiles or build
files, `.licensed.yml` and `.github/workflows/**`. The optional `paths` input (glob patterns, one per line) replaces
them. Without records in `.licenses/` yet, and outside pull requests, the check always runs.

## npm

```yaml
name: Update Licenses
on:
  pull_request:
  workflow_dispatch:

jobs:
  licenses:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: openhealthhub/licensed-action/npm@v1.0.2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Maven and Gradle

```yaml
name: Update Licenses
on:
  pull_request:
  workflow_dispatch:

jobs:
  licenses:
    env:
      GH_PACKAGES_READ_TOKEN: ${{ secrets.GHPR_READ_PACKAGES_TOKEN }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: openhealthhub/licensed-action/jvm@v1.0.2
        with:
          build-tool: 'maven'
          java-version: '25'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

For Gradle use `build-tool: 'gradle'`. Dependencies are matched as `group:artifact` for Maven and Gradle and as
`name` or `@scope/name` for npm; globs are allowed:

```yaml
reviewed:
  maven:
    # EPL-2.0 OR LGPL-2.1, used unmodified
    - ch.qos.logback:*
  npm:
    # MIT according to its LICENSE file; package.json declares none
    - png-js
```

License names without an SPDX id are mapped in `scripts/license-names.json`.

## Development

The script runs on Node 22 without a build step; run `npm install`, `npm test` and `npm run typecheck` when changing it.
On a pull request both actions also run against the projects in `test/`, which commits their license records to the
branch.

Dependabot keeps the actions and npm packages up to date. It does not see the CycloneDX versions in
`jvm/generate-sbom.sh`, `jvm/cyclonedx.init.gradle.kts` and `npm/action.yml`; update those by hand.
