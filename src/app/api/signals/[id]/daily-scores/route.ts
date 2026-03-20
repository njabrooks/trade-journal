import { NextResponse } from 'next/server';
import { db } from '@/db';
import { signalDataSnapshots, signals } from '@/db/schema';
import { eq, and, ne, asc, sql } from 'drizzle-orm';

/**
 * Conviction delta is thesis-health-aware, not just signal-activity-aware.
 *
 * For confirmation/completion signals:
 *   strengthening/confirmed → +1 (thesis is being supported)
 *   weakening/invalidated   → -1 (thesis is being undermined)
 *
 * For invalidation signals, the sign is INVERTED because:
 *   strengthening = threat is growing    → thesis conviction FALLS  → -1
 *   weakening     = threat is receding   → thesis conviction RISES  → +1
 *   confirmed     = invalidation triggered → thesis conviction at minimum → -1
 *   invalidated   = threat definitively passed → thesis conviction RISES → +1
 */
function getDelta(assessment: string, signalType: string): number {
  const isInvalidation = signalType === 'invalidation' || signalType === 'warning';
  const base: Record<string, number> = {
    strengthening: 1,
    confirmed: 1,
    weakening: -1,
    invalidated: -1,
    neutral: 0,
  };
  const raw = base[assessment] ?? 0;
  return isInvalidation ? -raw : raw;
}

/**
 * GET /api/signals/[id]/daily-scores
 *
 * Returns cumulative conviction scores from daily_synthesis snapshots.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 0. Fetch signal type (needed for thesis-health-aware delta)
    const [signal] = await db
      .select({ type: signals.type })
      .from(signals)
      .where(eq(signals.id, id))
      .limit(1);
    const signalType = signal?.type ?? 'confirmation';

    // 1. Fetch daily_synthesis rows for this signal, oldest first
    const synthRows = await db
      .select({
        snapshotDate: signalDataSnapshots.snapshotDate,
        assessment: signalDataSnapshots.assessment,
        evidenceSummary: signalDataSnapshots.evidenceSummary,
      })
      .from(signalDataSnapshots)
      .where(
        and(
          eq(signalDataSnapshots.signalId, id),
          eq(signalDataSnapshots.dataSource, 'daily_synthesis')
        )
      )
      .orderBy(asc(signalDataSnapshots.snapshotDate));

    // 2. Count non-synthesis observations per date
    const obsCounts = await db
      .select({
        date: sql<string>`${signalDataSnapshots.snapshotDate}::date::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(signalDataSnapshots)
      .where(
        and(
          eq(signalDataSnapshots.signalId, id),
          ne(signalDataSnapshots.dataSource, 'daily_synthesis')
        )
      )
      .groupBy(sql`${signalDataSnapshots.snapshotDate}::date`);

    const obsMap = new Map(obsCounts.map((r) => [r.date, r.count]));

    // 3. Build cumulative scores
    let cumulative = 0;
    const scores = synthRows.map((row) => {
      const assessment = row.assessment ?? 'neutral';
      const delta = getDelta(assessment, signalType);
      cumulative += delta;
      const dateStr = new Date(row.snapshotDate).toISOString().slice(0, 10);

      return {
        date: dateStr,
        delta,
        cumulativeScore: cumulative,
        assessment,
        observationCount: obsMap.get(dateStr) ?? 0,
        evidenceSummary: row.evidenceSummary ?? '',
      };
    });

    return NextResponse.json({ signalId: id, scores });
  } catch (error) {
    console.error('Error fetching daily scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily scores' },
      { status: 500 }
    );
  }
}
