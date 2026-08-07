# J2 issue #53 — morning options-advisor cutover evidence

Date: 2026-08-07 (Europe/London)

## Authority and invocation

Issue-scoped operational approval is recorded on Trade Journal #53. The 08:05
weekday batch now calls `scripts/cron/options-advisor-invocation.sh batch live`.
The selector verifies the exact governed Claude adapter digest and limits the
request to hedge, income, collar, put_entry, risk_reversal, and opportunistic,
with at most five recommendations. The separately scheduled LEAP path remains
on the exact legacy command for issue #54.

## Shadow comparison

The legacy and governed read-only shadows both evaluated all six morning
scenario families against the current CRI LOW / VCG NORMAL regime, portfolio,
chains, thesis context, standing constraints, and Radon-backed IB verification.
Both respected the GLXY downside-protection constraint and produced no writes.

The governed shadow judged six candidates but removed every one after seven
option legs qualified without a live bid, ask, or midpoint. Its structured
result contained zero recommendations and `writes:[]`. This is expected at
08:05 Europe/London: the US options session has not opened. The governed
contract therefore refuses to replace live verification with a fabricated or
stale recommendation.

## Canary and write proof

The canary ran through the real scheduled wrapper with only the opportunistic
scenario and `maxRecommendations=1`. It selected one genuine SLV long-vol
candidate, then removed it because four verification probes, including a liquid
SPY control, returned no market while US options were closed. It persisted
nothing and completed with a successful canary status.

Before shadows and after the canary, `advisor_recommendations` was unchanged:

- 136 total recommendations;
- 6 active recommendations; and
- latest `created_at` `2026-08-07T07:23:01.465Z`.

The first wrapper attempt from a restricted test context could not see the
machine-local provider login and recorded status 1 without writes. Re-running
in the same host context as launchd succeeded without changing credentials.

## Preserved controls and rollback

The 08:05 weekday schedule, `RunAtLoad=false`, batch-specific lock, 3,000-second
stale threshold, 2,400-second process-group timeout, log, status ledger,
notification, off-switch, and always-zero wrapper exit policy are unchanged.
The adapter permits only recommendation-batch persistence through
`scripts/ops/save-advisor-recommendations.ts --stdin` and explicitly refuses
order, trade, preview, staging, execution, and broker mutation operations.

Immediate invocation rollback:

```bash
touch logs/.options-advisor-batch-use-legacy
```

Removing the marker returns the batch to the governed adapter. Reload affects
only `com.trade-journal.options-advisor`; the LEAP plist is neither copied nor
reloaded by this cutover.

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
- four focused invocation tests and the full suite of 402 tests passed; and
- the repository-wide ESLint baseline again traversed unrelated generated
  `.next` files under `.claude/worktrees`, emitted Babel de-optimization
  warnings, and did not complete during a bounded 60-second attempt. It was
  interrupted; the changed TypeScript scope is clean.

A Next production build was not proportionate for shell, launchd metadata,
inventory, tests, and evidence-only changes. No package, application route, or
runtime bundle changed, so the managed Trade Journal service did not require a
post-build restart.
