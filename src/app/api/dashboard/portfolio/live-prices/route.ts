import { NextRequest, NextResponse } from 'next/server';
import { getLiveQuotes, type LiveQuote } from '@/lib/services/livePrices';

export const maxDuration = 30;

const MAX_TICKERS = 150;

function parseList(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_TICKERS
  );
}

/**
 * D14 live-pricing overlay. GET ?stk=AAPL,GLW&crypto=BTC,ETH
 * Returns { quotes: { 'STK:AAPL': LiveQuote, ... }, fetchedAt }.
 * Missing keys = no live price available; the client keeps the stored
 * snapshot value (with its as-of label) for those.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stk = parseList(searchParams.get('stk'));
    const crypto = parseList(searchParams.get('crypto'));

    if (stk.length === 0 && crypto.length === 0) {
      return NextResponse.json({ quotes: {}, fetchedAt: Date.now() });
    }

    const quotes = await getLiveQuotes({ stk, crypto });
    const payload: Record<string, LiveQuote> = {};
    for (const [key, quote] of quotes.entries()) payload[key] = quote;

    return NextResponse.json({ quotes: payload, fetchedAt: Date.now() });
  } catch (error) {
    console.error('Error fetching live prices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live prices' },
      { status: 500 }
    );
  }
}
