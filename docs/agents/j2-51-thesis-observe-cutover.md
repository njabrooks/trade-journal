# J2 issue #51 — thesis-observe cutover evidence

Date: 2026-08-07 (Europe/London)

## Authority and previous invocation

Issue-scoped approval is recorded on Trade Journal #51. The previous provider
invocation was:

```text
/opt/homebrew/bin/claude -p /thesis-observe --model opus --dangerously-skip-permissions
```

The live wrapper now calls `scripts/cron/thesis-observe-invocation.sh live`,
which verifies the exact governed Claude adapter digest and declares a maximum
of 14 theses, matching the existing Tier-1 scheduled population. Shadow and
canary modes are bounded to one thesis.

## Shadow comparison

Legacy and governed read-only shadows both loaded 14 due Tier-1 theses / 76
signals, selected the highest-materiality `Bullish Tokenisation` thesis, assessed
its five signals, used current-source and live-price context, preserved the
collector deferral, and proposed no writes. Both refused report, snapshot,
journal, Decision Item, status, and git mutations. The governed result returned
the required structured fields and honestly reported unavailable HYPE/SUI quotes
and prior-close equity prices.

## Canary, rollback, and correction

The first one-thesis canary exposed a real write-boundary violation in the shared
legacy ingestion command: in addition to the permitted report, five snapshots,
and journal history, it emitted seven `intel_items`. The live selector was
immediately rolled back to the exact former `/thesis-observe` command. Thesis,
strategy, and Decision Item fingerprints remained unchanged.

The ingestion script now accepts `--thesis-observe-only`. For a report whose
frontmatter is not `type: thesis-observe` it refuses the flag; for a valid observe
report it suppresses the general `intel_items` path while retaining scoped
signal snapshots and corresponding journal history. Legacy ingestion behavior is
unchanged when the flag is absent. The governed invocation explicitly requires
this flag and refuses an intel-item-writing path.

The corrected one-thesis canary completed successfully:

- one observation artifact;
- five `signal_data_snapshots`, all neutral;
- zero journal rows (no non-neutral evidence);
- zero `intel_items` and zero candidate-signal rows;
- unchanged macro, asset, and strategy status digests; and
- unchanged Decision Items (77 active / 514 inactive).

## Fixed-point review repair

The J2 fixed-point review found that `--thesis-observe-only` suppressed
`intel_items` but still allowed the shared candidate-signal harvester to run.
The corrected canary's zero candidate rows were therefore an observed outcome,
not proof of the governed write boundary.

An executable regression runs a realistic directive report through the public
`ingestReport` seam, real parser, and production ingestion effects against a
controlled database boundary. It proves the exact signal snapshot and corresponding
`signal_evidence_received` journal history, rejects any other database mutation,
and verifies that the intel-item and candidate-signal writers are not invoked.
The unflagged legacy path retains both writers, while a non-thesis-observe report
still refuses the governed flag before any writer is invoked.

This repair required no new live provider invocation, database-writing canary,
scheduler reload, credential use, or operational cutover. The existing bounded
canary and scheduler evidence above remain the operational evidence for #51;
the executable regression supplies the previously missing impossibility proof.

The canary reported that repeated same-day invocations re-observe the same Tier-1
leader because Tier-1's cadence floor is zero. This is confined to explicit
canary reruns; the live launchd job remains once daily at 07:00.

## Preserved controls and rollback

The 07:00 schedule, `RunAtLoad=false`, per-job lock, 3,600-second stale-lock
recovery, 3,000-second process-group timeout, log, status ledger, notification,
off-switch, and always-zero wrapper exit policy are unchanged. Only
`com.trade-journal.thesis-observe` was reloaded and reload did not trigger a run.

Immediate invocation rollback:

```bash
touch logs/.thesis-observe-use-legacy
```

Removing the marker returns to the governed adapter. The selector is tested
against a fake provider and the installed pre-cutover plist is retained at
`/private/tmp/com.trade-journal.thesis-observe.plist.pre-j2-51` during this
cutover.
