import { NextRequest, NextResponse } from 'next/server';
import { getMacroThesisById, deleteMacroThesis } from '@/db/queries/macroTheses';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: thesisId } = await params;

    // Check existence
    const existing = await getMacroThesisById(thesisId);
    if (!existing) {
      return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
    }

    await deleteMacroThesis(thesisId);
    return NextResponse.json({ success: true, message: 'Macro thesis deleted successfully' });
  } catch (error) {
    console.error('Error deleting macro thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete macro thesis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
