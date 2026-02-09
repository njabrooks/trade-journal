#!/usr/bin/env tsx

/**
 * Add a journal annotation to any entity
 *
 * Usage:
 *   npx tsx scripts/ops/add-journal-note.ts \
 *     --entity-type macro_thesis \
 *     --id <uuid> \
 *     --note "My observation about this thesis" \
 *     --title "Optional title"
 *
 * Supported entity types: macro_thesis, asset_thesis, main_claim, strategy, signal
 */

import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { eq } from 'drizzle-orm';

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

const ENTITY_CONFIG: Record<string, { table: any; objectType: string }> = {
  macro_thesis: { table: schema.macroTheses, objectType: 'macro_thesis' },
  asset_thesis: { table: schema.assetTheses, objectType: 'asset_thesis' },
  main_claim: { table: schema.mainClaims, objectType: 'claim' },
  strategy: { table: schema.strategies, objectType: 'strategy' },
  signal: { table: schema.signals, objectType: 'signal' },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const entityType = args.entity_type;
  const id = args.id;
  const note = args.note;
  const title = args.title;

  if (!entityType || !id || !note) {
    console.error('Required: --entity-type, --id, --note');
    process.exit(1);
  }

  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    console.error(`Unknown entity type: ${entityType}. Supported: ${Object.keys(ENTITY_CONFIG).join(', ')}`);
    process.exit(1);
  }

  // Fetch entity to get its title
  const [entity] = await db.select().from(config.table).where(eq(config.table.id, id));
  if (!entity) {
    console.error(`${entityType} with id ${id} not found`);
    process.exit(1);
  }

  const entityTitle = (entity as any).title || (entity as any).statement || `${entityType} ${id.slice(0, 8)}`;

  const journalEntryId = await logToJournal({
    objectType: config.objectType,
    objectId: id,
    objectTitle: title || entityTitle,
    actionType: 'annotation',
    actionDescription: note,
    source: 'user',
  });

  console.log(JSON.stringify({ success: true, journalEntryId }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
