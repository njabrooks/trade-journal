# Options Scanner — Operations Runbook

The options scanner runs daily against the IBKR-tradable watchlist and
classifies each underlying's vol regime — `cheap` (long-vol candidates),
`rich` (short-vol / yield-harvest candidates), `mixed`, or `neutral` — using
IV percentile, IV/RV ratio, term structure, and 25Δ skew. Phase 1 produces
snapshots only; strategy synthesis (Phase 2) generates concrete candidates
on the non-neutral side. (Historical note: this was called the
"cheap-options scanner" pre-Phase 1.5, before rich gates were added.)

## Daily automation (on-device launchd, no manual intervention)

The Mac Mini home hub runs a launchd job at **14:50 Europe/London local time,
Mon–Fri**. Because London and New York share DST transitions, London local
stays at NYC+5h year-round — so 14:50 London = 09:50 NYC every weekday,
20 min after the opening auction clears, with no DST cron pair needed.

- Plist: `launchd/com.trade-journal.options-scanner.plist`
- Installer: `launchd/install.sh` (or `launchctl load ~/Library/LaunchAgents/com.trade-journal.options-scanner.plist`)
- Log: `logs/options-scanner.log`
- Manual trigger: `launchctl start com.trade-journal.options-scanner`
- Status: `launchctl list | grep options-scanner`

Steps the job runs (sequentially, fail-fast):
1. `git pull --ff-only` — pick up latest scanner config from main
2. `scripts/ingest-radar-back-months.ts` — Massive monthly chains 1M–9M for radar tickers (~7 min)
3. `scripts/scan-cheap-options.ts` — compute metrics + write `vol_scan_ticker_snapshots` (~30 sec)

Why on-device, not GitHub Actions: the GH Actions cron for this workflow was
delayed by 1.5–3 hours every fire and skipped entirely on busy days (5/15:
65 + 99 min late; 5/18: no fire at all by 15:25 UTC). Other repo workflows
on the same shared runners fired on time, so the issue was specific to this
slot's resource footprint hitting the shared-runner throttle. The Mac Mini
runs the scanner predictably in <10 min with no queue contention.

A workflow_dispatch-only `.github/workflows/options-scanner.yml` is
kept as a cloud fallback (use `gh workflow run options-scanner.yml`
when the Mac Mini is offline).

Daily Massive ingest (`scripts/ingest-underlyings-massive.ts`, 21:30 UTC) still
runs on GitHub Actions and populates `iv30`, `spot`, `rv20`, `atr20` into
`underlyings_iv_history`, mirroring latest values into the `underlyings.*` cache.

### Data freshness & Massive plan tier

Massive plan: **Options Starter** ($29/mo).
- Daily option chain snapshots with greeks, IV, and open interest — what the scanner consumes
- Minute aggregates + 2y historical (used by `ingest-radar-back-months`)
- NBBO quotes are **15 min delayed** under this tier; the scanner does not use NBBO, so this is not a constraint
- Real-time NBBO would require Options Developer ($79/mo) — not currently warranted

When the UI displays a quoted price on a synthesised strategy, the underlying
quote comes from Massive's chain snapshot endpoint (daily resolution). For
intra-day live mids, the user runs the `ibkr-quote` skill which goes through
IBKR's Client Portal API, not Massive.

## Optional: IBKR supplement (manual, when Gateway is up)

When IB Gateway / TWS is logged in, run:

```bash
cd ~/projects/trade-journal
python3 scripts/ingest-ibkr-chains.py
```

This pulls higher-quality chains (model greeks via TWS) for the same radar
tickers and stores them in `options_chain_snapshots` with `source='ibkr'`. The
scanner prefers IBKR rows over Massive when both are present for the same
(ticker, snapshot_date).

### Prerequisites

- IB Gateway / TWS running and logged in. Check with:
  ```bash
  lsof -i :4001 -i :4002 -i :7496 -i :7497
  ```
- 2FA approved (only required Mon morning if Radon's `local.ibc-gateway`
  launchd service is active; otherwise required on every cold start)
- Radon project at `/Users/home-hub/projects/radon/` with `.venv` populated
  (the script imports `ib_insync` from Radon's venv and `IBClient` from
  `radon/scripts/clients/ib_client.py`)

### Common flags

```bash
# Preflight only — confirms watchlist + checks Gateway port
python3 scripts/ingest-ibkr-chains.py --dry-run

# Specific tickers (overrides watchlist)
python3 scripts/ingest-ibkr-chains.py NVDA TSLA META

# TWS Paper instead of IB Gateway Live
python3 scripts/ingest-ibkr-chains.py --port 7497

# Narrower strike window (default ±20% of spot)
python3 scripts/ingest-ibkr-chains.py --strike-pct 0.10

# Subset of expiries (default 1-9 months ahead)
python3 scripts/ingest-ibkr-chains.py --months 1 3 6
```

### Re-run the scanner after IBKR ingest

The scheduled GitHub Action runs the scanner once daily. To incorporate fresh
IBKR data into the same day's scan, trigger manually:

```bash
npx tsx scripts/scan-cheap-options.ts
```

It upserts on `(run_date, universe_source)` so re-running the same day updates
the existing snapshot rows. Watch for `src=ibkr` in the per-ticker output —
those rows are now using the higher-quality data.

## Watchlist management

```bash
# Add a ticker (auto-creates underlying if missing)
npx tsx scripts/ops/add-to-watchlist.ts --ticker UVXY --reason "vol hedge" --priority high

# Deactivate (keeps row for audit, scanner ignores)
npx tsx scripts/ops/deactivate-watchlist-entry.ts --ticker BTC

# Reactivate
npx tsx scripts/ops/deactivate-watchlist-entry.ts --ticker BTC --activate

# Re-seed from current portfolio (idempotent — only adds new IBKR-tradable tickers)
npx tsx scripts/seed-watchlist.ts --dry-run  # preview
npx tsx scripts/seed-watchlist.ts            # write
```

## Backfilling rv20 + atr20

If you reset the database or extend the lookback, re-run:

```bash
npx tsx scripts/backfill-rv20-atr20.ts --years 2
```

Idempotent. Reads from Massive daily aggregates, computes rv20 (annualized
stdev of log returns over trailing 20 days) and atr20 (avg true range over
trailing 20 bars), writes per-day rows to `underlyings_iv_history`, and
mirrors the latest values into `underlyings.*` cache.

## Dual-regime detection

Scanner classifies every ticker into one of four regimes:

| Regime | Meaning | Use cases |
|--------|---------|-----------|
| `cheap` | IV is low absolutely (pct ≤ 30) OR cheap vs realized (IV/RV ≤ 1.10), AND term structure supportive | Long options: protective puts, bull/bear debit spreads, LEAPs, calendars |
| `rich` | IV is high absolutely (pct ≥ 70) OR fat vol risk premium (IV/RV ≥ 1.30), AND term structure stressed | Short options: covered calls, cash-secured puts, credit spreads, iron condors |
| `neutral` | Neither extreme triggers | No strong vol edge — trade directionally or wait |
| `mixed` | Both cheap and rich flags trigger (e.g., high historical percentile but low IV/RV ratio) | Judgment call — current vs historical signals conflict |

Both `cheapness_score` and `richness_score` (0-100) are computed for every ticker regardless of final regime — useful for borderline cases.

## Inspecting results

```sql
-- Today's cheap candidates
SELECT s.ticker, s.data_source, s.iv_percentile_252, s.iv_rv20_ratio,
       s.term_structure_slope, s.skew_25d, s.cheapness_score
FROM vol_scan_ticker_snapshots s
JOIN vol_scan_runs r ON r.id = s.run_id
WHERE r.run_date = CURRENT_DATE AND s.regime = 'cheap'
ORDER BY s.cheapness_score DESC;

-- Today's rich candidates (yield harvest)
SELECT s.ticker, s.data_source, s.iv_percentile_252, s.iv_rv20_ratio,
       s.term_structure_slope, s.skew_25d, s.richness_score,
       s.has_open_position
FROM vol_scan_ticker_snapshots s
JOIN vol_scan_runs r ON r.id = s.run_id
WHERE r.run_date = CURRENT_DATE AND s.regime = 'rich'
ORDER BY s.richness_score DESC;

-- Mixed-regime tickers needing judgment
SELECT s.ticker, s.iv_percentile_252, s.iv_rv20_ratio,
       s.cheapness_score, s.richness_score
FROM vol_scan_ticker_snapshots s
JOIN vol_scan_runs r ON r.id = s.run_id
WHERE r.run_date = CURRENT_DATE AND s.regime = 'mixed';

-- Source coverage today (which tickers have IBKR vs only Massive)
SELECT ticker,
       MAX(CASE WHEN source = 'ibkr' THEN 1 ELSE 0 END) AS has_ibkr,
       MAX(CASE WHEN source = 'massive' THEN 1 ELSE 0 END) AS has_massive
FROM options_chain_snapshots
WHERE snapshot_date = CURRENT_DATE
GROUP BY ticker
ORDER BY ticker;
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Scanner shows `slope=n/a skew=n/a` for everything | Radar back-months ingest hasn't run today | Run `npx tsx scripts/ingest-radar-back-months.ts` |
| Scanner shows `iv/rv=n/a` | `underlyings_iv_history.rv20` not populated for the ticker | Run `npx tsx scripts/backfill-rv20-atr20.ts <ticker>` |
| `underlyings.spot/iv30/rv20` stale | Daily Massive ingest hasn't run | `npx tsx scripts/ingest-underlyings-massive.ts` |
| IBKR script: "Gateway not listening on :4001" | IB Gateway / TWS down or wrong port | Start Gateway, log in (2FA cold start), check `lsof -i :4001` |
| IBKR script: "could not qualify underlying" | Ticker can't be resolved as Stock or Future on IB | Manually verify symbol in TWS; may need exchange/currency override |
| Scanner src column shows `massive` even after IBKR run | IBKR run failed or wrote zero rows | Check IBKR script output for ticker errors |

## Cross-references

- **Radon IBKR infrastructure**: see auto-memory `reference_radon_ibkr.md`
- **LEAP scanning (future Phase 3)**: see auto-memory `reference_radon_leap_scan.md`
- **Design intent**: see auto-memory `project_options_scanner.md`
