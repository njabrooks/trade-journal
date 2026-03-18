/**
 * Data migration: Populate signal_entity_links from existing signals
 * and deduplicate strategy price signals (one signal per TV drawing).
 *
 * Steps:
 * 1. Create links for thesis signals (1:1, no dedup needed)
 * 2. Create links for non-TV strategy signals (1:1)
 * 3. For TV drawing signals: group by tvDrawingId, keep canonical signal,
 *    create links to all strategies, reassign snapshots, delete duplicates
 *
 * Usage:
 *   npx tsx scripts/migrate-signal-entity-links.ts              # Run migration
 *   npx tsx scripts/migrate-signal-entity-links.ts --dry-run    # Preview only
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const { signalEntityLinks } = schema;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Signal Entity Links Migration${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Check current state
  const existingLinks = await db.execute<{ count: string }>(
    sql`SELECT count(*) FROM signal_entity_links`
  );
  console.log(`Existing links: ${existingLinks[0].count}`);

  if (parseInt(existingLinks[0].count) > 0) {
    console.log('Links already exist — skipping population step.\n');
  } else {
    // Step 1: Thesis signals → links (1:1)
    if (!dryRun) {
      const thesisResult = await db.execute(sql`
        INSERT INTO signal_entity_links (signal_id, entity_type, thesis_id, thesis_type)
        SELECT id, 'thesis', thesis_id, thesis_type
        FROM signals
        WHERE entity_type = 'thesis' AND thesis_id IS NOT NULL
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      console.log(`Step 1: Created ${thesisResult.length} thesis signal links`);
    } else {
      const thesisCount = await db.execute<{ count: string }>(sql`
        SELECT count(*) FROM signals WHERE entity_type = 'thesis' AND thesis_id IS NOT NULL
      `);
      console.log(`Step 1: Would create ${thesisCount[0].count} thesis signal links`);
    }

    // Step 2: Non-TV strategy signals → links (1:1)
    if (!dryRun) {
      const nonTvResult = await db.execute(sql`
        INSERT INTO signal_entity_links (signal_id, entity_type, strategy_id,
          position_pct)
        SELECT id, 'strategy', strategy_id,
          (explicit_details->>'positionPct')::integer
        FROM signals
        WHERE entity_type = 'strategy'
          AND strategy_id IS NOT NULL
          AND (explicit_details->>'tvDrawingId') IS NULL
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      console.log(`Step 2: Created ${nonTvResult.length} non-TV strategy signal links`);
    } else {
      const nonTvCount = await db.execute<{ count: string }>(sql`
        SELECT count(*) FROM signals
        WHERE entity_type = 'strategy' AND strategy_id IS NOT NULL
          AND (explicit_details->>'tvDrawingId') IS NULL
      `);
      console.log(`Step 2: Would create ${nonTvCount[0].count} non-TV strategy signal links`);
    }

    // Step 3: TV drawing strategy signals → deduplicate
    // Find all unique TV drawing groups
    const drawingGroups = await db.execute<{
      tv_drawing_id: string;
      signal_count: string;
      signal_ids: string[];
      strategy_ids: string[];
      position_pcts: (number | null)[];
    }>(sql`
      SELECT
        explicit_details->>'tvDrawingId' as tv_drawing_id,
        count(*) as signal_count,
        array_agg(id ORDER BY created_at ASC) as signal_ids,
        array_agg(strategy_id ORDER BY created_at ASC) as strategy_ids,
        array_agg((explicit_details->>'positionPct')::integer ORDER BY created_at ASC) as position_pcts
      FROM signals
      WHERE entity_type = 'strategy'
        AND (explicit_details->>'tvDrawingId') IS NOT NULL
      GROUP BY explicit_details->>'tvDrawingId'
      ORDER BY signal_count DESC
    `);

    console.log(`\nStep 3: Found ${drawingGroups.length} unique TV drawings`);

    let totalLinksCreated = 0;
    let totalDuplicatesRemoved = 0;
    let totalSnapshotsReassigned = 0;

    for (const group of drawingGroups) {
      const canonicalId = group.signal_ids[0]; // earliest created
      const duplicateIds = group.signal_ids.slice(1);

      console.log(`  Drawing ${group.tv_drawing_id}: ${group.signal_count} signals → 1 canonical (${canonicalId.slice(0, 8)})`);

      if (!dryRun) {
        // Create links from canonical signal to all strategies
        for (let i = 0; i < group.strategy_ids.length; i++) {
          const stratId = group.strategy_ids[i];
          const pct = group.position_pcts[i];
          if (!stratId) continue;

          await db.execute(sql`
            INSERT INTO signal_entity_links (signal_id, entity_type, strategy_id, position_pct)
            VALUES (${canonicalId}, 'strategy', ${stratId}, ${pct})
            ON CONFLICT (signal_id, strategy_id) DO NOTHING
          `);
          totalLinksCreated++;
        }

        // Reassign snapshots from duplicates to canonical
        if (duplicateIds.length > 0) {
          for (const dupId of duplicateIds) {
            // Update snapshots, skip conflicts
            const reassigned = await db.execute(sql`
              UPDATE signal_data_snapshots
              SET signal_id = ${canonicalId}
              WHERE signal_id = ${dupId}
                AND NOT EXISTS (
                  SELECT 1 FROM signal_data_snapshots existing
                  WHERE existing.signal_id = ${canonicalId}
                    AND existing.snapshot_date = signal_data_snapshots.snapshot_date
                    AND existing.data_source = signal_data_snapshots.data_source
                )
              RETURNING id
            `);
            totalSnapshotsReassigned += reassigned.length;

            // Delete any remaining duplicate snapshots (conflicts)
            await db.execute(sql`
              DELETE FROM signal_data_snapshots WHERE signal_id = ${dupId}
            `);
          }

          // Delete duplicate signal rows
          for (const dupId of duplicateIds) {
            await db.execute(sql`DELETE FROM signals WHERE id = ${dupId}`);
            totalDuplicatesRemoved++;
          }
        }
      } else {
        console.log(`    Would create ${group.strategy_ids.filter(Boolean).length} links, remove ${duplicateIds.length} duplicates`);
        totalLinksCreated += group.strategy_ids.filter(Boolean).length;
        totalDuplicatesRemoved += duplicateIds.length;
      }
    }

    console.log(`\nStep 3 summary:`);
    console.log(`  Links created: ${totalLinksCreated}`);
    console.log(`  Snapshots reassigned: ${totalSnapshotsReassigned}`);
    console.log(`  Duplicate signals removed: ${totalDuplicatesRemoved}`);
  }

  // Update canonical signals: remove positionPct from statement (it's per-link now)
  // and clear strategy_id (it's in junction table now)
  const canonicalTvSignals = await db.execute<{ id: string; statement: string }>(sql`
    SELECT id, statement FROM signals
    WHERE entity_type = 'strategy'
      AND (explicit_details->>'tvDrawingId') IS NOT NULL
  `);

  let statementsUpdated = 0;
  for (const sig of canonicalTvSignals) {
    // Remove " (X% of position)" from statement
    const cleaned = sig.statement.replace(/\s*\(\d+% of position\)/, '');
    if (cleaned !== sig.statement) {
      if (!dryRun) {
        await db.execute(sql`
          UPDATE signals SET statement = ${cleaned} WHERE id = ${sig.id}
        `);
      }
      statementsUpdated++;
    }
  }
  console.log(`\nStatements cleaned (removed position %): ${statementsUpdated}`);

  // Final counts
  const finalLinks = await db.execute<{ count: string }>(
    sql`SELECT count(*) FROM signal_entity_links`
  );
  const finalSignals = await db.execute<{ count: string }>(
    sql`SELECT count(*) FROM signals WHERE entity_type = 'strategy' AND (explicit_details->>'tvDrawingId') IS NOT NULL`
  );
  console.log(`\nFinal state:`);
  console.log(`  Total links: ${finalLinks[0].count}`);
  console.log(`  TV drawing signals (after dedup): ${finalSignals[0].count}`);

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
