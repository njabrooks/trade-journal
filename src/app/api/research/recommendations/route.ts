import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationsForInsight } from '@/db/queries/research';

/**
 * GET /api/research/recommendations?insightId=xyz
 * Get all recommendations for a research insight
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const insightId = searchParams.get('insightId');

    if (!insightId) {
      return NextResponse.json(
        { error: 'insightId query parameter is required' },
        { status: 400 }
      );
    }

    const recommendations = await getRecommendationsForInsight(insightId);

    return NextResponse.json({
      success: true,
      recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch recommendations',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

