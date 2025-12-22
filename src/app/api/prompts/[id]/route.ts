import { NextRequest, NextResponse } from 'next/server';
import {
  getPromptById,
  updatePrompt,
  deletePrompt,
  getPromptVersions,
} from '@/db/queries/prompts';

/**
 * GET /api/prompts/[id]
 * Get a single prompt by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prompt = await getPromptById(id);

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, prompt });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch prompt',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/prompts/[id]
 * Update a prompt (creates new version if content changed)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingPrompt = await getPromptById(id);
    if (!existingPrompt) {
      return NextResponse.json({ success: false, error: 'Prompt not found' }, { status: 404 });
    }

    // If content changed, create new version
    if (body.content && body.content !== existingPrompt.content) {
      const { createPrompt } = await import('@/db/queries/prompts');
      const { extractTemplateVariables } = await import('@/lib/services/prompt-manager');

      const variables = extractTemplateVariables(body.content);
      const newVersion = existingPrompt.version + 1;

      const newPromptId = await createPrompt({
        promptType: existingPrompt.promptType,
        name: existingPrompt.name,
        description: body.description ?? existingPrompt.description,
        content: body.content,
        variables,
        version: newVersion,
        parentVersionId: id,
        status: body.status ?? existingPrompt.status,
        isDefault: existingPrompt.isDefault,
        createdBy: null, // TODO: Get from auth session
      });

      // If setting as active, activate the new version
      if (body.status === 'active' || existingPrompt.status === 'active') {
        const { setPromptAsActive } = await import('@/db/queries/prompts');
        await setPromptAsActive(newPromptId, existingPrompt.promptType);
      }

      return NextResponse.json({
        success: true,
        message: 'Prompt updated (new version created)',
        promptId: newPromptId,
      });
    } else {
      // Just update metadata, no new version
      await updatePrompt(id, {
        description: body.description,
        status: body.status,
      });

      return NextResponse.json({
        success: true,
        message: 'Prompt updated',
      });
    }
  } catch (error) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update prompt',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/prompts/[id]
 * Delete a prompt (soft delete by archiving)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prompt = await getPromptById(id);

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt not found' }, { status: 404 });
    }

    await deletePrompt(id);

    return NextResponse.json({
      success: true,
      message: 'Prompt deleted (archived)',
    });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete prompt',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

