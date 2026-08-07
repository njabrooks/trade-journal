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

## Fixed-point review repair

The 2026-08-07 J2 fixed-point review correctly found that the market-sensitive
canary proved only the no-write path: no recommendation survived verification,
so it did not prove the positive persistence and dashboard result contract.

The repair drives the real `batch canary` wrapper path through `run_governed`
and exact adapter-digest validation, substituting only a deterministic provider
boundary with no network, market-data, database, or trade capability. The
fixture records an eligible `morning-batch` opportunistic request with
`maxRecommendations=1`, two candidate recommendations, and delayed quotes with
real bids, asks, and midpoints. The proof applies the production scenario,
contract-identity verification, and maximum gates before calling only the
approved writer with an in-memory recommendation store. Executable tests prove
that the governed path:

- supersedes only active recommendations for `opportunistic`;
- inserts exactly one verified recommendation despite two eligible candidates;
- preserves ticker, exposure, NAV percentage, structure, metrics, volatility
  context, rationale, and `source=skill` fields consumed by ScannerSnapshot;
- applies the existing seven-day expiry contract; and
- refuses both empty-candidate and unavailable-verification outcomes before
  resolving underlyings, superseding a batch, or inserting a row;
- rejects a recommendation whose verification belongs to another ticker; and
- refuses scenarios outside the accepted six morning scenarios;
- requires one-to-one usable quotes for every selected contract leg.

The dashboard contract test then passes the writer-produced row through the
actual `/api/advisor/recommendations` GET serializer and ScannerSnapshot's
presentation function. The recorded effect set contains only underlying
resolution, same-scenario supersession, and recommendation insertion, proving
the strict no-order/no-trade boundary. This repair used no provider session,
credential, database write, market-data call, scheduler reload, launchd change,
or live canary. The existing `live` invocation and rollback marker are
unchanged.

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
- TypeScript and ticket-scoped ESLint passed;
- the wrapper, writer, dashboard-contract, and governed-Capability focused
  suite passed 21 tests;
- the full suite passed 419 tests with one pre-existing skipped test;
- the repository-wide ESLint baseline completed but failed on unrelated old
  `.claude/worktrees`, generated `.next` bundles, and `tmp/pdfs` content; it
  reported no finding in the changed scope; and
- the production build passed, the managed `com.tradej` service was restarted,
  and `/dashboard/portfolio` returned HTTP 200 afterward.

No package or lock file changed, so the npm 10 clean-install dry-run was not
required.
