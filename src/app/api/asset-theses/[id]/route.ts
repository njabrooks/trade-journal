import { NextRequest, NextResponse } from 'next/server';
import { getAssetThesisById, deleteAssetThesis, updateAssetThesis } from '@/db/queries/assetTheses';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: viewId } = await params;

    const assetThesis = await getAssetThesisById(viewId);
    if (!assetThesis) {
      return NextResponse.json({ error: 'Asset thesis not found' }, { status: 404 });
    }

    return NextResponse.json(assetThesis);
  } catch (error) {
    console.error('Error fetching asset thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch asset thesis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: viewId } = await params;

    // Check existence
    const existing = await getAssetThesisById(viewId);
    if (!existing) {
      return NextResponse.json({ error: 'Asset thesis not found' }, { status: 404 });
    }

    const body = await request.json();

    // Validate and update
    await updateAssetThesis(viewId, body);

    // Log to journal
    await logToJournal({
      objectType: 'asset_thesis',
      objectId: viewId,
      objectTitle: existing.title,
      actionType: 'THESIS_UPDATED',
      actionDescription: `Updated asset thesis: ${existing.title}`,
      previousState: { title: existing.title, status: existing.status, confidenceLevel: existing.confidenceLevel },
      newState: body,
      source: 'user',
    });

    // Return updated asset thesis
    const updated = await getAssetThesisById(viewId);
    return NextResponse.json(updated);
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: viewId } = await params;

    // Check existence
    const existing = await getAssetThesisById(viewId);
    if (!existing) {
      return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
    }

    await deleteAssetThesis(viewId);

    // Log to journal
    await logToJournal({
      objectType: 'asset_thesis',
      objectId: viewId,
      objectTitle: existing.title,
      actionType: 'THESIS_DELETED',
      actionDescription: `Deleted asset thesis: ${existing.title}`,
      previousState: { title: existing.title, status: existing.status, confidenceLevel: existing.confidenceLevel },
      source: 'user',
    });

    return NextResponse.json({ success: true, message: 'Asset view deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete asset thesis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
