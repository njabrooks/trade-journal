import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { macroTheses, signals, signalEntityLinks, signalDataSnapshots } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * GET /api/theses/[id]/signal-health
 *
 * Returns parent thesis info + health summary of its active signals.
 * Used by cascade signal detail pages to show parent thesis health panel.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch thesis info
    const [thesis] = await db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        confidenceLevel: macroTheses.confidenceLevel,
        direction: macroTheses.direction,
      })
      .from(macroTheses)
      .where(eq(macroTheses.id, id))
      .limit(1);

    if (!thesis) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
    }

    // Fetch active signals linked to this thesis with their latest quantitative snapshot
    const parentSignals = await db
      .select({
        signalId: signals.id,
        type: signals.type,
        statement: signals.statement,
        importance: signals.importance,
        category: signals.category,
      })
      .from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(
        and(
          eq(signalEntityLinks.thesisId, id),
          eq(signalEntityLinks.thesisType, 'macro'),
          eq(signals.status, 'active')
        )
      );

    // For each signal, get the latest accepted quantitative snapshot
    const signalHealthItems = await Promise.all(
      parentSignals.map(async (sig) => {
        const [latestSnapshot] = await db
          .select({
            observedValue: signalDataSnapshots.observedValue,
            thresholdValue: signalDataSnapshots.thresholdValue,
            pctToThreshold: signalDataSnapshots.pctToThreshold,
            unit: signalDataSnapshots.unit,
            snapshotDate: signalDataSnapshots.snapshotDate,
            dataSource: signalDataSnapshots.dataSource,
          })
          .from(signalDataSnapshots)
          .where(
            and(
              eq(signalDataSnapshots.signalId, sig.signalId),
              eq(signalDataSnapshots.status, 'accepted'),
              sql`${signalDataSnapshots.observedValue} IS NOT NULL`
            )
          )
          .orderBy(desc(signalDataSnapshots.snapshotDate))
          .limit(1);

        return {
          ...sig,
          latestSnapshot: latestSnapshot || null,
        };
      })
    );

    // Compute summary stats
    const confirmationCount = signalHealthItems.filter(s => s.type === 'confirmation').length;
    const invalidationCount = signalHealthItems.filter(s => s.type === 'invalidation').length;
    const nearThresholdCount = signalHealthItems.filter(s => {
      const pct = s.latestSnapshot?.pctToThreshold;
      return pct != null && Number(pct) >= 75;
    }).length;

    return NextResponse.json({
      thesis,
      signals: signalHealthItems,
      summary: {
        totalActive: signalHealthItems.length,
        confirmationCount,
        invalidationCount,
        nearThresholdCount,
      },
    });
  } catch (error) {
    console.error('Error fetching thesis signal health:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thesis signal health' },
      { status: 500 }
    );
  }
}
