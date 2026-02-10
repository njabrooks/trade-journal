import { NextRequest, NextResponse } from 'next/server';
import {
  getStrategyTypeById,
  updateStrategyType,
  deleteStrategyType,
} from '@/lib/services/strategyTypes';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = await getStrategyTypeById(id);
    if (!type) {
      return NextResponse.json({ error: 'Strategy type not found' }, { status: 404 });
    }
    return NextResponse.json(type);
  } catch (error) {
    console.error('Error fetching strategy type:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy type', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await getStrategyTypeById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Strategy type not found' }, { status: 404 });
    }

    await updateStrategyType(id, {
      name: body.name,
      description: body.description,
      defaultDirection: body.defaultDirection,
      category: body.category,
      legCount: body.legCount,
      minDte: body.minDte,
      maxDte: body.maxDte,
      riskProfile: body.riskProfile,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating strategy type:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isDuplicate = message.includes('unique') || message.includes('duplicate');
    return NextResponse.json(
      { error: isDuplicate ? 'A strategy type with this name already exists' : 'Failed to update strategy type', message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteStrategyType(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting strategy type:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isReferenced = message.includes('still reference');
    return NextResponse.json(
      { error: message, message },
      { status: isReferenced ? 409 : 500 }
    );
  }
}
