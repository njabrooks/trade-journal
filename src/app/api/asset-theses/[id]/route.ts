import { NextRequest, NextResponse } from 'next/server';
import { getAssetThesisById, deleteAssetThesis } from '@/db/queries/assetTheses';

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
