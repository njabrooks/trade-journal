#!/usr/bin/env tsx
/**
 * Backfill thesis_expression_episodes from the status-change journal (docs/v2/13 §2, E1).
 *
 * Derives every thesis's expression episodes (contiguous `monitoring` spans) from its
 * status_change journal trail and upserts them. Idempotent — safe to re-run; recorded
 * per-episode retrospectives are preserved. Going forward the post-ingestion cascade keeps
 * episodes current (strategyAuto.ts); this is the one-off seed + occasional full sweep.
 *
 * Usage: npx tsx scripts/ops/backfill-thesis-episodes.ts
 */
import { closeDb } from '../lib/db.js';
import { syncAllThesisEpisodes, migrateExistingRetrospectivesToEpisodes } from '@/lib/derived/thesisEpisodes';

async function main() {
  const res = await syncAllThesisEpisodes();
  const retrosMigrated = await migrateExistingRetrospectivesToEpisodes();
  console.log(JSON.stringify({ success: true, ...res, retrosMigrated }, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
