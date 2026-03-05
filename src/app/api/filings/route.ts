import { NextRequest, NextResponse } from 'next/server';
import { getRecentFilings, getFilings } from '@/db/queries/secFilings';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const filingType = searchParams.get('filingType');
    const materialOnly = searchParams.get('materialOnly') === 'true';
    const days = parseInt(searchParams.get('days') || '7', 10);

    let filings;
    if (ticker || filingType || materialOnly) {
      filings = await getFilings({
        ticker: ticker || undefined,
        filingType: filingType || undefined,
        materialOnly: materialOnly || undefined,
        days,
      });
    } else {
      filings = await getRecentFilings(days);
    }

    return NextResponse.json({ filings, count: filings.length });
  } catch (error) {
    console.error('Error fetching SEC filings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEC filings', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
