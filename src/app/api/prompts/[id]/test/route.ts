import { NextRequest, NextResponse } from 'next/server';
import { getPromptById } from '@/db/queries/prompts';
import { renderPrompt } from '@/lib/services/prompt-manager';

/**
 * POST /api/prompts/[id]/test
 * Test a prompt against sample data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { context } = body;

    const prompt = await getPromptById(id);
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt not found' }, { status: 404 });
    }

    // Render the prompt with the provided context
    const rendered = renderPrompt(prompt.content, context || {});

    return NextResponse.json({
      success: true,
      rendered,
      variables: prompt.variables,
    });
  } catch (error) {
    console.error('Error testing prompt:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test prompt',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

