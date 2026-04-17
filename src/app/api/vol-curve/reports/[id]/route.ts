import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { volCurveReports } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/vol-curve/reports/[id] — get full report with data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [report] = await db
      .select()
      .from(volCurveReports)
      .where(eq(volCurveReports.id, id));

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('[vol-curve/reports] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/vol-curve/reports/[id] — delete a report
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(volCurveReports).where(eq(volCurveReports.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[vol-curve/reports] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
