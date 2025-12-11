import { NextRequest, NextResponse } from 'next/server';
import { mergeStrategies, getStrategyById } from '@/lib/services/strategies';
import { trackProcess } from '@/lib/services/processTracking';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetId, sourceIds } = body;

    if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json(
        { error: 'targetId and sourceIds (array) are required' },
        { status: 400 }
      );
    }

    // Get account ID from target strategy for tracking
    const targetStrategy = await getStrategyById(targetId);
    const accountId = targetStrategy?.accountId ?? undefined;

    return await trackProcess(
      'recompute_strategy_metrics',
      'api',
      {
        accountId,
        targetId,
        sourceIds,
      },
      async () => {
        const stats = await mergeStrategies({ targetId, sourceIds });

        // Fetch updated target strategy to return its new status
        const updatedTarget = await getStrategyById(targetId);

        return {
          success: true,
          message: 'Strategies merged successfully',
          stats,
          targetStrategy: updatedTarget ? {
            id: updatedTarget.id,
            status: updatedTarget.status,
          } : null,
        };
      }
    ).then((result) => {
      return NextResponse.json(result);
    });
  } catch (error) {
    console.error('Merge strategies error:', error);
    return NextResponse.json(
      {
        error: 'Failed to merge strategies',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

