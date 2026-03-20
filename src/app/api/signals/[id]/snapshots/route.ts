import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signalDataSnapshots } from '@/db/schema';
import { eq, desc, and, gte } from 'drizzle-orm';

/**
 * GET /api/signals/[id]/snapshots?days=90
 *
 * Returns time-series snapshot data for a signal.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90', 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await db
      .select({
        id: signalDataSnapshots.id,
        snapshotDate: signalDataSnapshots.snapshotDate,
        observedValue: signalDataSnapshots.observedValue,
        thresholdValue: signalDataSnapshots.thresholdValue,
        pctToThreshold: signalDataSnapshots.pctToThreshold,
        unit: signalDataSnapshots.unit,
        assessment: signalDataSnapshots.assessment,
        evidenceSummary: signalDataSnapshots.evidenceSummary,
        dataSource: signalDataSnapshots.dataSource,
        reportId: signalDataSnapshots.reportId,
        intelligenceItemId: signalDataSnapshots.intelligenceItemId,
        status: signalDataSnapshots.status,
        claimId: signalDataSnapshots.claimId,
        createdAt: signalDataSnapshots.createdAt,
      })
      .from(signalDataSnapshots)
      .where(
        and(
          eq(signalDataSnapshots.signalId, id),
          gte(signalDataSnapshots.snapshotDate, since)
        )
      )
      .orderBy(desc(signalDataSnapshots.snapshotDate))
      .limit(500);

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error('Error fetching signal snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signal snapshots' },
      { status: 500 }
    );
  }
}
