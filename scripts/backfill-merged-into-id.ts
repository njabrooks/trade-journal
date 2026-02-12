/**
 * Backfill merged_into_id for existing merged strategies.
 *
 * For each merged strategy with null merged_into_id, finds the best
 * active/draft/complete strategy with the same strategy_key (any account)
 * and sets merged_into_id to point to it.
 */
import { db, closeDb } from './lib/db.js';
import * as schema from '../src/db/schema.js';
import { eq, and, ne, sql, isNull } from 'drizzle-orm';

const { strategies } = schema;

async function main() {
  const merged = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      accountId: strategies.accountId,
      mergedIntoId: strategies.mergedIntoId,
    })
    .from(strategies)
    .where(and(eq(strategies.status, 'merged'), isNull(strategies.mergedIntoId)));

  console.log(`Found ${merged.length} merged strategies without merged_into_id\n`);

  let resolved = 0;
  let unresolved = 0;

  for (const s of merged) {
    // Find candidates: same key, not merged, prefer active > draft > complete
    const candidates = await db
      .select({
        id: strategies.id,
        status: strategies.status,
        accountId: strategies.accountId,
      })
      .from(strategies)
      .where(
        and(
          eq(strategies.strategyKey, s.strategyKey),
          ne(strategies.id, s.id),
          sql`${strategies.status} IN ('active', 'draft', 'complete')`
        )
      )
      .orderBy(
        sql`CASE
          WHEN ${strategies.status} = 'active' THEN 0
          WHEN ${strategies.status} = 'draft' THEN 1
          ELSE 2
        END`
      );

    if (candidates.length > 0) {
      const target = candidates[0];
      await db
        .update(strategies)
        .set({ mergedIntoId: target.id })
        .where(eq(strategies.id, s.id));
      console.log(
        `  ${s.strategyKey} (${s.id.slice(0, 8)}) -> ${target.id.slice(0, 8)} (${target.status}, account ${target.accountId?.slice(0, 8)})`
      );
      resolved++;
    } else {
      console.log(`  UNRESOLVED: ${s.strategyKey} (${s.id.slice(0, 8)}) - no active target found`);
      unresolved++;
    }
  }

  console.log(`\nResolved: ${resolved}, Unresolved: ${unresolved}`);
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
