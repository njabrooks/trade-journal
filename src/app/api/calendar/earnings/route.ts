import { NextRequest, NextResponse } from 'next/server';
import { getUpcomingEarnings, getEarningsEvents } from '@/db/queries/earningsEvents';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const ticker = searchParams.get('ticker');
    const days = parseInt(searchParams.get('days') || '14', 10);

    let events;
    if (from || to || ticker) {
      events = await getEarningsEvents({
        from: from || undefined,
        to: to || undefined,
        ticker: ticker || undefined,
      });
    } else {
      events = await getUpcomingEarnings(days);
    }

    return NextResponse.json({ events, count: events.length });
  } catch (error) {
    console.error('Error fetching earnings events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch earnings events', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
