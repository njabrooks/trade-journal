import { NextRequest, NextResponse } from 'next/server';
import { deleteResearchMapping } from '@/db/queries/research';

// DELETE /api/research/mappings/[id] - Delete a mapping
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Mapping ID is required' },
        { status: 400 }
      );
    }

    await deleteResearchMapping(id);

    return NextResponse.json({
      success: true,
      message: 'Research mapping deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting research mapping:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete research mapping' },
      { status: 500 }
    );
  }
}
