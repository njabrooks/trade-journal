import { NextRequest, NextResponse } from 'next/server';
import {
  linkPositionsToStrategies,
  linkTradesToStrategies,
  linkPositionToStrategy,
  linkTradeToStrategy,
} from '@/lib/services/strategyLinking';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, accountId, strategyId, strategyKey, positionId, tradeId } = body;

    // Manual linking
    if (type === 'position' && positionId && strategyId) {
      await linkPositionToStrategy(positionId, strategyId);
      return NextResponse.json({
        success: true,
        message: 'Position linked to strategy',
      });
    }

    if (type === 'trade' && tradeId && strategyId) {
      await linkTradeToStrategy(tradeId, strategyId);
      return NextResponse.json({
        success: true,
        message: 'Trade linked to strategy',
      });
    }

    // Automatic linking
    if (type === 'positions') {
      const result = await linkPositionsToStrategies(accountId, strategyKey);
      return NextResponse.json({
        success: true,
        message: `Linked ${result.linked} positions, skipped ${result.skipped}`,
        ...result,
      });
    }

    if (type === 'trades') {
      const result = await linkTradesToStrategies(accountId, strategyId);
      return NextResponse.json({
        success: true,
        message: `Linked ${result.linked} trades, skipped ${result.skipped}`,
        ...result,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid request. Provide type and appropriate IDs',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Strategy linking error:', error);
    return NextResponse.json(
      {
        error: 'Linking failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

