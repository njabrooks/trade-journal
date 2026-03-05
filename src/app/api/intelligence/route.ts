import { NextRequest, NextResponse } from 'next/server';
import { getReports } from '@/db/queries/intelligence';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const reports = await getReports(limit, offset);
    return NextResponse.json({ reports, limit, offset });
  } catch (error) {
    console.error('Error fetching intelligence reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
