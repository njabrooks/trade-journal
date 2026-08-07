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
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'node:url';

export interface RecommendationInput {
  ticker: string;
  exposureUsd?: number | null;
  pctNav?: number | null;
  structure: Record<string, unknown>;
  metrics: Record<string, unknown>;
  volContext?: Record<string, unknown> | null;
  rationale: string;
}

export interface BatchInput {
  scenario: string;
  expiresDays?: number;
  recommendations: RecommendationInput[];
}

export interface AdvisorRecommendationRow {
  batchId: string;
  scenario: string;
  ticker: string;
  underlyingId: string | null;
  exposureUsd: string | null;
  pctNav: string | null;
  structure: Record<string, unknown>;
  metrics: Record<string, unknown>;
  volContext: Record<string, unknown> | null;
  rationale: string;
  source: 'skill';
  expiresAt: Date;
}

export interface AdvisorRecommendationStore {
  resolveUnderlyingIds(tickers: string[]): Promise<Map<string, string>>;
  supersedeActive(scenario: string, updatedAt: Date): Promise<number>;
  insertRecommendations(rows: AdvisorRecommendationRow[]): Promise<number>;
}

export interface SaveAdvisorRecommendationDependencies {
  store: AdvisorRecommendationStore;
  now?: Date;
  batchId?: string;
}

function validateBatchInput(input: BatchInput): void {
  if (!input.scenario || !Array.isArray(input.recommendations) || input.recommendations.length === 0) {
    throw new Error('Batch must have scenario and a non-empty recommendations array');
  }
  for (const rec of input.recommendations) {
    if (!rec.ticker || !rec.structure || !rec.metrics || !rec.rationale) {
      throw new Error(`Recommendation missing required fields: ${JSON.stringify(rec).slice(0, 120)}`);
    }
  }
}

export async function saveAdvisorRecommendations(
  input: BatchInput,
  dependencies: SaveAdvisorRecommendationDependencies,
) {
  validateBatchInput(input);

  const now = dependencies.now ?? new Date();
  const batchId = dependencies.batchId ?? randomUUID();
  const expiresDays = input.expiresDays ?? 7;
  const expiresAt = new Date(now.getTime() + expiresDays * 86_400_000);
  const tickers = [...new Set(input.recommendations.map((rec) => rec.ticker.toUpperCase()))];
  const underlyingByTicker = await dependencies.store.resolveUnderlyingIds(tickers);
  const superseded = await dependencies.store.supersedeActive(input.scenario, now);
  const inserted = await dependencies.store.insertRecommendations(
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
    })),
  );

  return { batchId, inserted, superseded, expiresAt };
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
  validateBatchInput(input);
  const [{ db, closeDb }, { advisorRecommendations, underlyings }, { and, eq, inArray }] =
    await Promise.all([
      import('../lib/db.js'),
      import('../../src/db/schema.js'),
      import('drizzle-orm'),
    ]);
  const store: AdvisorRecommendationStore = {
    async resolveUnderlyingIds(tickers) {
      const rows = await db
        .select({ id: underlyings.id, ticker: underlyings.ticker })
        .from(underlyings)
        .where(inArray(underlyings.ticker, tickers));
      return new Map(rows.map((row) => [row.ticker, row.id]));
    },
    async supersedeActive(scenario, updatedAt) {
      const rows = await db
        .update(advisorRecommendations)
        .set({ status: 'superseded', updatedAt })
        .where(
          and(
            eq(advisorRecommendations.scenario, scenario),
            eq(advisorRecommendations.status, 'active'),
          ),
        )
        .returning({ id: advisorRecommendations.id });
      return rows.length;
    },
    async insertRecommendations(rows) {
      const inserted = await db
        .insert(advisorRecommendations)
        .values(rows)
        .returning({ id: advisorRecommendations.id });
      return inserted.length;
    },
  };

  const result = await saveAdvisorRecommendations(input, { store });

  console.log(JSON.stringify(result));
  await closeDb();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}
