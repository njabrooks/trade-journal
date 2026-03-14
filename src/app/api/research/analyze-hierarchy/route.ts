import { NextRequest, NextResponse } from 'next/server';
import { getResearchInsightById } from '@/db/queries/research';
import { analyzeHierarchy } from '@/lib/services/ai-hierarchy-analysis';
import { getDefaultModel, type AIModel } from '@/lib/services/ai-providers';

/**
 * POST /api/research/analyze-hierarchy
 * Analyze research insight against existing hierarchy and generate recommendations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { insightId, model } = body;

    if (!insightId) {
      return NextResponse.json(
        { error: 'insightId is required' },
        { status: 400 }
      );
    }

    // Get the insight
    const insight = await getResearchInsightById(insightId);
    if (!insight) {
      return NextResponse.json(
        { error: 'Research insight not found' },
        { status: 404 }
      );
    }

    // Analyze hierarchy
    const selectedModel: AIModel = model || getDefaultModel();
    const recommendationIds = await analyzeHierarchy(insight, selectedModel);

    return NextResponse.json({
      success: true,
      message: `Generated ${recommendationIds.length} recommendations`,
      recommendationIds,
      count: recommendationIds.length,
    });
  } catch (error) {
    console.error('Error analyzing hierarchy:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError =
      errorMessage.includes('authentication') ||
      errorMessage.includes('apiKey') ||
      errorMessage.includes('API key');

    if (isAuthError) {
      const isDev = process.env.NODE_ENV === 'development';
      return NextResponse.json(
        {
          error: 'AI API key not configured',
          message: isDev
            ? `Missing API key for selected model. Configure OPENAI_API_KEY or GOOGLE_AI_API_KEY in .env.local`
            : 'AI API key environment variable is not set. Please configure the API key for your selected model.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to analyze hierarchy',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

