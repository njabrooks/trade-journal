# J2 issue #56 — morning-brief cutover evidence

Date: 2026-08-07 (Europe/London)

## Authority and invocation

Issue-scoped operational approval and separate consent to send the bounded live
morning-brief bundle to Claude are recorded in the implementation session. The
08:45 daily job now calls `scripts/cron/morning-brief-invocation.sh live`. The
selector verifies the exact governed Claude adapter digest and permits only the
deterministic `scripts/morning-brief-data.ts --json` bundle and one same-date
`scripts/ops/save-morning-brief.ts --stdin` upsert.

No credential, schema, belief-layer, Decision Item, recommendation, trade, or
entity-status operation is permitted by the selector.

## Shadow and refusal proofs

The legacy and governed read-only shadows both produced complete briefs from
fresh portfolio, thesis-observe, options-advice, regime, decision, sizing,
execution-pattern, and calendar evidence. Both ranked the concentrated rates
complex and aged Decision Item backlog among the principal attention items.
Both returned `persisted:false`, made no save call, and reported no errors.

The first governed shadow exposed an output-schema defect: unconstrained
`freshness` and `write` fields were coerced to strings. Promotion remained
disabled. The schema was corrected to require structured freshness, a bounded
five-item attention list, and object-or-null write evidence. A second governed
shadow then returned a freshness object and `write:null`; focused tests pin
those types and the explicit belief-layer refusal.

The rollback marker `logs/.morning-brief-use-legacy` remained present during
all shadow work. Tests prove that an ordinary live invocation with that marker
uses the exact former `/morning-brief` command and omits governed JSON-schema
arguments.

## Canary and idempotence proof

There was no `morning_briefs` row for `2026-08-07` before the canary. The first
governed canary invoked the sole save operation exactly once and inserted one
five-item row with id `467cb09d-cde2-479d-88ba-069c8456d0fb`. A second bounded
canary used the same date and returned the same id with `superseded:true`.
Database verification found exactly one row: `created_at` remained
`2026-08-07T15:59:03.916Z` and `updated_at` advanced to
`2026-08-07T16:04:09.955Z`.

Pre- and post-canary status fingerprints were identical:

- `macro_theses`: 41, `66b9ece916b858481f11e5d9052974f4`;
- `asset_theses`: 72, `2379c169521dfb2cabb41b805ea81b36`;
- `main_claims`: 2,146, `387c2fe2b28213fd8d965b908687e510`;
- `signals`: 1,090, `e977606065b379a279b26a87db647859`;
- `strategies`: 236, `c92608be79a2b94e7ef4474fece3654f`; and
- open Decision Items: 77 before and after.

## Preserved controls and promotion

The 08:45 daily schedule, `RunAtLoad=false`, per-job lock, 3,600-second stale
threshold, 1,800-second process-group timeout, log, status ledger,
notification, always-zero wrapper policy, single-upsert boundary, off-switch,
and rollback route are preserved.

Only `com.trade-journal.morning-brief` was copied and reloaded. It was idle
after reload with an active 08:45 calendar trigger. The pre-cutover plist is
retained at `/private/tmp/com.trade-journal.morning-brief.plist.pre-j2-56`
during this cutover.

Immediate invocation rollback:

```bash
touch logs/.morning-brief-use-legacy
```

Removing the marker returns to governed mode.

## Repository validation

- accepted W1 checkout clean at
  `2b6ea3e02ff5ba114b0f91dd779c4afb26181358`;
- repository conformance passed with zero deviations;
- all five governed Capabilities, the immutable Registry Lock, and both staged
  Provider Entry Points passed;
- interactive/headless inventories passed with 37/36 entries and deterministic
  eligibility passed with 14 of 73 entries current;
- provider refusal proof passed for `WS-ENTRY-005` with byte-identical
  diagnostics and no output;
- shell syntax, plist validation, TypeScript, ticket-scoped ESLint, and four
  focused selector/refusal tests passed;
- legacy/governed shadow parity, structured output typing, the sole permitted
  write, same-date idempotence, and no-mutation fingerprints passed; and
- the full suite passed with 410 tests across 40 files.

Repository-wide ESLint again traversed unrelated generated `.next` files under
`.claude/worktrees`, emitted the known Babel de-optimization warnings, and did
not complete during a bounded 60-second attempt. It was interrupted; the
changed TypeScript scope is clean. An initial concurrent inventory-validation
attempt also hit a sandbox-only `tsx` IPC socket denial; sequential host runs
of both inventories and eligibility passed, so this was infrastructure rather
than a regression.

A Next production build is not proportionate for shell, launchd metadata,
inventory, tests, and evidence-only changes. No package, application route, or
runtime bundle changed, so the managed Trade Journal service does not require
a post-build restart.
