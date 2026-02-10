import { NextRequest, NextResponse } from 'next/server';
import {
  getAllStrategyTypes,
  getStrategyTypesWithUsageCount,
  createStrategyType,
} from '@/lib/services/strategyTypes';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const withUsage = searchParams.get('withUsage') === 'true';

    if (withUsage) {
      const types = await getStrategyTypesWithUsageCount(includeArchived);
      return NextResponse.json(types);
    }

    const types = await getAllStrategyTypes(includeArchived);
    return NextResponse.json(types);
  } catch (error) {
    console.error('Error fetching strategy types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy types', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const id = await createStrategyType({
      name: body.name.trim(),
      description: body.description ?? null,
      defaultDirection: body.defaultDirection ?? null,
      category: body.category ?? null,
      legCount: body.legCount ?? null,
      minDte: body.minDte ?? null,
      maxDte: body.maxDte ?? null,
      riskProfile: body.riskProfile ?? null,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error creating strategy type:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isDuplicate = message.includes('unique') || message.includes('duplicate');
    return NextResponse.json(
      { error: isDuplicate ? 'A strategy type with this name already exists' : 'Failed to create strategy type', message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
