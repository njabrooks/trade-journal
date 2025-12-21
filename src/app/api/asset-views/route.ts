import { NextRequest, NextResponse } from 'next/server';
import {
  getAssetViewsList,
  getAssetViewById,
  createAssetView,
  updateAssetView,
} from '@/db/queries/assetViews';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      const view = await getAssetViewById(id);
      if (!view) {
        return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
      }
      return NextResponse.json(view);
    }

    const views = await getAssetViewsList();
    return NextResponse.json(views);
  } catch (error) {
    console.error('Error fetching asset views:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch asset views',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      narrative,
      fundamentalContext,
      positioningContext,
      regimeContext,
      macroThesisId,
      underlyingId,
      timeHorizon,
      confidenceLevel,
      status,
      notes,
    } = body;

    // Validation
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const id = await createAssetView({
      title,
      description,
      narrative,
      fundamentalContext,
      positioningContext,
      regimeContext,
      macroThesisId,
      underlyingId,
      timeHorizon,
      confidenceLevel,
      status: status ?? 'active',
      notes,
    });

    return NextResponse.json({ success: true, id, message: 'Asset view created successfully' });
  } catch (error) {
    console.error('Error creating asset view:', error);
    return NextResponse.json(
      {
        error: 'Failed to create asset view',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Asset view ID is required' }, { status: 400 });
    }

    // Check existence
    const existing = await getAssetViewById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
    }

    await updateAssetView(id, updates);
    return NextResponse.json({ success: true, message: 'Asset view updated successfully' });
  } catch (error) {
    console.error('Error updating asset view:', error);
    return NextResponse.json(
      {
        error: 'Failed to update asset view',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
