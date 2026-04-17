import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { volCurveReports } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

// GET /api/vol-curve/reports — list all reports
export async function GET() {
  try {
    const reports = await db
      .select({
        id: volCurveReports.id,
        ticker: volCurveReports.ticker,
        direction: volCurveReports.direction,
        targetBase: volCurveReports.targetBase,
        targetHigh: volCurveReports.targetHigh,
        horizonMonths: volCurveReports.horizonMonths,
        downsideFloor: volCurveReports.downsideFloor,
        spot: volCurveReports.spot,
        iv30: volCurveReports.iv30,
        rv20: volCurveReports.rv20,
        ivRvRatio: volCurveReports.ivRvRatio,
        ivRank: volCurveReports.ivRank,
        strategyCount: volCurveReports.strategyCount,
        topStrategyLabel: volCurveReports.topStrategyLabel,
        topStrategyType: volCurveReports.topStrategyType,
        notes: volCurveReports.notes,
        createdAt: volCurveReports.createdAt,
      })
      .from(volCurveReports)
      .orderBy(desc(volCurveReports.createdAt));

    return NextResponse.json(reports);
  } catch (error) {
    console.error('[vol-curve/reports] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/vol-curve/reports — save a new report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportData, notes } = body;

    if (!reportData || !reportData.context || !reportData.strategies) {
      return NextResponse.json({ error: 'Invalid report data' }, { status: 400 });
    }

    const ctx = reportData.context;
    const thesis = reportData.thesis;
    const topStrategy = reportData.strategies[0];

    const [inserted] = await db
      .insert(volCurveReports)
      .values({
        ticker: ctx.ticker,
        direction: thesis.direction,
        targetBase: String(thesis.targetBase),
        targetHigh: String(thesis.targetHigh),
        horizonMonths: String(thesis.horizonMonths),
        downsideFloor: String(thesis.downsideFloor),
        spot: String(ctx.spot),
        iv30: ctx.iv30 != null ? String(ctx.iv30) : null,
        rv20: ctx.rv20 != null ? String(ctx.rv20) : null,
        ivRvRatio: ctx.ivRvRatio != null ? String(ctx.ivRvRatio) : null,
        ivRank: reportData.volRank?.ivRank != null ? String(reportData.volRank.ivRank) : null,
        strategyCount: reportData.strategies.length,
        topStrategyLabel: topStrategy?.label || null,
        topStrategyType: topStrategy?.type || null,
        reportData,
        notes: notes || null,
      })
      .returning({ id: volCurveReports.id });

    return NextResponse.json({ id: inserted!.id });
  } catch (error) {
    console.error('[vol-curve/reports] Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
