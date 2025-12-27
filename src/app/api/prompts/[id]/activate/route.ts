import { NextRequest, NextResponse } from 'next/server';
import { getPromptById, setPromptAsActive, type PromptType } from '@/db/queries/prompts';

/**
 * POST /api/prompts/[id]/activate
 * Set a prompt as active (deactivates other active prompts of same type)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prompt = await getPromptById(id);

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt not found' }, { status: 404 });
    }

    await setPromptAsActive(id, prompt.promptType as PromptType);

    return NextResponse.json({
      success: true,
      message: 'Prompt activated',
    });
  } catch (error) {
    console.error('Error activating prompt:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to activate prompt',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

