import { NextResponse } from 'next/server';
import { db } from '@/db';
import { advisorRecommendations } from '@/db/schema';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { summarizeAdvisorOutcomes } from '@/lib/derived/advisorOutcome';

export const dynamic = 'force-dynamic';

/** How far back the per-scenario hit-rate summary looks. */
const SUMMARY_WINDOW_DAYS = 180;

/**
 * Active (non-expired) advisor recommendations for the dashboard module, plus
 * the Lane C per-scenario hit-rate summary (acted/expired/dismissed + scored
 * outcome win rate) over the recent window.
 *
 * Status changes go through PATCH /api/advisor/recommendations/[id].
 */
export async function GET() {
  try {
    const now = new Date();
    const rows = await db
      .select({
        id: advisorRecommendations.id,
        batchId: advisorRecommendations.batchId,
        scenario: advisorRecommendations.scenario,
        ticker: advisorRecommendations.ticker,
        exposureUsd: sql<number | null>`CAST(${advisorRecommendations.exposureUsd} AS double precision)`,
        pctNav: sql<number | null>`CAST(${advisorRecommendations.pctNav} AS double precision)`,
        structure: advisorRecommendations.structure,
        metrics: advisorRecommendations.metrics,
        volContext: advisorRecommendations.volContext,
        rationale: advisorRecommendations.rationale,
        createdAt: advisorRecommendations.createdAt,
      })
      .from(advisorRecommendations)
      .where(
        and(
          eq(advisorRecommendations.status, 'active'),
          or(
            isNull(advisorRecommendations.expiresAt),
            gt(advisorRecommendations.expiresAt, now)
          )
        )
      )
      .orderBy(desc(advisorRecommendations.exposureUsd));

    const windowStart = new Date(now.getTime() - SUMMARY_WINDOW_DAYS * 86_400_000);
    const summaryRows = await db
      .select({
        scenario: advisorRecommendations.scenario,
        status: advisorRecommendations.status,
        outcome: advisorRecommendations.outcome,
        expiresAt: advisorRecommendations.expiresAt,
      })
      .from(advisorRecommendations)
      .where(gt(advisorRecommendations.createdAt, windowStart));

    return NextResponse.json({
      recommendations: rows,
      summary: summarizeAdvisorOutcomes(summaryRows, now),
    });
  } catch (error) {
    console.error('Error fetching advisor recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}
