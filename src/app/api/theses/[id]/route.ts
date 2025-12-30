import { NextRequest, NextResponse } from 'next/server';
import { getMacroThesisById, deleteMacroThesis, updateMacroThesis } from '@/db/queries/macroTheses';

export async function PATCH(
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

    const body = await request.json();

    // Validate and update
    await updateMacroThesis(thesisId, body);

    // Return updated thesis
    const updated = await getMacroThesisById(thesisId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating macro thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to update macro thesis',
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
