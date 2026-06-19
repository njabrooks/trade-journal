#!/usr/bin/env tsx
/**
 * Flag corrupted / junk strategies (W8 follow-on data hygiene).
 *
 * Detects strategies whose key is clearly not a real instrument:
 *   - non-ASCII (unicode homoglyphs, e.g. SΟԼ / UЅDC from a bad ingest);
 *   - unresolved HyperLiquid internal market ids (e.g. @591) that never mapped to a ticker.
 * Marks them status='rejected' — the existing terminal state the auto-linker treats as
 * "dead, do not recreate" — with a journal note recording the reason. Dry-run by default.
 *
 * Usage:
 *   npx tsx scripts/ops/flag-corrupted-strategies.ts            # dry-run
 *   npx tsx scripts/ops/flag-corrupted-strategies.ts --apply
 */
import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { and, eq, inArray, ne } from 'drizzle-orm';

const { strategies } = schema;

function corruptionReason(key: string): string | null {
  if (!/^[\x00-\x7F]*$/.test(key)) return 'non-ASCII ticker (unicode homoglyph)';
  if (/^@\d+/.test(key)) return 'unresolved HyperLiquid market id (never mapped to a ticker)';
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  // Only consider non-terminal strategies (don't re-touch rejected/merged/complete).
  const rows = await db
    .select({ id: strategies.id, strategyKey: strategies.strategyKey, status: strategies.status })
    .from(strategies)
    .where(and(inArray(strategies.status, ['active', 'draft']), ne(strategies.status, 'rejected')));

  const corrupted = rows
    .map((r) => ({ ...r, reason: corruptionReason(r.strategyKey) }))
    .filter((r) => r.reason);

  console.log(`\n=== Corrupted/junk strategies (${apply ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(`${corrupted.length} found\n`);
  for (const c of corrupted) console.log(`  [${c.status}] ${c.strategyKey} — ${c.reason}`);

  if (apply && corrupted.length > 0) {
    for (const c of corrupted) {
      await db.update(strategies).set({ status: 'rejected', updatedAt: new Date() }).where(eq(strategies.id, c.id));
      await logToJournal({
        objectType: 'strategy',
        objectId: c.id,
        objectTitle: c.strategyKey,
        actionType: 'status_change',
        actionDescription: `Rejected as corrupted/junk: ${c.reason}`,
        previousState: { status: c.status },
        newState: { status: 'rejected' },
        source: 'automation',
      });
    }
    console.log(`\n✓ Rejected ${corrupted.length} corrupted strategies (logged to journal).`);
  } else if (!apply && corrupted.length > 0) {
    console.log(`\nRe-run with --apply to mark these rejected.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
