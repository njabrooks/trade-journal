import { NextRequest, NextResponse } from 'next/server';
import { getAssetViewById, deleteAssetView } from '@/db/queries/assetViews';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: viewId } = await params;

    // Check existence
    const existing = await getAssetViewById(viewId);
    if (!existing) {
      return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
    }

    await deleteAssetView(viewId);
    return NextResponse.json({ success: true, message: 'Asset view deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset view:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete asset view',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
