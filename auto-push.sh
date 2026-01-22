#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/twotrees/Projects/trade-journal"
cd "$REPO_ROOT"

# Stage only the inbox folder (clippings)
git add research-workspace/inbox/

# If nothing staged, exit
if git diff --cached --quiet; then
  exit 0
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

git commit -m "Auto: inbox clippings (${TS})" >/dev/null || exit 0

git push >/dev/null
