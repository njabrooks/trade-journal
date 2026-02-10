import { NextRequest, NextResponse } from 'next/server';
import {
  createStrategy,
  updateStrategy,
  getStrategyById,
  getStrategies,
} from '@/lib/services/strategies';
import { getAllStrategyTypes } from '@/lib/services/strategyTypes';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId') || undefined;
    const status = searchParams.get('status') || undefined;
    const strategyKey = searchParams.get('strategyKey') || undefined;
    const strategyId = searchParams.get('id') || undefined;
    const strategyTypes = searchParams.get('strategyTypes') === 'true';

    // Return strategy types (now from strategy_types table)
    if (strategyTypes) {
      const types = await getAllStrategyTypes();
      return NextResponse.json(types);
    }

    if (strategyId) {
      const strategy = await getStrategyById(strategyId);
      if (!strategy) {
        return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      }
      return NextResponse.json(strategy);
    }

    const strategies = await getStrategies({ accountId, status, strategyKey });
    return NextResponse.json(strategies);
  } catch (error) {
    console.error('Error fetching strategies:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch strategies',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const strategyId = await createStrategy(body);

    return NextResponse.json({
      success: true,
      id: strategyId,
      message: 'Strategy created successfully',
    });
  } catch (error) {
    console.error('Error creating strategy:', error);
    return NextResponse.json(
      {
        error: 'Failed to create strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, confirm, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Strategy id is required' }, { status: 400 });
    }

    // If confirming, require strategyType/strategyTypeId and direction; assetThesisId is optional
    if (confirm) {
      if (!updates.strategyType && !updates.strategyTypeId) {
        return NextResponse.json(
          { error: 'strategyType or strategyTypeId is required when confirming a strategy' },
          { status: 400 }
        );
      }
      if (!updates.direction) {
        return NextResponse.json(
          { error: 'direction is required when confirming a strategy' },
          { status: 400 }
        );
      }
      // Note: assetThesisId is optional - can be linked later
    }

    await updateStrategy(id, { ...updates, confirm });

    return NextResponse.json({
      success: true,
      message: 'Strategy updated successfully',
    });
  } catch (error) {
    console.error('Error updating strategy:', error);
    return NextResponse.json(
      {
        error: 'Failed to update strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

