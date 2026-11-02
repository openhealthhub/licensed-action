#!/usr/bin/env bash
set -euo pipefail

git add .licenses
if git diff --cached --quiet; then
  exit 0
fi

ticket=$(grep -oE 'OP-[0-9]+' <<< "$BRANCH" | head -1 || true)
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -m "${ticket:-NOJIRA} update license records"
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "HEAD:$BRANCH"
