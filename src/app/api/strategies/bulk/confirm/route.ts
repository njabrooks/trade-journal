import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies } from '@/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { trackProcess } from '@/lib/services/processTracking';

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
      },
      async () => {
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

