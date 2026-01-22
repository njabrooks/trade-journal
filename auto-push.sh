#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/twotrees/Projects/trade-journal"
cd "$REPO_ROOT"

# Only commit/push if there are changes
if git diff --quiet && git diff --cached --quiet; then
  exit 0
fi

# Stage everything (notes + clippings)
git add -A

# If still nothing staged, exit
if git diff --cached --quiet; then
  exit 0
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

git commit -m "Auto: sync notes (${TS})" >/dev/null || exit 0

git push >/dev/null
