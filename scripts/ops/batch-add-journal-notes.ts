#!/usr/bin/env tsx

/**
 * Batch-add journal entries from a JSON array on stdin.
 *
 * All entries share a single batch_id for grouping. Unlike add-journal-note.ts,
 * this does NOT look up entity titles (caller must provide them) — avoids
 * N separate SELECT queries.
 *
 * Usage:
 *   echo '<json>' | npx tsx scripts/ops/batch-add-journal-notes.ts
 *
 * Input JSON format (array):
 * [
 *   {
 *     "objectType": "signal",
 *     "objectId": "<uuid>",
 *     "objectTitle": "Oil price invalidation signal",
 *     "actionType": "annotation",
 *     "actionDescription": "Claim evidenced (weakening): \"Iran ceasefire is illusory\". Source: The Fragile Peace (via Tana promotion).",
 *     "source": "automation"
 *   }
 * ]
 *
 * Required per entry: objectType, objectId, actionDescription
 * Optional per entry: objectTitle, actionType (default: 'annotation'), source (default: 'automation')
 * Optional flags: --batch-id (override auto-generated batch_id)
 */

import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { db, closeDb, schema } from '../lib/db.js';

const { journalEntries } = schema;

interface JournalNoteInput {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType?: string;
  actionDescription: string;
  source?: 'user' | 'skill' | 'automation';
  metadata?: Record<string, unknown>;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      args[key] = argv[i + 1] || '';
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchId = args.batch_id || randomUUID();

  // Read JSON from stdin
  const input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
  if (!input) {
    console.error('No JSON input on stdin');
    process.exit(1);
  }

  let entries: JournalNoteInput[];
  try {
    entries = JSON.parse(input);
  } catch (e) {
    console.error('Invalid JSON input:', (e as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.log(JSON.stringify({ success: true, created: 0, batchId }));
    await closeDb();
    process.exit(0);
  }

  // Validate each entry
  for (const e of entries) {
    if (!e.objectType || !e.objectId || !e.actionDescription) {
      console.error(`Entry missing required fields (objectType, objectId, actionDescription)`);
      process.exit(1);
    }
  }

  const now = new Date();

  // Bulk insert all entries
  const rows = entries.map(e => ({
    objectType: e.objectType,
    objectId: e.objectId,
    objectTitle: e.objectTitle || null,
    actionType: e.actionType || 'annotation',
    actionDescription: e.actionDescription,
    source: e.source || 'automation',
    batchId,
    metadata: e.metadata || null,
    firstDetectedAt: now,
    lastSeenAt: now,
    occurrenceCount: 1,
    status: 'active',
  }));

  const inserted = await db.insert(journalEntries).values(rows).returning({
    id: journalEntries.id,
  });

  console.log(JSON.stringify({
    success: true,
    created: inserted.length,
    batchId,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
