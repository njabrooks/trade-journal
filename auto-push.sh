#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/assistant/Projects/trade-journal"
cd "$REPO_ROOT"

# Stage only clipping folders
# (keep this surgical so we don't accidentally commit other repo changes)
git add research-workspace/inbox/ research-workspace/news/

# If nothing staged, exit
if git diff --cached --quiet; then
  exit 0
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

git commit -m "Auto: inbox clippings (${TS})" >/dev/null || exit 0

git push >/dev/null
