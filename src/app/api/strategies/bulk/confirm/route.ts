import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies } from '@/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { trackProcess } from '@/lib/services/processTracking';
import { resolveOrCreateStrategyType } from '@/lib/services/strategyTypes';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: string[] = body.ids;
    const strategyType: string | undefined = body.strategyType;
    let strategyTypeId: string | undefined = body.strategyTypeId;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    if (!strategyType && !strategyTypeId) {
      return NextResponse.json(
        { error: 'strategyType or strategyTypeId is required when confirming strategies' },
        { status: 400 }
      );
    }

    // Resolve strategyTypeId from name if not provided
    if (!strategyTypeId && strategyType) {
      strategyTypeId = await resolveOrCreateStrategyType(strategyType);
    }

    // Get account ID from first strategy for tracking
    const firstStrategy = await db
      .select({ accountId: strategies.accountId })
      .from(strategies)
      .where(eq(strategies.id, ids[0]))
      .limit(1);

    const accountId = firstStrategy[0]?.accountId ?? undefined;

    return await trackProcess(
      'recompute_strategy_metrics',
      'api',
      {
        accountId,
        strategyIds: ids,
        strategyType,
        strategyTypeId,
      },
      async () => {
    const now = new Date();
    await db
      .update(strategies)
      .set({
        isAuto: false,
        confirmedAt: now,
        strategyType: strategyType ?? undefined,
        strategyTypeId: strategyTypeId ?? undefined,
        updatedAt: now,
      })
      .where(inArray(strategies.id, ids));

        return { success: true, confirmed: ids.length };
      }
    ).then((result) => {
      return NextResponse.json(result);
    });
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

