#!/usr/bin/env tsx

/**
 * Insert AI-generated thesis linkage suggestions for promoted claims.
 *
 * Reads a JSON array of suggestions from stdin and bulk-inserts into
 * research_hierarchy_recommendations. Called by /finalize-for-upload skill
 * after Claude Code performs semantic analysis of claims vs active theses.
 *
 * Usage:
 *   echo '<json>' | npx tsx scripts/ops/insert-claim-suggestions.ts --insight-id <uuid>
 *
 * Input JSON format (array):
 * [
 *   {
 *     "claimId": "uuid",
 *     "thesisId": "uuid",          // macro thesis ID (one of thesisId/assetThesisId required)
 *     "assetThesisId": "uuid",     // asset thesis ID
 *     "mappingType": "supports",   // "supports" | "refutes" | "foundation"
 *     "confidence": 0.75,          // 0.00-1.00
 *     "reasoning": "Claim's assertion about X directly supports thesis Y because..."
 *   }
 * ]
 */

import * as fs from 'fs';
import { db, closeDb, schema } from '../lib/db.js';

const { researchHierarchyRecommendations } = schema;

interface SuggestionInput {
  claimId: string;
  thesisId?: string;
  assetThesisId?: string;
  mappingType: 'supports' | 'refutes' | 'foundation';
  confidence: number;
  reasoning: string;
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
  const insightId = args.insight_id;

  if (!insightId) {
    console.error('Required: --insight-id <uuid>');
    process.exit(1);
  }

  // Read JSON from stdin
  const input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
  if (!input) {
    console.error('No JSON input on stdin');
    process.exit(1);
  }

  let suggestions: SuggestionInput[];
  try {
    suggestions = JSON.parse(input);
  } catch (e) {
    console.error('Invalid JSON input:', (e as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    console.log(JSON.stringify({ success: true, inserted: 0, message: 'No suggestions to insert' }));
    await closeDb();
    process.exit(0);
  }

  // Validate each suggestion
  for (const s of suggestions) {
    if (!s.claimId) {
      console.error('Each suggestion must have claimId');
      process.exit(1);
    }
    if (!s.thesisId && !s.assetThesisId) {
      console.error(`Suggestion for claim ${s.claimId}: must have thesisId or assetThesisId`);
      process.exit(1);
    }
    if (!s.reasoning) {
      console.error(`Suggestion for claim ${s.claimId}: must have reasoning`);
      process.exit(1);
    }
    if (typeof s.confidence !== 'number' || s.confidence < 0 || s.confidence > 1) {
      console.error(`Suggestion for claim ${s.claimId}: confidence must be 0.00-1.00`);
      process.exit(1);
    }
    if (!['supports', 'refutes', 'foundation'].includes(s.mappingType)) {
      console.error(`Suggestion for claim ${s.claimId}: mappingType must be supports/refutes/foundation`);
      process.exit(1);
    }
  }

  // Bulk insert
  const rows = suggestions.map(s => ({
    researchInsightId: insightId,
    mainClaimId: s.claimId,
    recommendationType: 'link_existing' as const,
    existingThesisId: s.thesisId || null,
    existingAssetThesisId: s.assetThesisId || null,
    mappingType: s.mappingType,
    confidenceScore: s.confidence.toFixed(2),
    reasoning: s.reasoning,
    status: 'pending',
    aiModel: 'Claude Code (inline analysis)',
  }));

  const inserted = await db.insert(researchHierarchyRecommendations).values(rows).returning({
    id: researchHierarchyRecommendations.id,
    claimId: researchHierarchyRecommendations.mainClaimId,
  });

  console.log(JSON.stringify({
    success: true,
    inserted: inserted.length,
    suggestions: inserted,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
