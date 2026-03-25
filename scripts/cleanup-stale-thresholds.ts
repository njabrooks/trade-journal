/**
 * cleanup-stale-thresholds.ts
 *
 * When a signal is reconfigured (threshold changes), old snapshots retain
 * the previous threshold value. This creates confusing charts with multiple
 * reference lines. Also catches collector bugs that write wrong thresholds.
 *
 * Threshold authority: explicitDetails.conditions[].threshold (per data_source)
 * is the single source of truth. Falls back to the most recent snapshot's
 * threshold only when no configured threshold exists.
 *
 * Usage:
 *   npx tsx scripts/cleanup-stale-thresholds.ts              # dry run
 *   npx tsx scripts/cleanup-stale-thresholds.ts --apply       # apply changes
 *   npx tsx scripts/cleanup-stale-thresholds.ts --signal-id <uuid>  # single signal
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql, eq, and, ne } from 'drizzle-orm';

const { signals, signalDataSnapshots } = schema;

interface Condition {
  label?: string;
  dataSource?: string;
  threshold?: number;
}

interface ExplicitDetails {
  dataSource?: string;
  threshold?: number;
  conditions?: Condition[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const signalIdFilter = args.includes('--signal-id')
    ? args[args.indexOf('--signal-id') + 1]
    : null;

  if (dryRun) {
    console.log('DRY RUN — pass --apply to execute updates\n');
  }

  // Load all active signals with explicit_details
  const activeSignals = await db
    .select({
      id: signals.id,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .where(
      signalIdFilter
        ? eq(signals.id, signalIdFilter)
        : eq(signals.status, 'active')
    );

  let totalUpdated = 0;
  let totalSignalsWithIssues = 0;

  for (const sig of activeSignals) {
    const details = sig.explicitDetails as ExplicitDetails | null;
    if (!details) continue;

    // Build a map of data_source -> authoritative threshold from explicitDetails
    const thresholdMap = new Map<string, number>();

    // Single-condition signals: dataSource + threshold at top level
    if (details.dataSource && details.threshold != null) {
      const topThreshold = Number(details.threshold);
      if (!isNaN(topThreshold)) {
        thresholdMap.set(details.dataSource, topThreshold);
      }
    }

    // Multi-condition signals: each condition may have its own dataSource + threshold,
    // or share the parent dataSource
    if (details.conditions) {
      for (const cond of details.conditions) {
        if (cond.threshold == null) continue;
        // Skip non-numeric thresholds (e.g., status values like "rejected")
        if (typeof cond.threshold === 'string' && isNaN(Number(cond.threshold))) continue;
        const condSource = cond.dataSource || details.dataSource;
        if (!condSource) continue;

        // Data sources are keyed with normalized label suffix in snapshots
        const normalizedLabel = cond.label
          ? cond.label.replace(/\s+/g, '_').toLowerCase().slice(0, 40)
          : null;
        const key = normalizedLabel
          ? `${condSource}:${normalizedLabel}`
          : condSource;
        thresholdMap.set(key, cond.threshold);

        // Also set on the bare dataSource if not already set by another condition
        // (for signals where snapshots use the bare key without label suffix)
        if (!thresholdMap.has(condSource) && normalizedLabel) {
          thresholdMap.set(condSource, cond.threshold);
        }
      }
    }

    if (thresholdMap.size === 0) continue;

    // Find snapshot data_sources for this signal
    const sourcesResult = await db.execute(sql`
      SELECT DISTINCT data_source
      FROM signal_data_snapshots
      WHERE signal_id = ${sig.id}::uuid
        AND status = 'accepted'
        AND threshold_value IS NOT NULL
    `) as unknown as Array<{ data_source: string }>;

    for (const { data_source } of sourcesResult) {
      // Find the authoritative threshold for this data_source
      // Try exact match first, then prefix match (for multi-condition keys)
      let authThreshold = thresholdMap.get(data_source);
      if (authThreshold == null) {
        // Try matching by prefix (data_source without the :label suffix)
        const prefix = data_source.split(':')[0];
        for (const [key, val] of thresholdMap) {
          if (key === prefix || key.startsWith(prefix + ':')) {
            // For prefix matches with multi-condition, try to match by label
            if (data_source.includes(':') && key.includes(':')) {
              if (key === data_source) {
                authThreshold = val;
                break;
              }
            } else {
              authThreshold = val;
              break;
            }
          }
        }
      }

      if (authThreshold == null) continue;

      // Count mismatched snapshots
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as cnt
        FROM signal_data_snapshots
        WHERE signal_id = ${sig.id}::uuid
          AND data_source = ${data_source}
          AND status = 'accepted'
          AND threshold_value IS NOT NULL
          AND threshold_value != ${authThreshold}::numeric
      `) as unknown as Array<{ cnt: string }>;

      const staleCount = parseInt(countResult[0]?.cnt || '0');
      if (staleCount === 0) continue;

      totalSignalsWithIssues++;
      console.log(`  Signal: ${sig.statement.slice(0, 80)}...`);
      console.log(`    Data source: ${data_source}`);
      console.log(`    Configured threshold: ${authThreshold}`);
      console.log(`    Mismatched snapshots: ${staleCount}`);

      if (!dryRun) {
        const updateResult = await db.execute(sql`
          UPDATE signal_data_snapshots
          SET threshold_value = ${authThreshold}::numeric,
              pct_to_threshold = CASE
                WHEN ${authThreshold}::numeric = 0 THEN NULL
                WHEN observed_value IS NOT NULL THEN
                  ROUND(
                    (1 - ABS(observed_value - ${authThreshold}::numeric) / ABS(${authThreshold}::numeric)) * 100,
                    4
                  )
                ELSE pct_to_threshold
              END
          WHERE signal_id = ${sig.id}::uuid
            AND data_source = ${data_source}
            AND status = 'accepted'
            AND threshold_value IS NOT NULL
            AND threshold_value != ${authThreshold}::numeric
        `);
        const count = (updateResult as { rowCount?: number }).rowCount || 0;
        totalUpdated += count;
        console.log(`    → Updated ${count} snapshots\n`);
      } else {
        totalUpdated += staleCount;
        console.log('');
      }
    }
  }

  if (totalSignalsWithIssues === 0) {
    console.log('No stale thresholds found.');
  } else {
    console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${totalUpdated} total snapshots across ${totalSignalsWithIssues} signal/source combinations.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
