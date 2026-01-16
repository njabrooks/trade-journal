import { NextRequest, NextResponse } from 'next/server';
import {
  getRecommendationById,
  updateRecommendationStatus,
  deleteRecommendation,
} from '@/db/queries/research';
import { createMacroThesis } from '@/db/queries/macroTheses';
import { createAssetThesis } from '@/db/queries/assetTheses';
// REMOVED: createResearchMapping - deprecated, claims link directly to theses via claim_thesis_mappings
import { db } from '@/db';
import { underlyings, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/research/recommendations/[id]
 * Get a single recommendation by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recommendation = await getRecommendationById(id);

    if (!recommendation) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      recommendation,
    });
  } catch (error) {
    console.error('Error fetching recommendation:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch recommendation',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/research/recommendations/[id]
 * Update recommendation status (accept/reject/modify)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, modifications } = body; // action: 'accept' | 'reject' | 'modify'

    const recommendation = await getRecommendationById(id);
    if (!recommendation) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    if (action === 'reject') {
      await updateRecommendationStatus(id, 'rejected', false);
      return NextResponse.json({
        success: true,
        message: 'Recommendation rejected',
      });
    }

    if (action === 'accept') {
      // Handle different recommendation types
      if (recommendation.recommendationType === 'new_macro_thesis') {
        // Create new macro thesis
        const proposedData = recommendation.proposedData as any;
        if (!modifications?.title && !proposedData?.title) {
          return NextResponse.json(
            { error: 'Title is required to create a macro thesis' },
            { status: 400 }
          );
        }
        const thesisId = await createMacroThesis({
          title: modifications?.title || proposedData?.title || 'New Macro Thesis',
          description: modifications?.description !== undefined ? modifications.description : (proposedData?.description || null),
          thesisType: modifications?.thesisType || proposedData?.thesisType || 'secular',
          timeHorizon: modifications?.timeHorizon || proposedData?.timeHorizon || null,
          confidenceLevel: modifications?.confidenceLevel || proposedData?.confidenceLevel || null,
          status: 'active',
        });

        // REMOVED: createResearchMapping - deprecated, claims link directly to theses

        await updateRecommendationStatus(id, 'accepted', false);
        return NextResponse.json({
          success: true,
          message: 'Macro thesis created',
          thesisId,
        });
      } else if (recommendation.recommendationType === 'new_asset_thesis') {
        // Create new asset thesis
        const proposedData = recommendation.proposedData as any;
        if (!modifications?.title && !proposedData?.title) {
          return NextResponse.json(
            { error: 'Title is required to create an asset thesis' },
            { status: 400 }
          );
        }
        const ticker = modifications?.ticker || proposedData?.underlyingTicker;

        let underlyingId: string | null = null;
        if (ticker) {
          const [underlying] = await db
            .select()
            .from(underlyings)
            .where(eq(underlyings.ticker, ticker.toUpperCase()))
            .limit(1);
          underlyingId = underlying?.id || null;
        }

        const viewId = await createAssetThesis({
          title: modifications?.title || proposedData?.title || 'New Asset Thesis',
          description: modifications?.description !== undefined ? modifications.description : (proposedData?.description || null),
          narrative: modifications?.narrative !== undefined ? modifications.narrative : (proposedData?.narrative || null),
          underlyingId,
          timeHorizon: modifications?.timeHorizon || proposedData?.timeHorizon || null,
          confidenceLevel: modifications?.confidenceLevel || proposedData?.confidenceLevel || null,
          status: 'active',
        });

        // REMOVED: createResearchMapping - deprecated, claims link directly to theses

        await updateRecommendationStatus(id, 'accepted', false);
        return NextResponse.json({
          success: true,
          message: 'Asset view created',
          viewId,
        });
      } else if (
        recommendation.recommendationType === 'link_existing' ||
        recommendation.recommendationType === 'refute_existing'
      ) {
        // REMOVED: createResearchMapping calls - deprecated, claims link directly to theses
        // This recommendation type is no longer supported - use claim-to-thesis linking instead
        await updateRecommendationStatus(id, 'accepted', false);
        return NextResponse.json({
          success: true,
          message: 'Recommendation accepted (insight-level mappings deprecated, use claim linking)',
        });
      }

      return NextResponse.json(
        { error: 'Unknown recommendation type' },
        { status: 400 }
      );
    }

    if (action === 'modify') {
      // Mark as modified - user will handle creation manually
      await updateRecommendationStatus(id, 'modified', true);
      return NextResponse.json({
        success: true,
        message: 'Recommendation marked as modified',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use accept, reject, or modify' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating recommendation:', error);
    return NextResponse.json(
      {
        error: 'Failed to update recommendation',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/research/recommendations/[id]
 * Delete a recommendation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteRecommendation(id);

    return NextResponse.json({
      success: true,
      message: 'Recommendation deleted',
    });
  } catch (error) {
    console.error('Error deleting recommendation:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete recommendation',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

