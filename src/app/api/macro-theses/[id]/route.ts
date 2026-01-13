import { NextRequest, NextResponse } from 'next/server';
import { getMacroThesisById } from '@/db/queries/macroTheses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const thesis = await getMacroThesisById(id);
    if (!thesis) {
      return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
    }

    return NextResponse.json(thesis);
  } catch (error) {
    console.error('Error fetching macro thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch macro thesis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
