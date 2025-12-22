import { NextRequest, NextResponse } from 'next/server';
import { getResearchInsightById, updateResearchInsight } from '@/db/queries/research';

/**
 * PATCH /api/research/insights
 * Update a research insight (for human review)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Insight ID is required' }, { status: 400 });
    }

    // Check existence
    const existing = await getResearchInsightById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Research insight not found' }, { status: 404 });
    }

    await updateResearchInsight(id, updates);
    return NextResponse.json({ success: true, message: 'Research insight updated successfully' });
  } catch (error) {
    console.error('Error updating research insight:', error);
    return NextResponse.json(
      {
        error: 'Failed to update research insight',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
