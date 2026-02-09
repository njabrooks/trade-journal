#!/usr/bin/env tsx

/**
 * Create a new asset thesis with journal logging
 *
 * Usage:
 *   npx tsx scripts/ops/create-asset-thesis.ts \
 *     --ticker NVDA \
 *     --title "NVDA AI Capex Beneficiary" \
 *     --description "GPU demand from hyperscaler buildout" \
 *     --narrative "Data center GPU monopoly..." \
 *     --direction bullish \
 *     --confidence high \
 *     --time-horizon medium_term \
 *     --macro-thesis-id <uuid>
 *
 * Required: --ticker, --title, --description, --direction, --confidence
 * Optional: --narrative, --time-horizon, --macro-thesis-id
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { ticker, title, description, narrative, direction, confidence, time_horizon, macro_thesis_id } = args;

  if (!ticker || !title || !description || !direction || !confidence) {
    console.error('Required: --ticker, --title, --description, --direction, --confidence');
    process.exit(1);
  }

  const normalizedTicker = ticker.toUpperCase();

  // Look up underlying by ticker
  const [underlying] = await db.select()
    .from(schema.underlyings)
    .where(eq(schema.underlyings.ticker, normalizedTicker));

  if (!underlying) {
    console.error(`Underlying not found for ticker: ${normalizedTicker}`);
    process.exit(1);
  }

  // If macro thesis ID provided, verify it exists
  if (macro_thesis_id) {
    const [macroThesis] = await db.select({ id: schema.macroTheses.id })
      .from(schema.macroTheses)
      .where(eq(schema.macroTheses.id, macro_thesis_id));
    if (!macroThesis) {
      console.error(`Macro thesis with id ${macro_thesis_id} not found`);
      process.exit(1);
    }
  }

  const [inserted] = await db.insert(schema.assetTheses).values({
    underlyingId: underlying.id,
    title,
    description,
    narrative: narrative || null,
    direction,
    confidenceLevel: confidence,
    timeHorizon: time_horizon || null,
    status: 'draft',
  }).returning({ id: schema.assetTheses.id, title: schema.assetTheses.title });

  // Link to macro thesis if provided
  let macroThesisLinked = false;
  if (macro_thesis_id) {
    await db.insert(schema.assetThesisRelatedMacroTheses).values({
      assetThesisId: inserted.id,
      macroThesisId: macro_thesis_id,
    });
    macroThesisLinked = true;
  }

  await logToJournal({
    objectType: 'asset_thesis',
    objectId: inserted.id,
    objectTitle: title,
    actionType: 'created',
    actionDescription: `Created asset thesis: ${title} (${normalizedTicker}, ${direction}, confidence: ${confidence})${macroThesisLinked ? ` — linked to macro thesis ${macro_thesis_id}` : ''}`,
    newState: { status: 'draft', ticker: normalizedTicker, direction, confidence, macroThesisLinked },
    source: 'user',
  });

  console.log(JSON.stringify({
    success: true,
    id: inserted.id,
    title: inserted.title,
    ticker: normalizedTicker,
    underlyingId: underlying.id,
    macroThesisLinked,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
