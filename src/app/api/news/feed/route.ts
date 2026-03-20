import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedFeed, type FeedItemSource } from '@/db/queries/unifiedFeed';

const VALID_SOURCES: FeedItemSource[] = [
  'world_monitor', 'thesis_monitor', 'sec_filing',
  'economic_event', 'earnings_event', 'claim_evidence', 'quant_snapshot',
];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const limit = Math.min(Number(params.get('limit') || 200), 500);
  const offset = Number(params.get('offset') || 0);
  const days = Number(params.get('days') || 3);
  const ticker = params.get('ticker') || undefined;

  const sourcesParam = params.get('sources');
  let sources: FeedItemSource[] | undefined;
  if (sourcesParam) {
    sources = sourcesParam.split(',').filter((s): s is FeedItemSource =>
      VALID_SOURCES.includes(s as FeedItemSource)
    );
    if (sources.length === 0) sources = undefined;
  }

  const result = await getUnifiedFeed({ limit, offset, sources, ticker, days });

  return NextResponse.json(result);
}
