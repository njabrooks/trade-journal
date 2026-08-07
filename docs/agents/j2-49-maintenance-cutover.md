# J2 issue #49 — maintenance cutover evidence

Date: 2026-08-07 (Europe/London)

## Authority and scope

The maintainer's issue-scoped approval is recorded on
[Trade Journal #49](https://github.com/njabrooks/trade-journal/issues/49#issuecomment-5214036143).
It authorizes bounded shadow and canary validation and, on success, changing and
reloading only the live maintenance invocation. It does not authorize Decision
Item resolution, entity-status changes, credential or schema changes, or another
job's cutover.

The live checkout was clean at `3e927af5ba7235c2ff59a8b87327e45aa8926668`.
All linked worktrees were clean except one older branch whose uncommitted
`.claude/skills/maintenance/SKILL.md` bytes exactly matched clean `main`; launchd
targets the clean main checkout. Native predecessor #48 was closed.

## Previous and governed invocations

Previous provider invocation:

```text
/opt/homebrew/bin/claude -p /maintenance --model opus --dangerously-skip-permissions
```

The live wrapper now delegates to `scripts/cron/maintenance-invocation.sh live`.
That shim verifies the locked `belief-maintenance-claude` adapter digest, supplies
an explicit per-lane bound, preserves Opus and the existing permission mode, and
requires the governed structured result. The existing `.env.local` values are
exported to the process without being printed or changed.

## Shadow comparison

Both the bounded legacy shadow and governed shadow read the same dashboard:

- relate-research cursor `2026-08-06T00:00:00Z`, with 0 new insights;
- worklists: digest 0, signal derivation 0, signal thin 1, health 39,
  research gap 1, retrospective 0, framing 1, classify exposure 0, and
  re-underwrite due 19;
- 60 actionable items total; and
- the first bounded candidate was the `Bullish Tokenisation` macro-thesis health pass.

Both shadows performed zero writes, left the cursor unchanged, created and
resolved no Decision Items, and reported the remaining downstream work. The
governed retry returned `success: true`, `dryRun: true`, a global item bound of
one, `writes: []`, identical cursor-before/cursor-after values, and `errors: []`.

The first governed shadow exposed that standalone database scripts did not
inherit the repository environment. The invocation shim was corrected to export
the existing environment before execution, and the clean shadow was repeated
before canary.

## Canary

The real wrapper ran once with `TJ_MAINTENANCE_RUN_MODE=canary`, retaining its
lock and 2,400-second process-group timeout. It completed successfully and wrote
exactly one authorized maintenance result:

- journal row `f3bb4248-ae89-4f30-b132-3dd3916510e6`, action
  `thesis_health_check`, source `automation`;
- `Bullish Tokenisation` review clock advanced after reassessing five signals;
- no signal snapshot was written because no verdict materially changed; and
- a possible weakening Decision Item was deduplicated against an existing active
  item, so no new Decision Item was created.

Before/after refusal proofs:

- macro status digest remained `66b9ece916b858481f11e5d9052974f4`;
- asset status digest remained `2379c169521dfb2cabb41b805ea81b36`;
- Decision Items remained 77 active and 514 inactive (none resolved);
- relate-research cursor remained `2026-08-06T00:00:00Z`;
- journal count increased by exactly one, from 11,532 to 11,533; and
- health-due decreased by exactly one, from 39 to 38 (actionable 60 to 59).

The wrapper recorded `maintenance-canary` with result 0 and released its lock.

## Preserved controls and rollback

The launchd schedule remains 08:00 and 20:00 local time with `RunAtLoad=false`.
The wrapper retains its per-job lock, 3,000-second stale-lock recovery,
process-group timeout, maintenance log, `cron-status.tsv` result, macOS failure
notification, and always-zero wrapper exit policy after recording the provider
result. The installed plist matches the repository and only
`com.trade-journal.maintenance` was reloaded; reload did not trigger a run.

The immediate invocation rollback is:

```bash
touch logs/.maintenance-use-legacy
```

The next scheduled maintenance run then uses the exact previous `/maintenance`
command. Removing the marker returns to the governed adapter. This selection was
tested with a fake provider process, including an assertion that the governed
JSON-schema arguments are absent on rollback. The pre-cutover installed plist is
also preserved temporarily at
`/private/tmp/com.trade-journal.maintenance.plist.pre-j2-49` for operational
recovery during this cutover.

The maintenance off-switch is unchanged:

```bash
launchctl bootout gui/$(id -u)/com.trade-journal.maintenance
```

## Repository validation

- accepted W1 checkout clean at `2b6ea3e02ff5ba114b0f91dd779c4afb26181358`;
- repository conformance passed with 0 deviations;
- all five governed Capabilities, the immutable Registry Lock, and both staged
  Provider Entry Points passed in human and JSON modes;
- interactive/headless inventories passed with 37/36 entries and deterministic
  eligibility passed with 14 of 73 entries current;
- provider refusal proof passed for `WS-ENTRY-005` with byte-identical
  diagnostics and no output;
- TypeScript and ticket-scoped ESLint passed;
- focused invocation/inventory tests passed (16), and the full suite passed
  (392); and
- shell syntax and launchd plist validation passed.

The full repository ESLint command again traversed unrelated generated `.next`
content under `.claude/worktrees`, emitted Babel de-optimization warnings, and
did not complete within the bounded run; it was interrupted. Ticket-scoped
ESLint is clean. A Next production build was not proportionate because this
change touches only the provider shell/launchd/documentation boundary and no
application or package code; therefore no service restart was required.
