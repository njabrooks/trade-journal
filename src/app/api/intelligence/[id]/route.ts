import { NextRequest, NextResponse } from 'next/server';
import { getReportById } from '@/db/queries/intelligence';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const report = await getReportById(id);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching intelligence report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
