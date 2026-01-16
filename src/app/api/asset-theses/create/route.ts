import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetTheses, claimThesisMappings, underlyings, mainClaims, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateAssetThesisTitle } from '@/lib/utils/title-generation';
import { computeThesisTriageForThesis } from '@/lib/derived/thesisTriage';

/**
 * POST /api/asset-theses/create
 *
 * Creates a new asset thesis with optional links to main claims and parent theses.
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
 *   status?: 'draft' | 'active' | 'complete' | 'rejected';
 *   positionStartDate?: string;
 *   positionEndDate?: string;
 *   targetPrice?: string;            // Numeric string
 *
 *   // Outcome tracking
 *   outcome?: 'validated' | 'invalidated' | 'partial' | 'ongoing';
 *   outcomeNotes?: string;
 *
 *   // Linkage
 *   macroThesisId?: string;          // Link to this macro thesis via junction table
 *   relatedMacroThesisIds?: string[];// Array of additional macro thesis IDs to link
 *   linkedMainClaimIds?: string[];   // Array of main_claim UUIDs to link
 *   linkedThesisIds?: string[];      // DEPRECATED: Use macroThesisId + relatedMacroThesisIds
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
      linkedThesisIds = [], // DEPRECATED
      macroThesisId, // For auto-linking when created from macro thesis context
      relatedMacroThesisIds = [], // For linking additional related macro theses
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
    const finalTitle = title || generateAssetThesisTitle({
      direction: direction || null,
      ticker: underlying.ticker,
      timeHorizon: timeHorizon || null,
    });

    // Create the asset thesis
    const [createdView] = await db
      .insert(assetTheses)
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
        assetThesisId: createdView.id,
        macroThesisId: null,
        mappingType: 'supports',
        mappedBy: 'creation', // Linked at view creation time
      }));

      await db.insert(claimThesisMappings).values(claimLinks);
      linkedClaimsCount = claimLinks.length;

      // Mark linked claims as 'active' (claim has been converted to an asset thesis) - standardized #ENH-048
      for (const mainClaimId of linkedMainClaimIds) {
        await db
          .update(mainClaims)
          .set({
            status: 'active',
            updatedAt: new Date()
          })
          .where(eq(mainClaims.id, mainClaimId));
      }
    }

    // Link macro theses via junction table
    // Combine macroThesisId (if provided) with relatedMacroThesisIds
    const allMacroThesisIds = [
      ...(macroThesisId ? [macroThesisId] : []),
      ...relatedMacroThesisIds,
    ];

    let linkedMacroThesesCount = 0;
    if (allMacroThesisIds.length > 0) {
      // Deduplicate in case same ID appears in both
      const uniqueMacroThesisIds = [...new Set(allMacroThesisIds)];
      const macroThesisLinks = uniqueMacroThesisIds.map((mtId: string) => ({
        assetThesisId: createdView.id,
        macroThesisId: mtId,
        addedBy: 'creation', // Linked at asset thesis creation time
      }));

      await db.insert(assetThesisRelatedMacroTheses).values(macroThesisLinks);
      linkedMacroThesesCount = macroThesisLinks.length;
    }

    // DEPRECATED: Link to parent theses via linkedThesisIds (backwards compat)
    let linkedThesesCount = 0;
    if (linkedThesisIds.length > 0) {
      // Store deprecated thesis IDs in notes for migration
      notes.legacy_linked_thesis_ids = linkedThesisIds;
      linkedThesesCount = linkedThesisIds.length;

      // Update notes
      await db
        .update(assetTheses)
        .set({ notes })
        .where(eq(assetTheses.id, createdView.id));
    }

    // Compute triage for the new thesis
    await computeThesisTriageForThesis(createdView.id, 'asset');

    return NextResponse.json({
      success: true,
      viewId: createdView.id,
      title: createdView.title,
      ticker: ticker.toUpperCase(),
      linkedClaimsCount,
      linkedMacroThesesCount,
      linkedThesesCount, // DEPRECATED: for backwards compat
      message: `Asset view created successfully${linkedClaimsCount > 0 ? ` with ${linkedClaimsCount} main claims linked` : ''}${linkedMacroThesesCount > 0 ? ` and ${linkedMacroThesesCount} macro theses linked` : ''}`,
    });
  } catch (error: any) {
    console.error('Error creating asset thesis:', error);
    return NextResponse.json(
      { error: 'Failed to create asset thesis', details: error.message },
      { status: 500 }
    );
  }
}
