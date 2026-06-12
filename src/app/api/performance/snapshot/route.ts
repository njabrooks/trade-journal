import { NextResponse } from 'next/server';
import { getPerformanceOverview } from '@/db/queries/thesisPerformance';

export const dynamic = 'force-dynamic';

/**
 * Compact performance snapshot for the morning screen — top/bottom asset
 * theses by cumulative P&L plus the additive totals. Full detail lives at
 * /performance.
 */
export async function GET() {
  try {
    const overview = await getPerformanceOverview();
    const theses = overview.assetTheses;

    const totals = {
      cumulative: Math.round(theses.reduce((s, t) => s + t.latestCumulative, 0) * 100) / 100,
      realized: Math.round(theses.reduce((s, t) => s + t.latestRealized, 0) * 100) / 100,
      unrealized: Math.round(theses.reduce((s, t) => s + t.latestUnrealized, 0) * 100) / 100,
      thesisCount: theses.length,
    };

    const slim = (t: (typeof theses)[number]) => ({
      thesisId: t.thesisId,
      title: t.title,
      ticker: t.ticker,
      latestCumulative: t.latestCumulative,
      confidence: t.confidence,
    });

    return NextResponse.json({
      totals,
      top: theses.slice(0, 3).map(slim),
      bottom: theses.slice(-3).reverse().map(slim).filter(
        (t) => !theses.slice(0, 3).some((x) => x.thesisId === t.thesisId)
      ),
    });
  } catch (error) {
    console.error('Error building performance snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to build performance snapshot' },
      { status: 500 }
    );
  }
}
