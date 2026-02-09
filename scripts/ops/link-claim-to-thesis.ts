#!/usr/bin/env tsx

/**
 * Link an existing claim to a thesis (macro or asset)
 *
 * Usage:
 *   npx tsx scripts/ops/link-claim-to-thesis.ts \
 *     --claim-id <uuid> \
 *     --thesis-id <uuid> \
 *     --thesis-type macro \
 *     --mapping-type supports \
 *     --confidence high \
 *     --notes "Strong evidence connection"
 *
 * Required: --claim-id, --thesis-id, --thesis-type, --mapping-type
 * Optional: --confidence, --notes
 *
 * thesis-type: macro | asset
 * mapping-type: supports | refutes | foundation
 */

import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { eq, and } from 'drizzle-orm';

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

  const { claim_id, thesis_id, thesis_type, mapping_type, confidence, notes } = args;

  if (!claim_id || !thesis_id || !thesis_type || !mapping_type) {
    console.error('Required: --claim-id, --thesis-id, --thesis-type, --mapping-type');
    process.exit(1);
  }

  if (!['macro', 'asset'].includes(thesis_type)) {
    console.error('--thesis-type must be "macro" or "asset"');
    process.exit(1);
  }

  if (!['supports', 'refutes', 'foundation'].includes(mapping_type)) {
    console.error('--mapping-type must be "supports", "refutes", or "foundation"');
    process.exit(1);
  }

  // Validate claim exists
  const [claim] = await db.select({ id: schema.mainClaims.id, title: schema.mainClaims.title })
    .from(schema.mainClaims)
    .where(eq(schema.mainClaims.id, claim_id));
  if (!claim) {
    console.error(`Claim with id ${claim_id} not found`);
    process.exit(1);
  }

  // Validate thesis exists
  const thesisTable = thesis_type === 'macro' ? schema.macroTheses : schema.assetTheses;
  const [thesis] = await db.select({ id: thesisTable.id, title: thesisTable.title })
    .from(thesisTable)
    .where(eq(thesisTable.id, thesis_id));
  if (!thesis) {
    console.error(`${thesis_type} thesis with id ${thesis_id} not found`);
    process.exit(1);
  }

  // Check for duplicate mapping
  const macroFilter = thesis_type === 'macro'
    ? eq(schema.claimThesisMappings.macroThesisId, thesis_id)
    : eq(schema.claimThesisMappings.assetThesisId, thesis_id);

  const existing = await db.select({ id: schema.claimThesisMappings.id })
    .from(schema.claimThesisMappings)
    .where(and(
      eq(schema.claimThesisMappings.mainClaimId, claim_id),
      macroFilter,
    ));

  if (existing.length > 0) {
    console.error(`Mapping already exists between claim ${claim_id} and ${thesis_type} thesis ${thesis_id}`);
    process.exit(1);
  }

  // Create mapping
  const [mapping] = await db.insert(schema.claimThesisMappings).values({
    mainClaimId: claim_id,
    macroThesisId: thesis_type === 'macro' ? thesis_id : undefined,
    assetThesisId: thesis_type === 'asset' ? thesis_id : undefined,
    mappingType: mapping_type,
    confidence: confidence || null,
    notes: notes || null,
    mappedBy: 'user',
  }).returning({ id: schema.claimThesisMappings.id });

  // Journal entry on the claim
  await logToJournal({
    objectType: 'claim',
    objectId: claim_id,
    objectTitle: claim.title,
    actionType: 'claim_linked',
    actionDescription: `Linked to ${thesis_type} thesis "${thesis.title}" as ${mapping_type}`,
    newState: { thesisId: thesis_id, thesisType: thesis_type, mappingType: mapping_type },
    source: 'user',
  });

  // Journal entry on the thesis
  await logToJournal({
    objectType: thesis_type === 'macro' ? 'macro_thesis' : 'asset_thesis',
    objectId: thesis_id,
    objectTitle: thesis.title,
    actionType: 'claim_linked',
    actionDescription: `Claim "${claim.title}" linked as ${mapping_type}`,
    newState: { claimId: claim_id, mappingType: mapping_type },
    source: 'user',
  });

  console.log(JSON.stringify({
    success: true,
    mappingId: mapping.id,
    claimId: claim_id,
    thesisId: thesis_id,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
