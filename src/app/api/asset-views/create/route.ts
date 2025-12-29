import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetViews, claimThesisMappings, underlyings, mainClaims } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateAssetViewTitle } from '@/lib/utils/title-generation';

/**
 * POST /api/asset-views/create
 *
 * Creates a new asset view with optional links to main claims and parent theses.
 *
 * This is the standalone creation endpoint (not claim conversion).
 * Use this when creating a view from scratch or linking to existing entities.
 *
 * Request body:
 * {
 *   title: string;
 *   ticker: string;                   // Will lookup underlying_id from ticker
 *   description?: string;
 *   direction?: 'bullish' | 'bearish' | 'neutral';
 *   timeHorizon?: 'long_term' | 'medium_term' | 'short_term';
 *   confidenceLevel?: 'high' | 'medium' | 'low' | 'exploratory';
 *   status?: 'active' | 'under_review' | 'retired' | 'superseded';
 *   positionStartDate?: string;
 *   positionEndDate?: string;
 *   targetPrice?: string;            // Numeric string
 *
 *   // Outcome tracking
 *   outcome?: 'validated' | 'invalidated' | 'partial' | 'ongoing';
 *   outcomeNotes?: string;
 *
 *   // Linkage
 *   linkedMainClaimIds?: string[];   // Array of main_claim UUIDs to link
 *   linkedThesisIds?: string[];      // Array of macro_thesis UUIDs to link
 *
 *   // Additional metadata
 *   notes?: object;
 * }
 *
 * Response:
 * {
 *   success: true;
 *   viewId: string;
 *   linkedClaimsCount: number;
 *   linkedThesesCount: number;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      ticker,
      description,
      direction,
      timeHorizon,
      confidenceLevel,
      status = 'active',
      positionStartDate,
      positionEndDate,
      targetPrice,
      outcome,
      outcomeNotes,
      linkedMainClaimIds = [],
      linkedThesisIds = [],
      notes = {},
    } = body;

    // Validate required fields
    // Note: title is now optional and will be auto-generated if not provided
    if (!ticker) {
      return NextResponse.json(
        { error: 'Missing required field: ticker' },
        { status: 400 }
      );
    }

    // Validate direction if provided
    if (direction && !['bullish', 'bearish', 'neutral'].includes(direction)) {
      return NextResponse.json(
        { error: 'Invalid direction. Must be: bullish, bearish, or neutral' },
        { status: 400 }
      );
    }

    // Look up underlying by ticker (create if doesn't exist)
    let [underlying] = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker.toUpperCase()))
      .limit(1);

    // Create underlying if it doesn't exist
    if (!underlying) {
      [underlying] = await db
        .insert(underlyings)
        .values({
          ticker: ticker.toUpperCase(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    // Auto-generate title if not provided
    const finalTitle = title || generateAssetViewTitle({
      direction: direction || null,
      ticker: underlying.ticker,
      timeHorizon: timeHorizon || null,
    });

    // Create the asset view
    const [createdView] = await db
      .insert(assetViews)
      .values({
        title: finalTitle,
        underlyingId: underlying.id,
        description: description || null,
        timeHorizon: timeHorizon || null,
        confidenceLevel: confidenceLevel || null,
        status,

        // Position structure
        direction: direction || null,
        positionStartDate: positionStartDate || null,
        positionEndDate: positionEndDate || null,
        targetPrice: targetPrice || null,

        // Outcome tracking
        outcome: outcome || null,
        outcomeNotes: outcomeNotes || null,
        actualOutcomeDate: null,

        // Metadata
        notes,

        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        lastReviewedAt: null,
        nextReviewDueAt: null,
      })
      .returning();

    // Link main claims to view (if provided)
    let linkedClaimsCount = 0;
    if (linkedMainClaimIds.length > 0) {
      const claimLinks = linkedMainClaimIds.map((mainClaimId: string) => ({
        mainClaimId,
        assetViewId: createdView.id,
        macroThesisId: null,
        mappingType: 'supports',
        mappedBy: 'creation', // Linked at view creation time
      }));

      await db.insert(claimThesisMappings).values(claimLinks);
      linkedClaimsCount = claimLinks.length;

      // Mark linked claims as 'confirmed' (claim has been converted to an asset view)
      for (const mainClaimId of linkedMainClaimIds) {
        await db
          .update(mainClaims)
          .set({
            status: 'confirmed',
            updatedAt: new Date()
          })
          .where(eq(mainClaims.id, mainClaimId));
      }
    }

    // TODO: Link to parent theses (if provided)
    // This requires a thesis-view linkage table that doesn't exist yet
    // For now, store thesis IDs in notes
    let linkedThesesCount = 0;
    if (linkedThesisIds.length > 0) {
      notes.linked_thesis_ids = linkedThesisIds;
      linkedThesesCount = linkedThesisIds.length;

      // Update notes with thesis links
      await db
        .update(assetViews)
        .set({ notes })
        .where(eq(assetViews.id, createdView.id));
    }

    return NextResponse.json({
      success: true,
      viewId: createdView.id,
      title: createdView.title,
      ticker: ticker.toUpperCase(),
      linkedClaimsCount,
      linkedThesesCount,
      message: `Asset view created successfully${linkedClaimsCount > 0 ? ` with ${linkedClaimsCount} main claims linked` : ''}${linkedThesesCount > 0 ? ` and ${linkedThesesCount} parent theses referenced` : ''}`,
    });
  } catch (error: any) {
    console.error('Error creating asset view:', error);
    return NextResponse.json(
      { error: 'Failed to create asset view', details: error.message },
      { status: 500 }
    );
  }
}
