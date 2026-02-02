import { NextResponse } from 'next/server';
import { db } from '@/db';
import { underlyings } from '@/db/schema';
import { asc } from 'drizzle-orm';

export async function GET() {
  try {
    const allUnderlyings = await db
      .select({
        id: underlyings.id,
        ticker: underlyings.ticker,
        name: underlyings.name,
        assetClass: underlyings.assetClass,
        parentUnderlyingId: underlyings.parentUnderlyingId,
      })
      .from(underlyings)
      .orderBy(asc(underlyings.ticker));

    return NextResponse.json(allUnderlyings);
  } catch (error) {
    console.error('Error fetching underlyings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch underlyings' },
      { status: 500 }
    );
  }
}

