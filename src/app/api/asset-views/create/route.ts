import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetViews, claimThesisMappings, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
 *   viewType: 'long' | 'short' | 'neutral';
 *   timeHorizon?: 'long_term' | 'medium_term' | 'short_term';
 *   confidenceLevel?: 'high' | 'medium' | 'low' | 'exploratory';
 *   status?: 'active' | 'under_review' | 'retired' | 'superseded';
 *
 *   // Position structure
 *   direction?: 'bullish' | 'bearish' | 'neutral';
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
      viewType,
      timeHorizon,
      confidenceLevel,
      status = 'active',
      direction,
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
    if (!title || !ticker || !viewType) {
      return NextResponse.json(
        { error: 'Missing required fields: title, ticker, viewType' },
        { status: 400 }
      );
    }

    // Validate viewType
    if (!['long', 'short', 'neutral'].includes(viewType)) {
      return NextResponse.json(
        { error: 'Invalid viewType. Must be: long, short, or neutral' },
        { status: 400 }
      );
    }

    // Look up underlying by ticker
    const [underlying] = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker.toUpperCase()))
      .limit(1);

    if (!underlying) {
      return NextResponse.json(
        { error: `Underlying not found for ticker: ${ticker}. Please add it to the underlyings table first.` },
        { status: 404 }
      );
    }

    // Create the asset view
    const [createdView] = await db
      .insert(assetViews)
      .values({
        title,
        underlyingId: underlying.id,
        description: description || null,
        viewType,
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
