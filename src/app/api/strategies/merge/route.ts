import { NextRequest, NextResponse } from 'next/server';
import { mergeStrategies } from '@/lib/services/strategies';

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

    const stats = await mergeStrategies({ targetId, sourceIds });

    return NextResponse.json({
      success: true,
      message: 'Strategies merged successfully',
      stats,
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

