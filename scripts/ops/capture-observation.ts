#!/usr/bin/env tsx

/**
 * Capture a conversation / research observation as a lightweight, sourced claim.
 *
 * D4 (docs/v2/10 §5) — the one-shot capture path for the loose-agent model. An
 * insight that surfaces in conversation (or from a deep-research / ad-hoc agent pass)
 * is durably captured so it feeds a thesis's living underwriting instead of being lost
 * in chat. It writes, in one go:
 *
 *   1. research_artifacts  — the excerpt (source_type=conversation by default; status=structured).
 *                            NO research_insight row (a lightweight observation skips that layer).
 *   2. main_claims         — a lightweight claim: title + claim + category (+ optional qualifier),
 *                            Toulmin fields left null, provenance via source_artifact_id (NOT
 *                            source_insight_id). This is legal — main_claims only requires
 *                            title/category/claim/status.
 *   3. claim_thesis_mappings (optional) — link the observation to a thesis by bearing. Any ACTIVE
 *                            thesis (developing OR monitoring) is a valid target — monitoring is a
 *                            position flag, not an info-gate (docs/v2/10 §7). A direct link here
 *                            does not pass through the relate-research gate.
 *
 * The synthesis (/build-core-argument) reads these alongside Tana claims because they are
 * main_claims linked via claim_thesis_mappings — no separate per-source path.
 *
 * Usage:
 *   npx tsx scripts/ops/capture-observation.ts \
 *     --text "HBM content-per-wafer keeps rising into 2027 as Vera Rubin lifts layer counts" \
 *     --title "HBM content-per-wafer rising into 2027" \
 *     --category asset_specific \
 *     --source-type conversation \
 *     --tickers "ENTG" \
 *     --link-to-thesis-id <uuid> --link-to-thesis-type asset --mapping-type supports
 *
 * Required: --text, --category
 * Optional: --title (default: first 80 chars of --text), --source-type (default: conversation;
 *             one of conversation|deep_research|agent_research|article|transcript|note|report|video|manual),
 *           --source-url, --tickers (comma list), --qualifier (high|medium|low|exploratory),
 *           --link-to-thesis-id, --link-to-thesis-type (macro|asset), --mapping-type (default: supports),
 *           --mapping-notes, --source (journal/mapping origin: user|skill|automation; default user),
 *           --status (claim status; default draft), --dry-run
 */

import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { eq } from 'drizzle-orm';
import { RESEARCH_SOURCE_TYPES } from '@/lib/research/sourceTypes';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      // Boolean flags (no value / next token is another flag)
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const CATEGORIES = ['macro', 'asset_specific'];
const QUALIFIERS = ['high', 'medium', 'low', 'exploratory'];
const MAPPING_TYPES = ['supports', 'refutes', 'foundation'];

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const {
    text,
    title,
    category,
    source_type = 'conversation',
    source_url,
    tickers,
    qualifier,
    link_to_thesis_id,
    link_to_thesis_type,
    mapping_type = 'supports',
    mapping_notes,
    source = 'user',
    status = 'draft',
  } = args;
  const dryRun = args.dry_run === 'true';

  // ---- validation -------------------------------------------------------
  if (!text || !category) {
    console.error('Required: --text, --category (macro|asset_specific)');
    process.exit(1);
  }
  if (!CATEGORIES.includes(category)) {
    console.error(`Invalid --category "${category}". Must be one of: ${CATEGORIES.join(', ')}`);
    process.exit(1);
  }
  if (!(RESEARCH_SOURCE_TYPES as readonly string[]).includes(source_type)) {
    console.error(`Invalid --source-type "${source_type}". Must be one of: ${RESEARCH_SOURCE_TYPES.join(', ')}`);
    process.exit(1);
  }
  if (qualifier && !QUALIFIERS.includes(qualifier)) {
    console.error(`Invalid --qualifier "${qualifier}". Must be one of: ${QUALIFIERS.join(', ')}`);
    process.exit(1);
  }
  if (link_to_thesis_id) {
    if (!link_to_thesis_type || !['macro', 'asset'].includes(link_to_thesis_type)) {
      console.error('--link-to-thesis-id requires --link-to-thesis-type (macro|asset)');
      process.exit(1);
    }
    if (!MAPPING_TYPES.includes(mapping_type)) {
      console.error(`Invalid --mapping-type "${mapping_type}". Must be one of: ${MAPPING_TYPES.join(', ')}`);
      process.exit(1);
    }
  }

  const claimTitle = title || (text.length > 80 ? `${text.slice(0, 77)}…` : text);
  const tickersArray = tickers ? tickers.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean) : undefined;

  // ---- build the rows ---------------------------------------------------
  const artifactValues = {
    sourceType: source_type,
    title: claimTitle,
    rawContent: text,
    contentFormat: 'text',
    status: 'structured', // already an extracted observation; no further processing needed
    sourceUrl: source_url || null,
    metadata: { origin: 'capture-observation', source, tickers: tickersArray ?? null },
  };

  // ---- dry run ----------------------------------------------------------
  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      wouldCreate: {
        artifact: artifactValues,
        claim: {
          title: claimTitle, claim: text, category, qualifier: qualifier || null,
          relevantTickers: tickersArray ?? null, status, sourceArtifactId: '<artifact.id>', sourceInsightId: null,
        },
        link: link_to_thesis_id
          ? { thesisId: link_to_thesis_id, thesisType: link_to_thesis_type, mappingType: mapping_type, mappedBy: source }
          : null,
      },
    }, null, 2));
    await closeDb();
    process.exit(0);
  }

  // ---- 1. artifact ------------------------------------------------------
  const [artifact] = await db
    .insert(schema.researchArtifacts)
    .values(artifactValues)
    .returning({ id: schema.researchArtifacts.id });

  // ---- 2. lightweight claim (provenance via source_artifact_id) ---------
  const [claim] = await db
    .insert(schema.mainClaims)
    .values({
      title: claimTitle,
      claim: text,
      category,
      qualifier: qualifier || null,
      relevantTickers: tickersArray,
      status,
      sourceArtifactId: artifact.id,
      sourceInsightId: null,
    })
    .returning({ id: schema.mainClaims.id, title: schema.mainClaims.title });

  // ---- 3. optional thesis link ------------------------------------------
  let thesisLinked = false;
  if (link_to_thesis_id && link_to_thesis_type) {
    const thesisTable = link_to_thesis_type === 'macro' ? schema.macroTheses : schema.assetTheses;
    const [thesis] = await db.select({ id: thesisTable.id }).from(thesisTable).where(eq(thesisTable.id, link_to_thesis_id));
    if (!thesis) {
      console.error(`${link_to_thesis_type} thesis with id ${link_to_thesis_id} not found (artifact ${artifact.id} + claim ${claim.id} were created)`);
      await closeDb();
      process.exit(1);
    }
    await db.insert(schema.claimThesisMappings).values({
      mainClaimId: claim.id,
      macroThesisId: link_to_thesis_type === 'macro' ? link_to_thesis_id : undefined,
      assetThesisId: link_to_thesis_type === 'asset' ? link_to_thesis_id : undefined,
      mappingType: mapping_type,
      mappedBy: source,
      notes: mapping_notes || 'Captured observation',
    });
    thesisLinked = true;
  }

  // ---- journal ----------------------------------------------------------
  await logToJournal({
    objectType: 'claim',
    objectId: claim.id,
    objectTitle: claimTitle,
    actionType: 'created',
    actionDescription: `Captured observation (${source_type}): "${claimTitle}"${thesisLinked ? ` — linked to ${link_to_thesis_type} thesis ${link_to_thesis_id} (${mapping_type})` : ''}`,
    newState: { status, category, sourceType: source_type, artifactId: artifact.id, thesisLinked },
    source,
  });

  console.log(JSON.stringify({
    success: true,
    artifactId: artifact.id,
    claimId: claim.id,
    title: claim.title,
    sourceType: source_type,
    thesisLinked,
    thesisId: link_to_thesis_id || null,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
