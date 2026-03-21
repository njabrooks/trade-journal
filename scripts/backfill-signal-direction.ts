/**
 * Backfill direction and display_type into signal explicit_details JSONB.
 *
 * Rules:
 * - unit='status' → display_type='status', direction not applicable
 * - unit='correlation' → direction='down_to_threshold' (want value below threshold)
 * - unit='BTC_RATIO' with signal type 'invalidation' → direction='up_to_threshold'
 *   (invalidation triggers when ratio goes above)
 * - Otherwise → direction='up_to_threshold' (default: value grows toward target)
 *
 * All quantitative signals default to display_type='time_series' unless status.
 */
import { db, closeDb, schema } from './lib/db.js';
import { eq, and, isNotNull } from 'drizzle-orm';

const { signals, signalDataSnapshots } = schema;

async function main() {
  // Get all active signals (both data_driven and judgment with quantitative data)
  const activeSignals = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      category: signals.category,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .where(eq(signals.status, 'active'));

  console.log(`Found ${activeSignals.length} active data_driven signals`);

  let updated = 0;
  for (const signal of activeSignals) {
    const details = (signal.explicitDetails as Record<string, unknown>) || {};

    // Skip if already has both fields
    if (details.direction && details.display_type) {
      console.log(`  SKIP ${signal.id} — already has direction=${details.direction}, display_type=${details.display_type}`);
      continue;
    }

    // Get unit from latest snapshot
    const [latestSnapshot] = await db
      .select({ unit: signalDataSnapshots.unit })
      .from(signalDataSnapshots)
      .where(
        and(
          eq(signalDataSnapshots.signalId, signal.id),
          isNotNull(signalDataSnapshots.observedValue),
        )
      )
      .orderBy(signalDataSnapshots.snapshotDate)
      .limit(1);

    const unit = latestSnapshot?.unit || (details.unit as string) || '';

    // Determine direction
    let direction: string;
    let displayType: string;

    if (unit === 'status') {
      direction = 'up_to_threshold'; // not really applicable
      displayType = 'status';
    } else if (unit === 'correlation') {
      // BTC decorrelation: want correlation to DROP below threshold
      direction = 'down_to_threshold';
      displayType = 'time_series';
    } else {
      // Default: value grows toward target
      direction = 'up_to_threshold';
      displayType = 'time_series';
    }

    // Check for explicit threshold comparison hints in the statement
    const stmt = signal.statement.toLowerCase();
    if (stmt.includes('drops below') || stmt.includes('falls below') || stmt.includes('below')) {
      direction = 'down_to_threshold';
    }

    const newDetails = {
      ...details,
      direction: details.direction || direction,
      display_type: details.display_type || displayType,
    };

    await db
      .update(signals)
      .set({ explicitDetails: newDetails })
      .where(eq(signals.id, signal.id));

    console.log(`  OK ${signal.id} — direction=${newDetails.direction}, display_type=${newDetails.display_type} (unit=${unit}, stmt="${signal.statement.slice(0, 60)}")`);
    updated++;
  }

  console.log(`\nUpdated ${updated} signals`);
  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
