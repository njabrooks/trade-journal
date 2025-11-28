import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { recomputeStateCodesForStrategies } from '@/lib/services/strategyStateCode';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: string[] = body.ids;
    const strategyType: string | undefined = body.strategyType;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    if (!strategyType) {
      return NextResponse.json(
        { error: 'strategyType is required when confirming strategies' },
        { status: 400 }
      );
    }

    const now = new Date();
    await db
      .update(strategies)
      .set({
        isAuto: false,
        confirmedAt: now,
        strategyType,
        updatedAt: now,
      })
      .where(inArray(strategies.id, ids));

    // Compute state codes for the confirmed strategies
    // This runs asynchronously and won't block the response
    recomputeStateCodesForStrategies(ids).catch((error) => {
      console.error('Failed to recompute state codes after confirmation:', error);
    });

    return NextResponse.json({ success: true, confirmed: ids.length });
  } catch (error) {
    console.error('Bulk confirm strategies error:', error);
    return NextResponse.json(
      {
        error: 'Failed to confirm strategies',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

