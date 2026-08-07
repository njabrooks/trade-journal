# J2 issue #54 — LEAP options-advisor cutover evidence

Date: 2026-08-07 (Europe/London)

## Authority and invocation

Issue-scoped operational approval is recorded on Trade Journal #54. The 15:20
weekday LEAP job now calls `scripts/cron/options-advisor-invocation.sh leap
live`. The selector verifies the exact governed Claude adapter digest, requires
09:30–16:00 America/New_York on a weekday, requires the Radon-managed gateway
on `localhost:4001`, runs only `leap_entry`, and preserves the live 10-ticker
candidate universe and five-recommendation ceiling.

Shadow and canary are bounded to two and one top-ranked tickers respectively,
with a one-recommendation ceiling. The separately migrated morning-batch path
is unchanged.

## Refusal and rollback proofs

The selector exited successfully before a provider call or write when invoked
outside eligible market hours. Tests prove the same refusal when the gateway is
unavailable. Fake-provider tests also prove the exact legacy LEAP command is
restored when `logs/.options-advisor-leap-use-legacy` exists, with governed
JSON-schema arguments absent.

The legacy marker remained present throughout staging. Because the installed
plist invokes repository scripts directly, this guaranteed that an ordinary
live-mode launch continued to use the former command until promotion.

## Eligible-hours shadow

The first governed shadow exposed that the provider backgrounded the long
canonical scan and returned before candidate output existed. It wrote nothing.
The selector was corrected to run the canonical engine synchronously inside the
existing wrapper timeout, hand its complete temporary JSON to the adapter, and
remove that temporary input on exit.

A full 10-ticker corrective attempt then reproduced existing scanner
instability: MU generated a very large invalid-contract response set and the
engine's own 45-minute child timeout terminated it. The wrapper recorded failure
and the database remained unchanged. Live mode retains the historical 10-ticker
scope; shadow and canary were proportionately bounded to avoid treating this
known infrastructure condition as migration evidence.

The final two-ticker shadow completed in eligible US market hours with the
gateway available. It surfaced real GLXY and TSLA candidates, read the current
regime, checked persistence and existing expression, and live-verified contracts
through port 4001. TSLA produced a bounded proposed recommendation; GLXY was
rejected for concentration, weak persistent gap, and a wide live spread.
`writes` remained empty and wrapper status was zero.

## Canary and write proof

The one-ticker canary evaluated GLXY and live-verified all three offered call
structures. It rejected every structure because:

- average HV gap remained below the 15-point persistence bar;
- the position already represented 16.63% of NAV with layered option
  expression; and
- live spreads were approximately 5.3% to 9.2% of midpoint.

The canary returned success with zero recommendations and `writes:[]`. Before
all shadows and after the canary, `leap_entry` state was unchanged:

- 2 historical recommendations;
- 0 active recommendations; and
- latest `created_at` `2026-07-06T16:16:23.479Z`.

No order, trade, execution, preview, staging, credential, database-schema,
Decision Item, or entity-status operation was invoked.

## Preserved controls and promotion

The 15:20 weekday schedule, `RunAtLoad=false`, LEAP-specific lock,
4,200-second stale threshold, 3,600-second process-group timeout, log, status
ledger, notification, off-switch, always-zero wrapper policy, and
recommendation-only save boundary are unchanged. The scheduled 15:20 run during
shadow staging saw the active lock and safely skipped rather than overlapping;
the schedule itself was not changed.

Only `com.trade-journal.options-advisor-leap` was copied and reloaded. It
remained idle after reload, while the morning-batch installed plist stayed
byte-identical. The pre-cutover LEAP plist is retained at
`/private/tmp/com.trade-journal.options-advisor-leap.plist.pre-j2-54` during
this cutover.

Immediate invocation rollback:

```bash
touch logs/.options-advisor-leap-use-legacy
```

Removing the marker returns to governed LEAP mode.

## Repository validation

- accepted W1 checkout clean at `2b6ea3e02ff5ba114b0f91dd779c4afb26181358`;
- repository conformance passed with zero deviations;
- all five governed Capabilities, the immutable Registry Lock, and both staged
  Provider Entry Points passed;
- interactive/headless inventories passed with 37/36 entries and deterministic
  eligibility passed with 14 of 73 entries current;
- provider refusal proof passed for `WS-ENTRY-005` with byte-identical
  diagnostics and no output;
- TypeScript, shell syntax, plist validation, and ticket-scoped ESLint passed;
- eight focused selector tests and the full suite of 406 tests passed; and
- repository-wide ESLint again traversed unrelated generated `.next` files
  under `.claude/worktrees`, emitted the known Babel de-optimization warnings,
  and did not complete during a bounded 60-second attempt. It was interrupted;
  the changed TypeScript scope is clean.

A Next production build was not proportionate for shell, launchd metadata,
inventory, tests, and evidence-only changes. No package, application route, or
runtime bundle changed, so the managed Trade Journal service did not require a
post-build restart.
