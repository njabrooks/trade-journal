/**
 * Signal Data Collection Orchestrator
 *
 * Reads all active thesis signals with explicit_details, dispatches to
 * the appropriate data collector, and stores snapshots in signal_data_snapshots.
 *
 * Usage:
 *   npx tsx scripts/collect-signal-data.ts              # Collect all quantitative signals
 *   npx tsx scripts/collect-signal-data.ts --dry-run     # Show what would be collected without writing
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, inArray } from 'drizzle-orm';
import { collectDefiLlama } from './lib/collectors/defillama.js';
import { collectCoinGecko } from './lib/collectors/coingecko.js';
import { collectHypeFlows } from './lib/collectors/hypeflows.js';
import { collectInternalDb } from './lib/collectors/internal-db.js';
import { collectTradingView, fetchPrices } from './lib/collectors/tradingview.js';
import { collectDerived } from './lib/collectors/derived.js';

const { signals, signalDataSnapshots, underlyings } = schema;

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
      return collectDerived(details);
    default:
      return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const now = new Date();

  console.log(`Signal Data Collection — ${now.toISOString()}`);
  if (dryRun) console.log('(DRY RUN — no data will be written)\n');

  // Load all active thesis signals with explicit_details
  const activeSignals = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .where(
      and(
        eq(signals.entityType, 'thesis'),
        eq(signals.status, 'active')
      )
    );

  console.log(`Active thesis signals: ${activeSignals.length}\n`);

  let collected = 0;
  let skipped = 0;
  let errors = 0;

  for (const signal of activeSignals) {
    const details = signal.explicitDetails as Record<string, unknown> | null;
    if (!details) {
      skipped++;
      continue;
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
          await db
            .insert(signalDataSnapshots)
            .values({
              signalId: signal.id,
              snapshotDate: now,
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

        collected++;
      } catch (err) {
        console.log(`  ✗ ${target.source} (${target.label}): ${err instanceof Error ? err.message : err}`);
        errors++;
      }
    }
  }

  console.log(`\nThesis signals: ${collected} collected, ${skipped} skipped (qualitative), ${errors} errors`);

  // ── Strategy price signals ────────────────────────────────────────────────
  // These come from sync-tv-drawings and have denomination + tvSymbol in explicit_details.

  const strategySignals = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .where(and(
      eq(signals.entityType, 'strategy'),
      eq(signals.status, 'active'),
    ));

  // Collect unique base tickers so we can batch-fetch spot prices
  const tickerSet = new Set<string>();
  for (const s of strategySignals) {
    const d = s.explicitDetails as Record<string, unknown> | null;
    if (!d?.tvSymbol || !d?.denomination) continue;
    tickerSet.add(extractBaseTicker(d.tvSymbol as string).toUpperCase());
    if (d.denomination === 'BTC') tickerSet.add('BTC');
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
    if (!d?.tvSymbol || !d?.denomination || d?.price == null) {
      sSkipped++;
      continue;
    }

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

    try {
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
      sCollected++;
    } catch (err) {
      console.log(`  ✗ snapshot insert failed: ${err instanceof Error ? err.message : err}`);
      sErrors++;
    }
  }

  console.log(`\nDone — Thesis: ${collected} collected, ${skipped} skipped, ${errors} errors`);
  console.log(`       Strategy: ${sCollected} collected, ${sSkipped} skipped, ${sErrors} errors`);

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
