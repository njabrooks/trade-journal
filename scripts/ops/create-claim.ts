#!/usr/bin/env tsx

/**
 * Create a new main claim with optional thesis linkage
 *
 * Usage:
 *   npx tsx scripts/ops/create-claim.ts \
 *     --title "GPU Demand Exceeds Supply" \
 *     --claim "Data center GPU demand will outstrip supply through 2027" \
 *     --category macro \
 *     --qualifier medium \
 *     --tickers "NVDA,AMD" \
 *     --evidence '["Hyperscaler capex up 40% YoY","TSMC capacity fully booked"]' \
 *     --reasoning "Supply constraints + demand growth = pricing power" \
 *     --backing "Historical precedent from 2020 chip shortage" \
 *     --rebuttal '["China could develop alternatives","Demand could slow with AI winter"]' \
 *     --link-to-thesis-id <uuid> \
 *     --link-to-thesis-type macro \
 *     --mapping-type supports
 *
 * Required: --title, --claim, --category, --qualifier
 * Optional: --tickers, --evidence, --reasoning, --backing, --rebuttal,
 *           --link-to-thesis-id, --link-to-thesis-type, --mapping-type,
 *           --source (default: 'user'; use 'skill' or 'automation' for non-user sources)
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

function tryParseJsonArray(val: string | undefined): string[] | undefined {
  if (!val) return undefined;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    // Treat as comma-separated string
    return val.split(',').map(s => s.trim());
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { title, claim, category, qualifier, tickers, evidence, reasoning, backing, rebuttal,
          link_to_thesis_id, link_to_thesis_type, mapping_type,
          source_insight_id, source_claim_id, time_horizon, source } = args;

  if (!title || !claim || !category || !qualifier) {
    console.error('Required: --title, --claim, --category, --qualifier');
    process.exit(1);
  }

  const tickersArray = tickers ? tickers.split(',').map(t => t.trim().toUpperCase()) : undefined;
  const evidenceArray = tryParseJsonArray(evidence);
  const rebuttalArray = tryParseJsonArray(rebuttal);

  const [inserted] = await db.insert(schema.mainClaims).values({
    title,
    claim,
    category,
    qualifier,
    relevantTickers: tickersArray,
    evidence: evidenceArray,
    reasoning: reasoning || null,
    backing: backing || null,
    rebuttal: rebuttalArray,
    status: 'draft',
    sourceInsightId: source_insight_id || null,
    sourceClaimId: source_claim_id || null,
    timeHorizon: time_horizon || null,
  }).returning({ id: schema.mainClaims.id, title: schema.mainClaims.title });

  // Optionally link to thesis
  let thesisLinked = false;
  let thesisId: string | undefined;
  if (link_to_thesis_id && link_to_thesis_type && mapping_type) {
    // Validate the thesis exists
    const thesisTable = link_to_thesis_type === 'macro' ? schema.macroTheses : schema.assetTheses;
    const [thesis] = await db.select({ id: thesisTable.id }).from(thesisTable).where(eq(thesisTable.id, link_to_thesis_id));
    if (!thesis) {
      console.error(`${link_to_thesis_type} thesis with id ${link_to_thesis_id} not found`);
      process.exit(1);
    }

    await db.insert(schema.claimThesisMappings).values({
      mainClaimId: inserted.id,
      macroThesisId: link_to_thesis_type === 'macro' ? link_to_thesis_id : undefined,
      assetThesisId: link_to_thesis_type === 'asset' ? link_to_thesis_id : undefined,
      mappingType: mapping_type,
      mappedBy: 'user',
    });
    thesisLinked = true;
    thesisId = link_to_thesis_id;
  }

  await logToJournal({
    objectType: 'claim',
    objectId: inserted.id,
    objectTitle: title,
    actionType: 'created',
    actionDescription: `Created claim: ${title} (${category}, qualifier: ${qualifier})${thesisLinked ? ` — linked to ${link_to_thesis_type} thesis ${thesisId}` : ''}`,
    newState: { status: 'draft', category, qualifier, thesisLinked },
    source: source || 'user',
  });

  console.log(JSON.stringify({
    success: true,
    id: inserted.id,
    title: inserted.title,
    thesisLinked,
    thesisId: thesisId || null,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
