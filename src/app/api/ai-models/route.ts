import { NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/services/ai-providers';

/**
 * GET /api/ai-models
 * Get list of available AI models with pricing
 */
export async function GET() {
  try {
    const models = getAvailableModels();
    return NextResponse.json({ success: true, models });
  } catch (error) {
    console.error('Error fetching available models:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch available models',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

