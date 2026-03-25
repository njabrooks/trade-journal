/**
 * Signal Data Collection Orchestrator
 *
 * Reads all active thesis signals with explicit_details, dispatches to
 * the appropriate data collector, and stores snapshots in signal_data_snapshots.
 *
 * When a signal's pct_to_threshold reaches >= 100%, it is auto-completed:
 * - Signal status updated to 'complete'
 * - Thesis triage record created (if thesis-linked via signal_entity_links)
 * - Journal entry logged
 *
 * Usage:
 *   npx tsx scripts/collect-signal-data.ts              # Collect all quantitative signals
 *   npx tsx scripts/collect-signal-data.ts --dry-run     # Show what would be collected without writing
 *   npx tsx scripts/collect-signal-data.ts --skip-triggers # Collect data but skip threshold triggers
 */

import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { collectDefiLlama } from './lib/collectors/defillama.js';
import { collectCoinGecko } from './lib/collectors/coingecko.js';
import { collectHypeFlows } from './lib/collectors/hypeflows.js';
import { collectInternalDb } from './lib/collectors/internal-db.js';
import { collectTradingView, fetchPrices } from './lib/collectors/tradingview.js';
import { collectDerived } from './lib/collectors/derived.js';
import { collectHormuz } from './lib/collectors/hormuz.js';
import { collectWorldBank } from './lib/collectors/worldbank.js';
import { collectSecEdgar } from './lib/collectors/sec-edgar.js';
import { collectFred } from './lib/collectors/fred.js';
import { collectDefiLlamaStablecoins } from './lib/collectors/defillama-stablecoins.js';

const { signals, signalDataSnapshots, signalEntityLinks, thesisTriageRecords, underlyings } = schema;

// Extract base ticker from a TradingView symbol (e.g. CRYPTO:HYPEHUSD → HYPE, NASDAQ:GLXY → GLXY)
function extractBaseTicker(tvSymbol: string): string {
  const raw = tvSymbol.split(':').pop() ?? tvSymbol;
  return raw.replace(/(HUSD|USD|BTC|ETH|USDT|USDC)$/, '') || raw;
}

interface CollectorResult {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

async function collectForSignal(
  signalId: string,
  dataSource: string,
  details: Record<string, unknown>
): Promise<CollectorResult | null> {
  switch (dataSource) {
    case 'defillama':
      return collectDefiLlama(details);
    case 'coingecko':
      return collectCoinGecko(details);
    case 'hypeflows':
      return collectHypeFlows(details);
    case 'internal_db':
      return collectInternalDb(details);
    case 'tradingview_cdp':
      return collectTradingView(details);
    case 'derived':
    case 'economic_calendar':
      // economic_calendar signals use calculation: 'days_until_event' or
      // 'event_actual_vs_forecast' — both are handled by collectDerived
      return collectDerived(details);
    case 'hormuz_strait':
      return collectHormuz(details);
    case 'worldbank':
      return collectWorldBank(details);
    case 'sec_edgar':
      return collectSecEdgar(details);
    case 'fred':
      return collectFred(details);
    case 'defillama_stablecoins':
      return collectDefiLlamaStablecoins(details);
    default:
      return null;
  }
}

/**
 * Check if a signal has reached its threshold and trigger completion if so.
 * Only triggers for active signals with pct_to_threshold >= 100.
 *
 * When triggered:
 * 1. Updates signal status to 'complete'
 * 2. Creates a thesis_triage_record if the signal is thesis-linked (via signal_entity_links)
 * 3. Logs a journal entry on the signal
 */
async function checkAndTriggerSignal(
  signal: { id: string; type: string; statement: string; status?: string },
  pctToThreshold: number,
  dryRun: boolean
): Promise<boolean> {
  // Only trigger if threshold is reached
  if (pctToThreshold < 100) return false;

  // Only trigger for active signals (prevents double-trigger)
  if (signal.status !== 'active') return false;

  const shortStatement = signal.statement.slice(0, 80);
  console.log(`\n  >> TRIGGERED: ${shortStatement} (${pctToThreshold.toFixed(1)}% of threshold)`);

  if (dryRun) {
    console.log(`  >> (DRY RUN — would mark complete, create triage record, log journal entry)`);
    return true;
  }

  // 1. Update signal status to 'complete'
  await db
    .update(signals)
    .set({ status: 'complete' })
    .where(eq(signals.id, signal.id));

  console.log(`  >> Signal status updated to 'complete'`);

  // 2. Resolve thesis links and create triage records + thesis-level journal entries
  const resolvedThesisLinks = await resolveSignalThesisLinks(signal.id);

  for (const { thesisId, thesisType, thesisTitle } of resolvedThesisLinks) {
    await db.insert(thesisTriageRecords).values({
      thesisId,
      thesisType,
      thesisTitle,
      triggerType: 'signal_recommendation',
      triggerSource: 'collect-signal-data',
      contentSummary: {
        signalId: signal.id,
        signalType: signal.type,
        signalStatement: signal.statement,
        pctToThreshold,
      },
      aiAnalysis: {},
      matchedResults: [],
      severity: signal.type === 'invalidation' ? 'urgent' : 'attention',
      status: 'inbox',
      actionRequired: `Signal triggered: ${signal.statement}`,
      triageRule: 'REVIEW_DATA',
    });

    console.log(`  >> Thesis triage record created for ${thesisType} thesis: ${thesisTitle}`);
  }

  // 3. Log journal entry on the signal
  await logToJournal({
    objectType: 'signal',
    objectId: signal.id,
    objectTitle: signal.statement,
    actionType: 'status_change',
    actionDescription: `Signal auto-completed: threshold reached (${pctToThreshold.toFixed(1)}%). ${signal.type === 'invalidation' ? 'Invalidation' : 'Confirmation'} signal triggered.`,
    previousState: { status: 'active' },
    newState: { status: 'complete' },
    source: 'automation',
    metadata: { pctToThreshold, triggeredBy: 'collect-signal-data' },
  });

  // 4. Log thesis-level signal_evidence_received journal entries
  for (const { thesisId, thesisType, thesisTitle } of resolvedThesisLinks) {
    await logToJournal({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesisTitle,
      actionType: 'signal_evidence_received',
      actionDescription: `Signal "${shortStatement}" reached threshold (${pctToThreshold.toFixed(1)}%) — ${signal.type} signal triggered`,
      source: 'automation',
      metadata: {
        signalId: signal.id,
        assessment: 'confirmed',
        dataSource: 'collect-signal-data',
        pctToThreshold,
      },
    });
  }

  console.log(`  >> Journal entries logged`);

  return true;
}

const MILESTONES = [25, 50, 75, 90];

/** Milestones significant enough to journal at thesis level */
const THESIS_JOURNAL_MILESTONES = [75, 90];

/**
 * Resolve thesis links for a signal via signal_entity_links.
 * Returns array of { thesisId, thesisType, thesisTitle }.
 */
async function resolveSignalThesisLinks(
  signalId: string
): Promise<Array<{ thesisId: string; thesisType: string; thesisTitle: string }>> {
  const links = await db
    .select({
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
    })
    .from(signalEntityLinks)
    .where(
      and(
        eq(signalEntityLinks.signalId, signalId),
        eq(signalEntityLinks.entityType, 'thesis')
      )
    );

  const results: Array<{ thesisId: string; thesisType: string; thesisTitle: string }> = [];
  for (const link of links) {
    if (!link.thesisId || !link.thesisType) continue;
    let title = 'Unknown thesis';
    if (link.thesisType === 'macro') {
      const rows = await db.select({ title: schema.macroTheses.title })
        .from(schema.macroTheses).where(eq(schema.macroTheses.id, link.thesisId));
      if (rows[0]) title = rows[0].title;
    } else {
      const rows = await db.select({ title: schema.assetTheses.title })
        .from(schema.assetTheses).where(eq(schema.assetTheses.id, link.thesisId));
      if (rows[0]) title = rows[0].title;
    }
    results.push({ thesisId: link.thesisId, thesisType: link.thesisType, thesisTitle: title });
  }
  return results;
}

/**
 * Check if pctToThreshold has newly crossed any milestone (25%, 50%, 75%, 90%).
 * Only fires when the threshold is newly crossed (previous was below, current is at/above).
 * At 75% and 90%, also writes thesis-level signal_evidence_received journal entries.
 */
async function checkMilestones(
  signal: { id: string; statement: string },
  pctToThreshold: number,
  previousPct: number | null,
  dryRun: boolean
): Promise<number> {
  const prevPct = previousPct ?? 0;
  let milestonesHit = 0;

  for (const milestone of MILESTONES) {
    if (pctToThreshold >= milestone && prevPct < milestone) {
      console.log(`    📊 Milestone: ${milestone}% of threshold reached`);
      if (!dryRun) {
        await logToJournal({
          objectType: 'signal',
          objectId: signal.id,
          objectTitle: signal.statement,
          actionType: 'quantitative_milestone',
          actionDescription: `Signal at ${milestone}% of threshold (${pctToThreshold.toFixed(1)}% current)`,
          source: 'automation',
          metadata: { milestone, pctToThreshold },
        });

        // Write thesis-level journal entries for significant milestones
        if (THESIS_JOURNAL_MILESTONES.includes(milestone)) {
          const thesisLinks = await resolveSignalThesisLinks(signal.id);
          const shortStatement = signal.statement.slice(0, 80);
          for (const { thesisId, thesisType, thesisTitle } of thesisLinks) {
            await logToJournal({
              objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
              objectId: thesisId,
              objectTitle: thesisTitle,
              actionType: 'signal_evidence_received',
              actionDescription: `Signal "${shortStatement}" at ${milestone}% of threshold — approaching trigger`,
              source: 'automation',
              metadata: {
                signalId: signal.id,
                assessment: 'strengthening',
                dataSource: 'collect-signal-data',
                pctToThreshold,
                milestone,
              },
            });
          }
        }
      }
      milestonesHit++;
    }
  }
  return milestonesHit;
}

let triggeredCount = 0;
let milestoneCount = 0;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipTriggers = process.argv.includes('--skip-triggers');
  const now = new Date();

  // Truncate to start-of-day UTC for dedup: the unique constraint on
  // (signal_id, snapshot_date, data_source) only works if we use a
  // consistent date per day, not a precise timestamp per run.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  console.log(`Signal Data Collection — ${now.toISOString()}`);
  if (dryRun) console.log('(DRY RUN — no data will be written)');
  if (skipTriggers) console.log('(SKIP TRIGGERS — threshold triggers disabled)');
  if (dryRun || skipTriggers) console.log('');

  // Load all active thesis signals with explicit_details (via junction table)
  const activeSignalRows = await db
    .selectDistinctOn([signals.id], {
      id: signals.id,
      type: signals.type,
      status: signals.status,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(
      and(
        eq(signalEntityLinks.entityType, 'thesis'),
        eq(signals.status, 'active')
      )
    );
  const activeSignals = activeSignalRows;

  console.log(`Active thesis signals: ${activeSignals.length}\n`);

  // Fetch last collection date per signal for checkFrequency enforcement
  const lastCollected = await db.execute<{ signal_id: string; last_date: string }>(sql`
    SELECT signal_id, max(snapshot_date)::text as last_date
    FROM signal_data_snapshots
    WHERE observed_value IS NOT NULL
      AND data_source NOT LIKE 'price_history%'
      AND data_source != 'thesis_monitor'
    GROUP BY signal_id
  `);
  const lastCollectedMap = new Map(lastCollected.map(r => [r.signal_id, new Date(r.last_date)]));

  // Fetch previous pct_to_threshold per signal for milestone detection
  const prevPctRows = await db.execute<{ signal_id: string; pct: string }>(sql`
    SELECT DISTINCT ON (signal_id) signal_id, pct_to_threshold as pct
    FROM signal_data_snapshots
    WHERE pct_to_threshold IS NOT NULL
      AND data_source NOT LIKE 'price_history%'
      AND data_source != 'thesis_monitor'
    ORDER BY signal_id, snapshot_date DESC
  `);
  const prevPctMap = new Map(prevPctRows.map(r => [r.signal_id, parseFloat(r.pct)]));

  let collected = 0;
  let skipped = 0;
  let frequencySkipped = 0;
  let errors = 0;

  for (const signal of activeSignals) {
    const details = signal.explicitDetails as Record<string, unknown> | null;
    if (!details) {
      skipped++;
      continue;
    }

    // Check frequency enforcement: skip if collected within the configured window
    const checkFrequency = (details.checkFrequency as string) || 'daily';
    const lastDate = lastCollectedMap.get(signal.id);
    if (lastDate) {
      const hoursSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
      const intradayMatch = checkFrequency.match(/^(\d+)h$/);
      let minHours: number;
      if (intradayMatch) {
        // Intraday frequencies like '4h', '6h' — enforce minimum gap (with 30min grace)
        minHours = parseInt(intradayMatch[1], 10) - 0.5;
      } else if (checkFrequency === 'weekly') {
        minHours = 6 * 24; // 6 days
      } else {
        minHours = 0; // daily: always collect (dedup handled by snapshot_date)
      }
      if (hoursSince < minHours) {
        frequencySkipped++;
        continue;
      }
    }

    const topLevelSource = details.dataSource as string | undefined;
    const conditions = details.conditions as Array<Record<string, unknown>> | undefined;

    // Determine what to collect:
    // - Single-source signals: collect from top-level dataSource
    // - Multi-condition signals: collect from each condition that has a collectible dataSource
    const collectTargets: Array<{ source: string; config: Record<string, unknown>; label: string }> = [];

    if (topLevelSource && topLevelSource !== 'news_qualitative') {
      collectTargets.push({ source: topLevelSource, config: details, label: 'primary' });
    }

    if (conditions) {
      for (const cond of conditions) {
        const condSource = cond.dataSource as string | undefined;
        if (condSource && condSource !== 'news_qualitative') {
          collectTargets.push({
            source: condSource,
            config: { ...details, ...cond },
            label: cond.label as string || condSource,
          });
        }
      }
    }

    if (collectTargets.length === 0) {
      // Purely qualitative signal — handled by thesis monitor, not this script
      skipped++;
      continue;
    }

    const shortStatement = signal.statement.slice(0, 60);
    console.log(`[${signal.type}] ${shortStatement}...`);

    for (const target of collectTargets) {
      try {
        const result = await collectForSignal(signal.id, target.source, target.config);

        if (!result) {
          console.log(`  ⚠ ${target.source} (${target.label}): no data`);
          continue;
        }

        const pctStr = result.pctToThreshold.toFixed(1);
        console.log(`  ✓ ${target.source}: ${result.observedValue.toLocaleString()} ${result.unit} (${pctStr}% of threshold)`);

        if (!dryRun) {
          // Intraday frequencies use actual timestamp to allow multiple readings per day;
          // daily/weekly use start-of-day for dedup via unique constraint
          const intradayFreq = checkFrequency.match(/^(\d+)h$/);
          const snapshotTimestamp = intradayFreq ? now : today;

          await db
            .insert(signalDataSnapshots)
            .values({
              signalId: signal.id,
              snapshotDate: snapshotTimestamp,
              observedValue: String(result.observedValue ?? 0),
              thresholdValue: String(result.thresholdValue ?? 0),
              pctToThreshold: String(result.pctToThreshold ?? 0),
              unit: result.unit,
              evidenceSummary: result.evidenceSummary || null,
              // For multi-condition signals, append label to make data_source unique per condition
              dataSource: collectTargets.length > 1 && target.label !== 'primary'
                ? `${target.source}:${target.label.replace(/\s+/g, '_').toLowerCase().slice(0, 40)}`
                : target.source,
            })
            .onConflictDoNothing(); // Skip if snapshot already exists for this signal+date+source
        }

        // Check milestone crossings
        const hits = await checkMilestones(
          signal, result.pctToThreshold, prevPctMap.get(signal.id) ?? null, dryRun
        );
        milestoneCount += hits;

        // Check threshold trigger (after snapshot insert, so data is persisted first)
        if (!skipTriggers) {
          const triggered = await checkAndTriggerSignal(signal, result.pctToThreshold, dryRun);
          if (triggered) triggeredCount++;
        }

        collected++;
      } catch (err) {
        console.log(`  ✗ ${target.source} (${target.label}): ${err instanceof Error ? err.message : err}`);
        errors++;
      }
    }
  }

  console.log(`\nThesis signals: ${collected} collected, ${skipped} skipped (qualitative), ${frequencySkipped} skipped (frequency), ${errors} errors`);

  // ── Strategy price signals ────────────────────────────────────────────────
  // Consolidated model: one signal per underlying with a targets array.
  // Also supports legacy single-target signals (pre-consolidation).

  const strategySignalRows = await db
    .selectDistinctOn([signals.id], {
      id: signals.id,
      type: signals.type,
      status: signals.status,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(and(
      eq(signalEntityLinks.entityType, 'strategy'),
      eq(signals.status, 'active'),
    ));
  const strategySignals = strategySignalRows;

  // Collect unique base tickers so we can batch-fetch spot prices
  const tickerSet = new Set<string>();
  for (const s of strategySignals) {
    const d = s.explicitDetails as Record<string, unknown> | null;
    if (!d) continue;

    if (d.signalKind === 'strategy_price_ladder') {
      // Consolidated ladder: ticker is top-level
      tickerSet.add(((d.ticker as string) || '').toUpperCase());
      const targets = (d.targets as Array<Record<string, unknown>>) || [];
      if (targets.some(t => t.denomination === 'BTC')) tickerSet.add('BTC');
    } else if (d.tvSymbol && d.denomination) {
      // Legacy single-target
      tickerSet.add(extractBaseTicker(d.tvSymbol as string).toUpperCase());
      if (d.denomination === 'BTC') tickerSet.add('BTC');
    }
  }

  const spotMap = new Map<string, number | null>();

  if (tickerSet.size > 0) {
    const spotRows = await db
      .select({ ticker: underlyings.ticker, spot: underlyings.spot })
      .from(underlyings)
      .where(inArray(underlyings.ticker, [...tickerSet]));

    for (const row of spotRows) {
      spotMap.set(row.ticker, row.spot != null ? parseFloat(String(row.spot)) : null);
    }

    // Fall back to TradingView scanner for any tickers with null spot (stocks)
    const needsScanner = [...tickerSet].filter(t => spotMap.get(t) == null);
    if (needsScanner.length > 0) {
      console.log(`\n  Fetching scanner prices for: ${needsScanner.join(', ')}`);
      const scannerPrices = await fetchPrices(needsScanner);
      for (const [ticker, data] of Object.entries(scannerPrices)) {
        spotMap.set(ticker.toUpperCase(), data.price);
      }
    }
  }

  console.log(`\nStrategy price signals: ${strategySignals.length} signals\n`);

  let sCollected = 0, sSkipped = 0, sErrors = 0;

  for (const signal of strategySignals) {
    const d = signal.explicitDetails as Record<string, unknown> | null;
    if (!d) { sSkipped++; continue; }

    try {
      if (d.signalKind === 'strategy_price_ladder') {
        // ── Consolidated ladder signal ──
        const ticker = ((d.ticker as string) || '').toUpperCase();
        const targets = (d.targets as Array<Record<string, unknown>>) || [];

        const assetSpot = spotMap.get(ticker);
        if (assetSpot == null) {
          console.log(`  ⚠ ${ticker}: no price data`);
          sSkipped++;
          continue;
        }

        // Find nearest unfulfilled USD TP target for the snapshot threshold
        const usdTPs = targets
          .filter(t => t.denomination === 'USD' && t.conditionType === 'price_above' && t.status !== 'complete')
          .sort((a, b) => (a.price as number) - (b.price as number));

        const nearestTarget = usdTPs[0];
        const threshold = nearestTarget ? (nearestTarget.price as number) : null;

        if (threshold) {
          const pct = (assetSpot / threshold) * 100;
          const pctToThreshold = Math.round(pct * 100) / 100;
          const priceStr = `$${assetSpot.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
          const label = (nearestTarget.label as string) || 'TP';
          console.log(`  [ladder] ${ticker}: ${priceStr} → ${label} (${pctToThreshold.toFixed(1)}%)`);

          if (!dryRun) {
            await db
              .insert(signalDataSnapshots)
              .values({
                signalId: signal.id,
                snapshotDate: now,
                observedValue: String(assetSpot),
                thresholdValue: String(threshold),
                pctToThreshold: String(pctToThreshold),
                unit: 'USD',
                evidenceSummary: `Tracking ${label} at $${threshold.toLocaleString()}`,
                dataSource: 'strategy_price',
              })
              .onConflictDoNothing();
          }

          const hits = await checkMilestones(
            signal, pctToThreshold, prevPctMap.get(signal.id) ?? null, dryRun
          );
          milestoneCount += hits;
        } else {
          console.log(`  · ${ticker}: no unfulfilled USD targets — skipping snapshot`);
        }

        sCollected++;
      } else if (d.tvSymbol && d.denomination && d.price != null) {
        // ── Legacy single-target signal ──
        const ticker = extractBaseTicker(d.tvSymbol as string).toUpperCase();
        const denomination = d.denomination as 'BTC' | 'USD';
        const threshold = parseFloat(String(d.price));
        const tvLabel = (d.tvLabel as string) || signal.statement.slice(0, 40);

        const assetSpot = spotMap.get(ticker);
        if (assetSpot == null) {
          console.log(`  ⚠ ${tvLabel}: no price data for ${ticker}`);
          sSkipped++;
          continue;
        }

        let observedValue: number;
        let unit: string;

        if (denomination === 'USD') {
          observedValue = assetSpot;
          unit = 'USD';
        } else {
          const btcSpot = spotMap.get('BTC');
          if (btcSpot == null) {
            console.log(`  ⚠ ${tvLabel}: no BTC price for ratio calculation`);
            sSkipped++;
            continue;
          }
          observedValue = assetSpot / btcSpot;
          unit = 'BTC_RATIO';
        }

        const pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
        const pctToThreshold = Math.round(pct * 100) / 100;

        const priceStr = denomination === 'USD'
          ? `$${observedValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
          : observedValue.toPrecision(5);
        console.log(`  [${signal.type}] ${tvLabel}: ${priceStr} (${pctToThreshold.toFixed(1)}% of threshold)`);

        if (!dryRun) {
          await db
            .insert(signalDataSnapshots)
            .values({
              signalId: signal.id,
              snapshotDate: now,
              observedValue: String(observedValue),
              thresholdValue: String(threshold),
              pctToThreshold: String(pctToThreshold),
              unit,
              evidenceSummary: null,
              dataSource: 'strategy_price',
            })
            .onConflictDoNothing();
        }

        const hits = await checkMilestones(
          signal, pctToThreshold, prevPctMap.get(signal.id) ?? null, dryRun
        );
        milestoneCount += hits;

        if (!skipTriggers) {
          const triggered = await checkAndTriggerSignal(signal, pctToThreshold, dryRun);
          if (triggered) triggeredCount++;
        }

        sCollected++;
      } else {
        sSkipped++;
      }
    } catch (err) {
      console.log(`  ✗ snapshot failed: ${err instanceof Error ? err.message : err}`);
      sErrors++;
    }
  }

  console.log(`\nDone — Thesis: ${collected} collected, ${skipped} skipped, ${errors} errors`);
  console.log(`       Strategy: ${sCollected} collected, ${sSkipped} skipped, ${sErrors} errors`);
  if (milestoneCount > 0) {
    console.log(`       Milestones: ${milestoneCount} milestone(s) crossed`);
  }
  if (triggeredCount > 0) {
    console.log(`       Triggered: ${triggeredCount} signal(s) reached threshold and auto-completed`);
  }

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
