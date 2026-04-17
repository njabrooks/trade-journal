#!/usr/bin/env tsx

/**
 * Batch-create main claims from a JSON array on stdin.
 *
 * Inserts all claims in a single DB operation (one connection, one query per claim
 * due to returning clause). Each claim gets a journal entry. All journal entries
 * share a single batch_id for grouping.
 *
 * Usage:
 *   echo '<json>' | npx tsx scripts/ops/batch-create-claims.ts --source-insight-id <uuid>
 *
 * Input JSON format (array):
 * [
 *   {
 *     "title": "GPU Demand Exceeds Supply",
 *     "claim": "Data center GPU demand will outstrip supply through 2027",
 *     "category": "macro",
 *     "qualifier": "medium",
 *     "tickers": ["NVDA", "AMD"],
 *     "evidence": ["Hyperscaler capex up 40% YoY"],
 *     "reasoning": "Supply constraints + demand growth = pricing power",
 *     "backing": "Historical precedent from 2020 chip shortage",
 *     "rebuttal": ["China could develop alternatives"],
 *     "sourceClaimId": "claim-1",
 *     "timeHorizon": "medium_term"
 *   }
 * ]
 *
 * Required per claim: title, claim, category, qualifier
 * Optional per claim: tickers, evidence, reasoning, backing, rebuttal, sourceClaimId, timeHorizon
 * Optional flags: --source-insight-id (applied to all claims), --source (default: 'automation')
 */

import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { db, closeDb, schema, logToJournal } from '../lib/db.js';

const { mainClaims } = schema;

interface ClaimInput {
  title: string;
  claim: string;
  category: string;
  qualifier: string;
  tickers?: string[];
  evidence?: string[];
  reasoning?: string;
  backing?: string;
  rebuttal?: string[];
  sourceClaimId?: string;
  timeHorizon?: string;
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
  const sourceInsightId = args.source_insight_id || null;
  const source = (args.source as 'user' | 'skill' | 'automation') || 'automation';

  // Read JSON from stdin
  const input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
  if (!input) {
    console.error('No JSON input on stdin');
    process.exit(1);
  }

  let claims: ClaimInput[];
  try {
    claims = JSON.parse(input);
  } catch (e) {
    console.error('Invalid JSON input:', (e as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(claims) || claims.length === 0) {
    console.log(JSON.stringify({ success: true, created: 0, claims: [] }));
    await closeDb();
    process.exit(0);
  }

  // Validate each claim
  for (const c of claims) {
    if (!c.title || !c.claim || !c.category || !c.qualifier) {
      console.error(`Claim "${c.title || '(no title)'}": required fields: title, claim, category, qualifier`);
      process.exit(1);
    }
  }

  const batchId = randomUUID();
  const results: Array<{ id: string; title: string }> = [];

  // Insert claims and journal entries
  for (const c of claims) {
    const [inserted] = await db.insert(mainClaims).values({
      title: c.title,
      claim: c.claim,
      category: c.category,
      qualifier: c.qualifier,
      relevantTickers: c.tickers || null,
      evidence: c.evidence || null,
      reasoning: c.reasoning || null,
      backing: c.backing || null,
      rebuttal: c.rebuttal || null,
      status: 'draft',
      sourceInsightId: sourceInsightId,
      sourceClaimId: c.sourceClaimId || null,
      timeHorizon: c.timeHorizon || null,
    }).returning({ id: mainClaims.id, title: mainClaims.title });

    results.push(inserted);

    await logToJournal({
      objectType: 'claim',
      objectId: inserted.id,
      objectTitle: c.title,
      actionType: 'created',
      actionDescription: `Created claim: ${c.title} (${c.category}, qualifier: ${c.qualifier})`,
      newState: { status: 'draft', category: c.category, qualifier: c.qualifier },
      source,
      batchId,
    });
  }

  console.log(JSON.stringify({
    success: true,
    created: results.length,
    batchId,
    claims: results,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
