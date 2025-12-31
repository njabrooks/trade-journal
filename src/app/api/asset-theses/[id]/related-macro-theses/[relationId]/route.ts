import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * DELETE /api/asset-theses/[id]/related-macro-theses/[relationId]
 * Remove a related macro thesis from an asset thesis
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; relationId: string }> }
) {
  try {
    const { id: assetThesisId, relationId } = await params;

    const [deleted] = await db
      .delete(assetThesisRelatedMacroTheses)
      .where(
        and(
          eq(assetThesisRelatedMacroTheses.id, relationId),
          eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: 'Related macro thesis not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Related macro thesis removed successfully',
    });
  } catch (error: any) {
    console.error('Error removing related macro thesis:', error);
    return NextResponse.json(
      { error: 'Failed to remove related macro thesis', details: error.message },
      { status: 500 }
    );
  }
}

