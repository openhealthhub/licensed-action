#!/usr/bin/env bash
# Writes the shared .licensed.yml, merged with the one in $WORKING_DIRECTORY if present, to $1.
set -euo pipefail

shared="$(dirname "$0")/../.licensed.yml"
repository="$WORKING_DIRECTORY/.licensed.yml"

if [ -f "$repository" ]; then
  yq eval-all 'select(fileIndex == 0) *d select(fileIndex == 1)' "$shared" "$repository" > "$1"
else
  cp "$shared" "$1"
fi
