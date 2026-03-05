import { NextResponse } from 'next/server';
import { getLatestReport } from '@/db/queries/intelligence';

export async function GET() {
  try {
    const report = await getLatestReport();
    if (!report) {
      return NextResponse.json({ error: 'No reports found' }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching latest intelligence report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
