import { NextRequest, NextResponse } from 'next/server';
import { getResearchArtifactById } from '@/db/queries/research';
import { processResearchArtifact, batchProcessArtifacts } from '@/lib/services/ai-research';

/**
 * POST /api/research/process
 * Process a single research artifact or batch process multiple artifacts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { artifactId, artifactIds } = body;

    // Batch processing
    if (artifactIds && Array.isArray(artifactIds)) {
      if (artifactIds.length === 0) {
        return NextResponse.json({ error: 'No artifact IDs provided' }, { status: 400 });
      }

      if (artifactIds.length > 50) {
        return NextResponse.json(
          { error: 'Maximum 50 artifacts can be processed at once' },
          { status: 400 }
        );
      }

      const result = await batchProcessArtifacts(artifactIds);

      return NextResponse.json({
        success: true,
        message: `Processed ${result.successful.length} artifacts successfully, ${result.failed.length} failed`,
        successful: result.successful,
        failed: result.failed,
      });
    }

    // Single artifact processing
    if (!artifactId) {
      return NextResponse.json(
        { error: 'Either artifactId or artifactIds is required' },
        { status: 400 }
      );
    }

    // Check if artifact exists
    const artifact = await getResearchArtifactById(artifactId);
    if (!artifact) {
      return NextResponse.json({ error: 'Research artifact not found' }, { status: 404 });
    }

    // Check if already processed
    if (artifact.status === 'structured') {
      return NextResponse.json(
        {
          error: 'Artifact already processed',
          message: 'This artifact has already been processed. Use reprocess endpoint to reprocess.',
        },
        { status: 400 }
      );
    }

    // Process the artifact
    const insightId = await processResearchArtifact(artifact);

    return NextResponse.json({
      success: true,
      message: 'Research artifact processed successfully',
      insightId,
    });
  } catch (error) {
    console.error('Error processing research artifact:', error);

    // Check if it's an API key error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError = errorMessage.includes('authentication') || errorMessage.includes('apiKey');

    if (isAuthError) {
      const isDev = process.env.NODE_ENV === 'development';
      return NextResponse.json(
        {
          error: 'Anthropic API key not configured',
          message: isDev
            ? 'Missing ANTHROPIC_API_KEY in .env.local. For free processing in dev mode, use: npx tsx scripts/process-research-with-claude.ts'
            : 'ANTHROPIC_API_KEY environment variable is not set. Please configure your Anthropic API key.',
          devAlternative: isDev
            ? 'Run "npx tsx scripts/process-research-with-claude.ts" to process research for free using Claude Code'
            : null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to process research artifact',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
