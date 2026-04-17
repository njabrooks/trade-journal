---
name: paperclip-backlog
description: >
  Create and read backlog issues in the Two Trees Capital Paperclip instance.
  Use when identifying follow-up work, technical debt, or feature requests that
  should be tracked as Paperclip issues. Also use to pull the current backlog
  register to review outstanding items.
---

> DEPRECATED (2026-04-14) -- Paperclip is no longer the canonical backlog. Task tracking happens directly in Claude Code conversations. Kept for reference only.

# Paperclip Backlog Skill

Manages backlog issues in the Two Trees Capital Paperclip instance.

## Connection

```
API base:    https://njb-m2-mac-mini.tailcfacb3.ts.net:3100
Company ID:  b44cd276-47f3-4c49-8fa6-dd61b7fbaed6
Auth:        Authorization: Bearer <API_KEY>
```

Get a fresh API key (valid for the session) by running from the server package:
```bash
cd /Users/home-hub/.npm/_npx/43414d9b790239bb/node_modules/@paperclipai/server
/Users/home-hub/.npm/_npx/43414d9b790239bb/node_modules/.bin/paperclipai agent local-cli ceo \
  --company-id b44cd276-47f3-4c49-8fa6-dd61b7fbaed6 2>/dev/null | grep PAPERCLIP_API_KEY | cut -d= -f2 | tr -d "'"
```

**Important**: Do NOT include `X-Paperclip-Run-Id` header when calling outside of a heartbeat — it will cause a FK violation. Auth header only is correct for manual/CLI use.

## Projects (for `projectId` and `goalId`)

| Project | ID | Goal ID | Use for |
|---------|----|---------|---------|
| Engineering | `07aef1d0-dda8-466e-9bf9-832050a12088` | `6d9a050b-bdba-4e7e-bc5c-0069e8dc31ac` | trade-journal feature work, schema changes, UI |
| Daily Portfolio Ops | `0b29a18d-0424-4797-8c9d-03304b013ba4` | `43f19628-e244-42a3-8e56-f0723a1a0e17` | operational tasks, scheduling, skill fixes |
| Research Pipeline | `f8534399-e056-42ce-b8ac-0da60fa6c821` | `43f19628-e244-42a3-8e56-f0723a1a0e17` | research workflow, skill updates, ingestion |

## Read the backlog register

```bash
API_KEY=<from above>
COMPANY_ID='b44cd276-47f3-4c49-8fa6-dd61b7fbaed6'
BASE='https://njb-m2-mac-mini.tailcfacb3.ts.net:3100'

curl -s "$BASE/api/companies/$COMPANY_ID/issues?status=backlog" \
  -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
issues = json.load(sys.stdin)
for i in sorted(issues, key=lambda x: x.get('identifier','')):
    print(i.get('identifier'), '|', i.get('priority','?'), '|', i.get('title'))
print('Total:', len(issues))
"
```

## Create a backlog issue

Always use `status: backlog` (not `todo` — that triggers agent assignment).

```bash
curl -s -X POST "$BASE/api/companies/$COMPANY_ID/issues" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Issue title",
    "description": "## Problem\n...\n\n## Solution\n...\n\n## Files\n- file: change",
    "projectId": "<project-id>",
    "goalId": "<goal-id>",
    "status": "backlog",
    "priority": "medium"
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('identifier'), d.get('title'), d.get('error',''))"
```

Priority values: `critical`, `high`, `medium`, `low`

## Update an existing issue

Use the CLI (preferred — handles escaping cleanly for long descriptions):

```bash
/Users/home-hub/.npm/_npx/43414d9b790239bb/node_modules/.bin/paperclipai issue update <issueId-uuid> \
  --api-base 'https://njb-m2-mac-mini.tailcfacb3.ts.net:3100' \
  --api-key "$API_KEY" \
  --description "..." \
  --title "..." \
  --priority high \
  --json
```

Or via curl — note the endpoint is `/api/issues/:id` (NOT nested under `/companies/`):

```bash
curl -s -X PATCH "$BASE/api/issues/<issueId-uuid>" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"description": "...", "priority": "high"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('identifier'), d.get('error',''))"
```

To get an issue UUID from its identifier (e.g. TWO-126):
```bash
curl -s "$BASE/api/companies/$COMPANY_ID/issues?status=backlog" -H "Authorization: Bearer $API_KEY" \
  | python3 -c "import sys,json; issues=json.load(sys.stdin); print([i['id'] for i in issues if i.get('identifier')=='TWO-126'][0])"
```

## Search issues

```bash
curl -s "$BASE/api/companies/$COMPANY_ID/issues?q=search+term" \
  -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
issues = json.load(sys.stdin)
for i in issues:
    print(i.get('identifier'), '|', i.get('status'), '|', i.get('title'))
"
```

## Description template

```markdown
## Problem
<what is broken or missing, and why it matters>

## Solution
<what needs to be built/changed>

## Files
- `path/to/file.ts` — what changes
- `path/to/other.ts` — what changes

## Related
<issue IDs of related work, e.g. "Depends on TWO-119">
```

## After creating issues

Update the plan doc (`docs/plans/thesis-signal-monitoring-redesign.md`) to reference the issue identifier(s) rather than duplicating the content inline. The Paperclip backlog is the canonical home for action items.

## Standard workflow

When a conversation identifies follow-up work:
1. Create issue in Paperclip with `status: backlog` and correct project
2. Note the identifier (e.g. TWO-125) in the plan doc or relevant context
3. Do NOT duplicate the full description in both places — one reference is enough
