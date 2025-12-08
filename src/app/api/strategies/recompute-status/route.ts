import { NextRequest, NextResponse } from 'next/server';
import { recomputeAllStrategyStatuses, restoreMergedStrategies } from '@/lib/services/strategies';

/**
 * Recomputes strategy statuses based on latest snapshot date positions
 * Can be called for all strategies or a specific one
 * Also restores any merged strategies that were incorrectly changed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategyId, restoreMerged } = body;

    // First, restore any merged strategies that were incorrectly changed
    const restoreResult = await restoreMergedStrategies();

    // Then recompute statuses (which will skip merged strategies)
    const result = await recomputeAllStrategyStatuses(strategyId);

    return NextResponse.json({
      success: true,
      message: `Recomputed status for ${result.updated} strategy(ies)${restoreResult.restored > 0 ? ` and restored ${restoreResult.restored} merged strategy(ies)` : ''}`,
      updated: result.updated,
      restored: restoreResult.restored,
      results: result.results,
      restoredStrategies: restoreResult.results,
    });
  } catch (error) {
    console.error('Recompute strategy status error:', error);
    return NextResponse.json(
      {
        error: 'Failed to recompute strategy statuses',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

