#!/usr/bin/env tsx

/**
 * Create a new macro thesis with journal logging
 *
 * Usage:
 *   npx tsx scripts/ops/create-macro-thesis.ts \
 *     --title "AI Infrastructure Boom" \
 *     --description "Hyperscaler capex driving secular growth" \
 *     --thesis-type secular \
 *     --direction bullish \
 *     --confidence medium \
 *     --time-horizon long_term \
 *     --sectors "AI hyperscalers,cloud infrastructure"
 *
 * Required: --title, --description, --thesis-type, --direction, --confidence
 * Optional: --time-horizon, --sectors (comma-separated)
 */

import { db, closeDb, schema, logToJournal } from '../lib/db.js';

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

  const { title, description, thesis_type, direction, confidence, time_horizon, sectors } = args;

  if (!title || !description || !thesis_type || !direction || !confidence) {
    console.error('Required: --title, --description, --thesis-type, --direction, --confidence');
    process.exit(1);
  }

  const sectorsArray = sectors ? sectors.split(',').map(s => s.trim()) : [];

  const [inserted] = await db.insert(schema.macroTheses).values({
    title,
    description,
    thesisType: thesis_type,
    direction,
    confidenceLevel: confidence,
    timeHorizon: time_horizon || null,
    sectors: sectorsArray,
    status: 'draft',
  }).returning({ id: schema.macroTheses.id, title: schema.macroTheses.title });

  await logToJournal({
    objectType: 'macro_thesis',
    objectId: inserted.id,
    objectTitle: title,
    actionType: 'created',
    actionDescription: `Created macro thesis: ${title} (${thesis_type}, ${direction}, confidence: ${confidence})`,
    newState: { status: 'draft', thesisType: thesis_type, direction, confidence },
    source: 'user',
  });

  console.log(JSON.stringify({
    success: true,
    id: inserted.id,
    title: inserted.title,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
