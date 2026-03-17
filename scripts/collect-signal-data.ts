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
import { eq, and } from 'drizzle-orm';
import { collectDefiLlama } from './lib/collectors/defillama.js';
import { collectCoinGecko } from './lib/collectors/coingecko.js';
import { collectHypeFlows } from './lib/collectors/hypeflows.js';
import { collectInternalDb } from './lib/collectors/internal-db.js';
import { collectTradingView } from './lib/collectors/tradingview.js';
import { collectDerived } from './lib/collectors/derived.js';

const { signals, signalDataSnapshots } = schema;

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

  console.log(`\nDone: ${collected} collected, ${skipped} skipped (qualitative), ${errors} errors`);

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
