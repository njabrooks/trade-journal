/**
 * Persist a batch of advisor recommendations (W7 / D11).
 *
 * Reads JSON from stdin:
 * {
 *   "scenario": "hedge",
 *   "expiresDays": 7,                      // optional, default 7
 *   "recommendations": [{
 *     "ticker": "GLXY",
 *     "exposureUsd": 2633553, "pctNav": 0.221,
 *     "structure": { "type": "put_spread", "legs": [...] },
 *     "metrics": { "costPct": 0.0677, ... },
 *     "volContext": { "regime": "neutral", ... },   // optional
 *     "rationale": "..."
 *   }]
 * }
 *
 * Supersedes prior ACTIVE recommendations for the same scenario, inserts the
 * new batch, prints { batchId, inserted, superseded }.
 *
 * Usage: cat recs.json | npx tsx scripts/ops/save-advisor-recommendations.ts --stdin
 */
import { db, closeDb } from '../lib/db';
import { advisorRecommendations, underlyings } from '../../src/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

interface RecommendationInput {
  ticker: string;
  exposureUsd?: number | null;
  pctNav?: number | null;
  structure: Record<string, unknown>;
  metrics: Record<string, unknown>;
  volContext?: Record<string, unknown> | null;
  rationale: string;
}

interface BatchInput {
  scenario: string;
  expiresDays?: number;
  recommendations: RecommendationInput[];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  if (!process.argv.includes('--stdin')) {
    console.error('Pass --stdin and pipe the batch JSON');
    process.exit(1);
  }

  const raw = await readStdin();
  // tolerate leading non-JSON noise (e.g. a dotenv banner from a piped engine run)
  const start = raw.indexOf('\n{') >= 0 && !raw.trimStart().startsWith('{')
    ? raw.indexOf('\n{') + 1
    : raw.indexOf('{');
  const input = JSON.parse(raw.slice(start)) as BatchInput;

  if (!input.scenario || !Array.isArray(input.recommendations) || input.recommendations.length === 0) {
    console.error('Batch must have scenario and a non-empty recommendations array');
    process.exit(1);
  }
  for (const rec of input.recommendations) {
    if (!rec.ticker || !rec.structure || !rec.metrics || !rec.rationale) {
      console.error(`Recommendation missing required fields: ${JSON.stringify(rec).slice(0, 120)}`);
      process.exit(1);
    }
  }

  const batchId = randomUUID();
  const expiresDays = input.expiresDays ?? 7;
  const expiresAt = new Date(Date.now() + expiresDays * 86_400_000);

  // Resolve underlying ids
  const tickers = [...new Set(input.recommendations.map((r) => r.ticker.toUpperCase()))];
  const underlyingRows = await db
    .select({ id: underlyings.id, ticker: underlyings.ticker })
    .from(underlyings)
    .where(inArray(underlyings.ticker, tickers));
  const underlyingByTicker = new Map(underlyingRows.map((u) => [u.ticker, u.id]));

  // Supersede prior actives for this scenario — one live batch at a time
  const superseded = await db
    .update(advisorRecommendations)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(advisorRecommendations.scenario, input.scenario),
        eq(advisorRecommendations.status, 'active')
      )
    )
    .returning({ id: advisorRecommendations.id });

  const inserted = await db
    .insert(advisorRecommendations)
    .values(
      input.recommendations.map((rec) => ({
        batchId,
        scenario: input.scenario,
        ticker: rec.ticker.toUpperCase(),
        underlyingId: underlyingByTicker.get(rec.ticker.toUpperCase()) ?? null,
        exposureUsd: rec.exposureUsd != null ? String(rec.exposureUsd) : null,
        pctNav: rec.pctNav != null ? String(rec.pctNav) : null,
        structure: rec.structure,
        metrics: rec.metrics,
        volContext: rec.volContext ?? null,
        rationale: rec.rationale,
        source: 'skill',
        expiresAt,
      }))
    )
    .returning({ id: advisorRecommendations.id });

  console.log(
    JSON.stringify({ batchId, inserted: inserted.length, superseded: superseded.length, expiresAt })
  );
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
