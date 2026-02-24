/**
 * Dedup Koinly Events
 *
 * Finds and removes duplicate Koinly events caused by the same transaction
 * being imported from multiple CSV files with slightly different number
 * formatting (e.g. "6,075.41400000" vs "6075.414"). These produce different
 * idempotency keys but share the same source_id + event_type + asset_ticker.
 *
 * Strategy: Group by (source_id, asset_ticker, event_type, owner, account,
 * timestamp, ROUND(quantity, 4), ROUND(total_value, 4), description).
 * The rounding to 4dp catches precision differences from re-exports
 * (69128.65367 vs 69128.65367324, or 0.00033427 vs 0.00034238) while
 * preserving legitimately different events that share the same blockchain
 * tx hash (e.g. multi-asset dust sells where USD BUY amounts like $0.078
 * vs $0.080 would collide at 2dp but not at 4dp). The description field
 * (from metadata) further distinguishes events like USD RECEIVE where
 * total_value = quantity but the underlying instrument differs
 * (e.g. "ADA-20210625" vs "DOT-20210625").
 *
 * Keep the earliest inserted (MIN(created_at)), delete the rest.
 *
 * Usage:
 *   npx tsx scripts/dedup-koinly-events.ts --dry-run
 *   npx tsx scripts/dedup-koinly-events.ts
 */

import { db } from "../scripts/lib/db";
import { sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`[Dedup] Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // Find duplicates: same (source_id, asset_ticker, event_type, owner, account,
  // timestamp, ROUND(quantity, 4), ROUND(total_value, 4), description).
  const duplicates = await db.execute<{
    source_id: string;
    asset_ticker: string;
    event_type: string;
    owner: string;
    account: string;
    cnt: number;
    keep_id: string;
    delete_ids: string[];
  }>(sql`
    WITH ranked AS (
      SELECT
        id,
        source_id,
        asset_ticker,
        event_type,
        owner,
        account,
        quantity,
        total_value,
        metadata->>'description' as description,
        timestamp,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY source_id, asset_ticker, event_type, owner, account, timestamp, ROUND(quantity::numeric, 4), ROUND(total_value::numeric, 4), metadata->>'description'
          ORDER BY created_at ASC, id ASC
        ) as rn
      FROM events
      WHERE source = 'koinly'
        AND source_id IS NOT NULL
    )
    SELECT
      source_id,
      asset_ticker,
      event_type,
      owner,
      account,
      COUNT(*) as cnt,
      MIN(CASE WHEN rn = 1 THEN id::text END) as keep_id,
      ARRAY_AGG(CASE WHEN rn > 1 THEN id::text END) FILTER (WHERE rn > 1) as delete_ids
    FROM ranked
    GROUP BY source_id, asset_ticker, event_type, owner, account, timestamp, ROUND(quantity::numeric, 4), ROUND(total_value::numeric, 4), description
    HAVING COUNT(*) > 1
    ORDER BY asset_ticker, event_type
  `);

  if (duplicates.length === 0) {
    console.log("[Dedup] No duplicates found.");
    return;
  }

  console.log(`[Dedup] Found ${duplicates.length} duplicate groups:`);
  let totalToDelete = 0;

  for (const dup of duplicates) {
    if (!dup.delete_ids) continue;
    const deleteCount = dup.delete_ids.length;
    totalToDelete += deleteCount;
    console.log(
      `  ${dup.asset_ticker} ${dup.event_type} (${dup.owner}/${dup.account}) source=${dup.source_id.slice(0, 12)}... — ${dup.cnt} copies, deleting ${deleteCount}, keeping ${dup.keep_id}`
    );
  }

  console.log(`\n[Dedup] Total events to delete: ${totalToDelete}`);

  if (DRY_RUN) {
    console.log("[Dedup] Dry run — no changes made.");
    return;
  }

  // Collect all IDs to delete
  const allDeleteIds = duplicates.flatMap((d) => d.delete_ids ?? []);

  // Build an IN list using sql.join so Drizzle parameterises each UUID individually
  const idList = sql.join(
    allDeleteIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );

  // Delete all FK-dependent rows before deleting events.
  // event_calculations has ON DELETE CASCADE, but we clear it explicitly too.
  // All calc-derived tables will be rebuilt by the calc engine.

  await db.execute(sql`DELETE FROM event_calculations WHERE event_id IN (${idList})`);
  console.log(`[Dedup] Cleaned event_calculations`);

  await db.execute(sql`DELETE FROM lot_consumptions WHERE disposal_event_id IN (${idList})`);
  console.log(`[Dedup] Cleaned lot_consumptions`);

  await db.execute(sql`DELETE FROM tax_lots WHERE acquisition_event_id IN (${idList})`);
  console.log(`[Dedup] Cleaned tax_lots`);

  await db.execute(sql`
    UPDATE average_cost_positions SET last_updated_event_id = NULL
    WHERE last_updated_event_id IN (${idList})
  `);
  console.log(`[Dedup] Nulled average_cost_positions references`);

  // Null self-referential linked_event_id on events table
  await db.execute(sql`
    UPDATE events SET linked_event_id = NULL
    WHERE linked_event_id IN (${idList})
  `);
  console.log(`[Dedup] Nulled events.linked_event_id references`);

  // Delete the duplicate events
  await db.execute(sql`DELETE FROM events WHERE id IN (${idList})`);
  console.log(`[Dedup] Deleted ${allDeleteIds.length} duplicate events`);

  // Verify: check for any remaining duplicates (same grouping as above)
  const remaining = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*) as cnt FROM (
      SELECT source_id, asset_ticker, event_type, owner, account, timestamp, ROUND(quantity::numeric, 4)
      FROM events
      WHERE source = 'koinly' AND source_id IS NOT NULL
      GROUP BY source_id, asset_ticker, event_type, owner, account, timestamp, ROUND(quantity::numeric, 4), ROUND(total_value::numeric, 4), metadata->>'description'
      HAVING COUNT(*) > 1
    ) t
  `);

  console.log(`[Dedup] Remaining duplicate groups: ${remaining[0]?.cnt ?? 0}`);
  console.log("[Dedup] Done. Run the calculation engine to recalculate.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
