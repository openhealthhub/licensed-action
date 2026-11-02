#!/usr/bin/env bash
# Pull request runs check out a merge commit; license records are committed to the branch itself.
set -euo pipefail

git fetch --depth=1 origin "$BRANCH"
git checkout -B "$BRANCH" FETCH_HEAD
