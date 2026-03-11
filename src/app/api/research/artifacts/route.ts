import { NextRequest, NextResponse } from 'next/server';
import {
  getResearchArtifactsList,
  getResearchArtifactById,
  createResearchArtifact,
  updateResearchArtifact,
} from '@/db/queries/research';
import type { NewResearchArtifact } from '@/db/schema';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const status = searchParams.get('status') || undefined;
    const sourceType = searchParams.get('sourceType') || undefined;
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || undefined;

    if (id) {
      const artifact = await getResearchArtifactById(id);
      if (!artifact) {
        return NextResponse.json({ error: 'Research artifact not found' }, { status: 404 });
      }
      return NextResponse.json(artifact);
    }

    const artifacts = await getResearchArtifactsList({
      status,
      sourceType,
      tags,
    });

    return NextResponse.json(artifacts);
  } catch (error) {
    console.error('Error fetching research artifacts:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch research artifacts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sourceType,
      sourceUrl,
      title,
      author,
      publishedDate,
      rawContent,
      contentFormat,
      fileStoragePath,
      fileName,
      fileSizeBytes,
      metadata,
      tags,
      ingestedBy,
    } = body;

    // Validation
    if (!title || !rawContent || !sourceType) {
      return NextResponse.json(
        { error: 'Title, raw content, and source type are required' },
        { status: 400 }
      );
    }

    // Validate sourceType
    const validSourceTypes = ['article', 'transcript', 'note', 'report', 'video', 'manual', 'thread'];
    if (!validSourceTypes.includes(sourceType)) {
      return NextResponse.json(
        { error: `Invalid source type. Must be one of: ${validSourceTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const artifactData: NewResearchArtifact = {
      sourceType,
      title,
      rawContent,
      sourceUrl: sourceUrl || null,
      author: author || null,
      publishedDate: publishedDate || null,
      contentFormat: contentFormat || 'text',
      fileStoragePath: fileStoragePath || null,
      fileName: fileName || null,
      fileSizeBytes: fileSizeBytes || null,
      metadata: metadata || null,
      tags: tags || null,
      status: 'raw',
      ingestedBy: ingestedBy || null,
    };

    const id = await createResearchArtifact(artifactData);

    return NextResponse.json({
      success: true,
      id,
      message: 'Research artifact created successfully',
    });
  } catch (error) {
    console.error('Error creating research artifact:', error);
    return NextResponse.json(
      {
        error: 'Failed to create research artifact',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Artifact ID is required' }, { status: 400 });
    }

    // Check existence
    const existing = await getResearchArtifactById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Research artifact not found' }, { status: 404 });
    }

    // Validate status if provided
    if (updates.status) {
      const validStatuses = ['raw', 'processing', 'structured', 'error'];
      if (!validStatuses.includes(updates.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate sourceType if provided
    if (updates.sourceType) {
      const validSourceTypes = ['article', 'transcript', 'note', 'report', 'video', 'manual', 'thread'];
      if (!validSourceTypes.includes(updates.sourceType)) {
        return NextResponse.json(
          { error: `Invalid source type. Must be one of: ${validSourceTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    await updateResearchArtifact(id, updates);
    return NextResponse.json({ success: true, message: 'Research artifact updated successfully' });
  } catch (error) {
    console.error('Error updating research artifact:', error);
    return NextResponse.json(
      {
        error: 'Failed to update research artifact',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
