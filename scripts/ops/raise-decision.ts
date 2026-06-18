#!/usr/bin/env tsx
/**
 * Raise a DecisionStrip item (W8) — a generic, deduped writer for the "needs
 * decision" strip (v2 spec §3). Claude review jobs (thesis-review research-gap mode,
 * etc.) call this to surface a genuine decision to the user.
 *
 * Writes a journal entry with action_type='decision_required' (status defaults to
 * 'active', which the strip surfaces). Deduped: if an active decision_required
 * already exists for the object, it is skipped (the strip is hard-capped at 5).
 *
 * Usage:
 *   npx tsx scripts/ops/raise-decision.ts --object-type asset_thesis --id <uuid> \
 *     --title "Live position on X, thin thesis" --description "Sources to develop it: ..."
 *   echo '{"objectType":"...","objectId":"...","title":"...","description":"..."}' | \
 *     npx tsx scripts/ops/raise-decision.ts --stdin
 */
import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { and, eq } from 'drizzle-orm';

const { journalEntries } = schema;

interface Input {
  objectType: string; // 'macro_thesis' | 'asset_thesis' | 'strategy' | ...
  objectId: string;
  objectTitle?: string;
  title: string; // the decision headline (action_description)
  description?: string; // rationale / detail
  source?: 'automation' | 'skill' | 'user';
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2).replace(/-/g, '');
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { a[k] = n; i++; } else { a[k] = true; }
    }
  }
  return a;
}

async function readInput(): Promise<Input> {
  const argv = process.argv.slice(2);
  if (argv.includes('--stdin')) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  }
  const a = parseArgs(argv);
  return {
    objectType: a.objecttype as string,
    objectId: a.id as string,
    objectTitle: a.objecttitle as string | undefined,
    title: a.title as string,
    description: a.description as string | undefined,
    source: (a.source as Input['source']) || 'automation',
  };
}

async function main() {
  const input = await readInput();
  if (!input.objectType || !input.objectId || !input.title) {
    console.error('Required: objectType, objectId (--id), title');
    process.exit(1);
  }

  const existing = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.objectId, input.objectId), eq(journalEntries.actionType, 'decision_required'), eq(journalEntries.status, 'active')))
    .limit(1);

  if (existing.length > 0) {
    console.log(JSON.stringify({ raised: false, reason: 'active decision already exists', existingId: existing[0].id }, null, 2));
    await closeDb();
    process.exit(0);
  }

  const id = await logToJournal({
    objectType: input.objectType,
    objectId: input.objectId,
    objectTitle: input.objectTitle,
    actionType: 'decision_required',
    actionDescription: input.title,
    rationale: input.description,
    source: input.source ?? 'automation',
  });

  console.log(JSON.stringify({ raised: true, journalEntryId: id }, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
