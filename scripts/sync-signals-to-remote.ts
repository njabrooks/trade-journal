/**
 * Sync signals table from local Mac Mini to remote Supabase.
 * Run with: source .env.local && npx tsx scripts/sync-signals-to-remote.ts
 */

import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });

const LOCAL_DB = 'postgresql://postgres:postgres@100.75.22.47:54322/postgres';
const REMOTE_DB = process.env.DATABASE_URL_REMOTE;

if (!REMOTE_DB) {
  console.error('Missing DATABASE_URL_REMOTE in .env.local');
  process.exit(1);
}

async function main() {
  const localDb = postgres(LOCAL_DB);
  const remoteDb = postgres(REMOTE_DB);

  try {
    // Get all signals from local
    console.log('Fetching signals from local Mac Mini...');
    const localSignals = await localDb`SELECT * FROM signals`;
    console.log(`Found ${localSignals.length} signals in local database`);

    // Get existing signals from remote
    console.log('Fetching signals from remote Supabase...');
    const remoteSignals = await remoteDb`SELECT id FROM signals`;
    const remoteIds = new Set(remoteSignals.map(s => s.id));
    console.log(`Found ${remoteSignals.length} signals in remote database`);

    // Find signals to insert
    const toInsert = localSignals.filter(s => !remoteIds.has(s.id));
    console.log(`Need to insert ${toInsert.length} new signals`);

    if (toInsert.length === 0) {
      console.log('No new signals to sync');
      return;
    }

    // Insert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)...`);

      for (const signal of batch) {
        // Convert undefined to null for postgres driver
        const n = (v: unknown) => v === undefined ? null : v;

        // Local Mac Mini signals are all thesis signals (no entity_type or strategy_id columns)
        // Set entity_type = 'thesis' and strategy_id = null for these
        const entityType = signal.entity_type ?? 'thesis';
        const strategyId = signal.strategy_id ?? null;

        await remoteDb`
          INSERT INTO signals (
            id, entity_type, thesis_id, thesis_type, articulation_id, strategy_id,
            type, statement, notes, category, importance, timeframe,
            explicit_details, rationale, judgment_details, response_protocol,
            status, dependent_thesis_id, dependent_thesis_type,
            dependent_thesis_condition, dependent_thesis_condition_detail,
            linked_claim_ids, created_at, updated_at
          ) VALUES (
            ${n(signal.id)}, ${entityType}, ${n(signal.thesis_id)}, ${n(signal.thesis_type)},
            ${n(signal.articulation_id)}, ${strategyId}, ${n(signal.type)}, ${n(signal.statement)},
            ${n(signal.notes)}, ${n(signal.category)}, ${n(signal.importance)}, ${n(signal.timeframe)},
            ${n(signal.explicit_details)}, ${n(signal.rationale)}, ${n(signal.judgment_details)},
            ${n(signal.response_protocol)}, ${n(signal.status)}, ${n(signal.dependent_thesis_id)},
            ${n(signal.dependent_thesis_type)}, ${n(signal.dependent_thesis_condition)},
            ${n(signal.dependent_thesis_condition_detail)}, ${n(signal.linked_claim_ids)},
            ${n(signal.created_at)}, ${n(signal.updated_at)}
          )
          ON CONFLICT (id) DO UPDATE SET
            entity_type = EXCLUDED.entity_type,
            thesis_id = EXCLUDED.thesis_id,
            thesis_type = EXCLUDED.thesis_type,
            articulation_id = EXCLUDED.articulation_id,
            strategy_id = EXCLUDED.strategy_id,
            type = EXCLUDED.type,
            statement = EXCLUDED.statement,
            notes = EXCLUDED.notes,
            category = EXCLUDED.category,
            importance = EXCLUDED.importance,
            timeframe = EXCLUDED.timeframe,
            explicit_details = EXCLUDED.explicit_details,
            rationale = EXCLUDED.rationale,
            judgment_details = EXCLUDED.judgment_details,
            response_protocol = EXCLUDED.response_protocol,
            status = EXCLUDED.status,
            dependent_thesis_id = EXCLUDED.dependent_thesis_id,
            dependent_thesis_type = EXCLUDED.dependent_thesis_type,
            dependent_thesis_condition = EXCLUDED.dependent_thesis_condition,
            dependent_thesis_condition_detail = EXCLUDED.dependent_thesis_condition_detail,
            linked_claim_ids = EXCLUDED.linked_claim_ids,
            updated_at = EXCLUDED.updated_at
        `;
      }
    }

    // Verify
    const finalCount = await remoteDb`SELECT COUNT(*) as count FROM signals`;
    console.log(`\nSync complete! Remote signals count: ${finalCount[0].count}`);

  } finally {
    await localDb.end();
    await remoteDb.end();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
