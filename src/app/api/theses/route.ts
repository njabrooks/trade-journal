import { NextRequest, NextResponse } from 'next/server';
import {
  getMacroThesesList,
  getMacroThesisById,
  createMacroThesis,
  updateMacroThesis,
} from '@/db/queries/macroTheses';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      const thesis = await getMacroThesisById(id);
      if (!thesis) {
        return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
      }
      return NextResponse.json(thesis);
    }

    const theses = await getMacroThesesList();
    return NextResponse.json(theses);
  } catch (error) {
    console.error('Error fetching macro theses:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch macro theses',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, thesisType, timeHorizon, confidenceLevel, status, notes } = body;

    // Validation
    if (!title || !thesisType) {
      return NextResponse.json(
        { error: 'Title and thesis type are required' },
        { status: 400 }
      );
    }

    const id = await createMacroThesis({
      title,
      description,
      thesisType,
      timeHorizon,
      confidenceLevel,
      status: status ?? 'active',
      notes,
    });

    // Log to journal
    await logToJournal({
      objectType: 'macro_thesis',
      objectId: id,
      objectTitle: title,
      actionType: 'THESIS_CREATED',
      actionDescription: `Created macro thesis: ${title}`,
      newState: { title, thesisType, timeHorizon, confidenceLevel, status: status ?? 'active' },
      source: 'user',
    });

    return NextResponse.json({ success: true, id, message: 'Macro thesis created successfully' });
  } catch (error) {
    console.error('Error creating macro thesis:', error);
    return NextResponse.json(
      {
        error: 'Failed to create macro thesis',
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
      return NextResponse.json({ error: 'Thesis ID is required' }, { status: 400 });
    }

    // Check existence
    const existing = await getMacroThesisById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
    }

    await updateMacroThesis(id, updates);

    // Log to journal
    await logToJournal({
      objectType: 'macro_thesis',
      objectId: id,
      objectTitle: existing.title,
      actionType: 'THESIS_UPDATED',
      actionDescription: `Updated macro thesis: ${existing.title}`,
      previousState: { title: existing.title, status: existing.status, confidenceLevel: existing.confidenceLevel },
      newState: updates,
      source: 'user',
    });

    return NextResponse.json({ success: true, message: 'Macro thesis updated successfully' });
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
