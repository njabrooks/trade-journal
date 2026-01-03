import { NextRequest, NextResponse } from 'next/server';
import {
  getAssetThesesList,
  getAssetThesisById,
  createAssetThesis,
  updateAssetThesis,
} from '@/db/queries/assetTheses';
import { db } from '@/db';
import { assetThesisRelatedMacroTheses } from '@/db/schema';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      const view = await getAssetThesisById(id);
      if (!view) {
        return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
      }
      return NextResponse.json(view);
    }

    const views = await getAssetThesesList();
    return NextResponse.json(views);
  } catch (error) {
    console.error('Error fetching asset thesiss:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch asset thesiss',
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

    const id = await createAssetThesis({
      title,
      description,
      narrative,
      fundamentalContext,
      positioningContext,
      regimeContext,
      underlyingId,
      timeHorizon,
      confidenceLevel,
      status: status ?? 'active',
      notes,
    });

    // Link to macro thesis via junction table if provided
    if (macroThesisId) {
      await db.insert(assetThesisRelatedMacroTheses).values({
        assetThesisId: id,
        macroThesisId,
        addedBy: 'creation',
      });
    }

    return NextResponse.json({ success: true, id, message: 'Asset view created successfully' });
  } catch (error) {
    console.error('Error creating asset thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to create asset thesis',
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
    const existing = await getAssetThesisById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
    }

    await updateAssetThesis(id, updates);
    return NextResponse.json({ success: true, message: 'Asset view updated successfully' });
  } catch (error) {
    console.error('Error updating asset thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to update asset thesis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
