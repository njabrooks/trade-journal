import { NextRequest, NextResponse } from 'next/server';
import { updateRecommendationStatus } from '@/db/queries/research';

/**
 * POST /api/research/claims/suggestions/[id]/reject
 *
 * Rejects a claim-thesis suggestion.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await updateRecommendationStatus(id, 'rejected');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error rejecting suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to reject suggestion', details: error.message },
      { status: 500 }
    );
  }
}
