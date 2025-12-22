import { NextRequest, NextResponse } from 'next/server';
import { getResearchArtifactById, deleteResearchArtifact } from '@/db/queries/research';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check existence
    const existing = await getResearchArtifactById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Research artifact not found' }, { status: 404 });
    }

    await deleteResearchArtifact(id);
    return NextResponse.json({ success: true, message: 'Research artifact deleted successfully' });
  } catch (error) {
    console.error('Error deleting research artifact:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete research artifact',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
