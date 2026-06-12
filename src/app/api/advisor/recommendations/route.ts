import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { advisorRecommendations } from '@/db/schema';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { isUuid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Active (non-expired) advisor recommendations for the dashboard module. */
export async function GET() {
  try {
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
            gt(advisorRecommendations.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(advisorRecommendations.exposureUsd));

    return NextResponse.json({ recommendations: rows });
  } catch (error) {
    console.error('Error fetching advisor recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}

/** Dismiss or mark acted: PATCH { id, status: 'dismissed' | 'acted' } */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };

    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }
    if (status !== 'dismissed' && status !== 'acted') {
      return NextResponse.json(
        { error: "status must be 'dismissed' or 'acted'" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(advisorRecommendations)
      .set({ status, updatedAt: new Date() })
      .where(eq(advisorRecommendations.id, id))
      .returning({ id: advisorRecommendations.id });

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating recommendation:', error);
    return NextResponse.json({ error: 'Failed to update recommendation' }, { status: 500 });
  }
}
