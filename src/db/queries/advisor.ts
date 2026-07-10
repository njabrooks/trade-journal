/**
 * Advisor history queries (docs/v2/21 — the /advisor page's data surface).
 *
 * The dashboard module (/api/advisor/recommendations) shows only ACTIVE
 * recommendations; this module serves the full record: every batch the advisor
 * has produced — scheduled or interactive — with generation time, lifecycle
 * status, rationale, and Lane C outcomes. Read-only.
 */
import { db } from '@/db';
import { advisorRecommendations } from '@/db/schema';
import { desc, gt, sql } from 'drizzle-orm';
import { summarizeAdvisorOutcomes } from '@/lib/derived/advisorOutcome';

export interface AdvisorHistoryRec {
  id: string;
  scenario: string;
  ticker: string;
  exposureUsd: number | null;
  pctNav: number | null;
  structure: { type?: string; legs?: Array<Record<string, unknown>> } | null;
  metrics: Record<string, number | null> | null;
  volContext: Record<string, unknown> | null;
  rationale: string;
  status: string; // raw status; 'active' past expiresAt is displayed as expired
  source: string;
  actedAt: Date | null;
  outcome: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface AdvisorBatch {
  batchId: string;
  scenario: string;
  source: string;
  createdAt: Date;
  expiresAt: Date | null;
  recs: AdvisorHistoryRec[];
}

/** All batches in the window, newest first, recommendations nested. */
export async function getAdvisorBatches(days = 90): Promise<AdvisorBatch[]> {
  const windowStart = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      id: advisorRecommendations.id,
      batchId: advisorRecommendations.batchId,
      scenario: advisorRecommendations.scenario,
      ticker: advisorRecommendations.ticker,
      exposureUsd: sql<
        number | null
      >`CAST(${advisorRecommendations.exposureUsd} AS double precision)`,
      pctNav: sql<number | null>`CAST(${advisorRecommendations.pctNav} AS double precision)`,
      structure: advisorRecommendations.structure,
      metrics: advisorRecommendations.metrics,
      volContext: advisorRecommendations.volContext,
      rationale: advisorRecommendations.rationale,
      status: advisorRecommendations.status,
      source: advisorRecommendations.source,
      actedAt: advisorRecommendations.actedAt,
      outcome: advisorRecommendations.outcome,
      createdAt: advisorRecommendations.createdAt,
      expiresAt: advisorRecommendations.expiresAt,
    })
    .from(advisorRecommendations)
    .where(gt(advisorRecommendations.createdAt, windowStart))
    .orderBy(desc(advisorRecommendations.createdAt));

  const byBatch = new Map<string, AdvisorBatch>();
  for (const row of rows) {
    let batch = byBatch.get(row.batchId);
    if (!batch) {
      batch = {
        batchId: row.batchId,
        scenario: row.scenario,
        source: row.source,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        recs: [],
      };
      byBatch.set(row.batchId, batch);
    }
    batch.recs.push(row as unknown as AdvisorHistoryRec);
  }
  return [...byBatch.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Per-scenario Lane C hit-rate summary (same shape the dashboard module uses). */
export async function getAdvisorScenarioSummary(days = 180) {
  const windowStart = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      scenario: advisorRecommendations.scenario,
      status: advisorRecommendations.status,
      outcome: advisorRecommendations.outcome,
      expiresAt: advisorRecommendations.expiresAt,
    })
    .from(advisorRecommendations)
    .where(gt(advisorRecommendations.createdAt, windowStart));
  return summarizeAdvisorOutcomes(rows, new Date());
}
