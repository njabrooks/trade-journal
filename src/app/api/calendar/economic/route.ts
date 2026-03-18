import { NextRequest, NextResponse } from 'next/server';
import { getUpcomingEconomicEvents, getEconomicEvents } from '@/db/queries/economicEvents';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const category = searchParams.get('category');
    const impact = searchParams.get('impact') ?? searchParams.get('impactLevel');
    const days = parseInt(searchParams.get('days') || '7', 10);

    let events;
    if (from || to || category || impact) {
      events = await getEconomicEvents({
        from: from || undefined,
        to: to || undefined,
        category: category || undefined,
        impactLevel: impact || undefined,
      });
    } else {
      events = await getUpcomingEconomicEvents(days);
    }

    return NextResponse.json({ events, count: events.length });
  } catch (error) {
    console.error('Error fetching economic events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch economic events', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
