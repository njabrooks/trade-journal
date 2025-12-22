import { NextRequest, NextResponse } from 'next/server';
import {
  getPrompts,
  createPrompt,
  getActivePrompt,
  type PromptType,
  type PromptStatus,
} from '@/db/queries/prompts';
import type { NewAIPrompt } from '@/db/schema';

/**
 * GET /api/prompts
 * List all prompts, optionally filtered by type and status
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const promptType = searchParams.get('promptType') as PromptType | null;
    const status = searchParams.get('status') as PromptStatus | null;

    const prompts = await getPrompts({
      promptType: promptType || undefined,
      status: status || undefined,
    });

    return NextResponse.json({ success: true, prompts });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch prompts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/prompts
 * Create a new prompt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      promptType,
      name,
      description,
      content,
      status = 'draft',
      isDefault = false,
      parentVersionId,
    } = body;

    // Validation
    if (!promptType || !name || !content) {
      return NextResponse.json(
        { success: false, error: 'promptType, name, and content are required' },
        { status: 400 }
      );
    }

    if (!['insight_extraction', 'hierarchy_analysis', 'recommendation_generation'].includes(promptType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid promptType' },
        { status: 400 }
      );
    }

    // Get version number (if parent version exists, increment; otherwise start at 1)
    let version = 1;
    if (parentVersionId) {
      const { getPromptById } = await import('@/db/queries/prompts');
      const parent = await getPromptById(parentVersionId);
      if (parent) {
        version = parent.version + 1;
      }
    }

    // Extract template variables from content
    const { extractTemplateVariables } = await import('@/lib/services/prompt-manager');
    const variables = extractTemplateVariables(content);

    const promptData: NewAIPrompt = {
      promptType,
      name,
      description: description || null,
      content,
      variables,
      version,
      parentVersionId: parentVersionId || null,
      status,
      isDefault,
      createdBy: null, // TODO: Get from auth session
    };

    const promptId = await createPrompt(promptData);

    // If setting as active, activate it
    if (status === 'active') {
      const { setPromptAsActive } = await import('@/db/queries/prompts');
      await setPromptAsActive(promptId, promptType);
    }

    return NextResponse.json({
      success: true,
      message: 'Prompt created successfully',
      promptId,
    });
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create prompt',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

