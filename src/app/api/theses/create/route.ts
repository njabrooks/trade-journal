import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { macroTheses, claimThesisMappings } from '@/db/schema';

/**
 * POST /api/theses/create
 *
 * Creates a new macro thesis with optional links to main claims.
 *
 * This is the standalone creation endpoint (not claim conversion).
 * Use this when creating a thesis from scratch or linking to existing main claims.
 *
 * Request body:
 * {
 *   title: string;
 *   description?: string;
 *   thesisType: 'secular' | 'cyclical' | 'structural';
 *   timeHorizon?: 'long_term' | 'medium_term' | 'short_term';
 *   confidenceLevel?: 'high' | 'medium' | 'low' | 'exploratory';
 *   status?: 'active' | 'under_review' | 'retired' | 'superseded';
 *
 *   // Position structure
 *   sectors?: string[];
 *   direction?: 'bullish' | 'bearish' | 'neutral';
 *   positionStartDate?: string;
 *   positionEndDate?: string;
 *
 *   // Outcome tracking
 *   outcome?: 'validated' | 'invalidated' | 'partial' | 'ongoing';
 *   outcomeNotes?: string;
 *
 *   // Main claim linkage
 *   linkedMainClaimIds?: string[];  // Array of main_claim UUIDs to link
 *
 *   // Additional metadata
 *   notes?: object;
 * }
 *
 * Response:
 * {
 *   success: true;
 *   thesisId: string;
 *   linkedClaimsCount: number;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      thesisType,
      timeHorizon,
      confidenceLevel,
      status = 'active',
      sectors = [],
      direction,
      positionStartDate,
      positionEndDate,
      outcome,
      outcomeNotes,
      linkedMainClaimIds = [],
      notes = {},
    } = body;

    // Validate required fields
    if (!title || !thesisType) {
      return NextResponse.json(
        { error: 'Missing required fields: title, thesisType' },
        { status: 400 }
      );
    }

    // Validate thesisType
    if (!['secular', 'cyclical', 'structural'].includes(thesisType)) {
      return NextResponse.json(
        { error: 'Invalid thesisType. Must be: secular, cyclical, or structural' },
        { status: 400 }
      );
    }

    // Create the macro thesis
    const [createdThesis] = await db
      .insert(macroTheses)
      .values({
        title,
        description: description || null,
        thesisType,
        timeHorizon: timeHorizon || null,
        confidenceLevel: confidenceLevel || null,
        status,

        // Position structure
        sectors: sectors.length > 0 ? sectors : [],
        direction: direction || null,
        positionStartDate: positionStartDate || null,
        positionEndDate: positionEndDate || null,

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

    // Link main claims to thesis (if provided)
    let linkedClaimsCount = 0;
    if (linkedMainClaimIds.length > 0) {
      const claimLinks = linkedMainClaimIds.map((mainClaimId: string) => ({
        mainClaimId,
        macroThesisId: createdThesis.id,
        assetViewId: null,
        mappingType: 'supports',
        mappedBy: 'creation', // Linked at thesis creation time
      }));

      await db.insert(claimThesisMappings).values(claimLinks);
      linkedClaimsCount = claimLinks.length;
    }

    return NextResponse.json({
      success: true,
      thesisId: createdThesis.id,
      title: createdThesis.title,
      linkedClaimsCount,
      message: `Macro thesis created successfully${linkedClaimsCount > 0 ? ` with ${linkedClaimsCount} main claims linked` : ''}`,
    });
  } catch (error: any) {
    console.error('Error creating thesis:', error);
    return NextResponse.json(
      { error: 'Failed to create thesis', details: error.message },
      { status: 500 }
    );
  }
}
