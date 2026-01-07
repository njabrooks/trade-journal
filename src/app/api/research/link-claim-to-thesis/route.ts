import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims, claimThesisMappings, macroTheses, assetTheses } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { computeThesisTriageForThesis } from '@/lib/derived/thesisTriage';

/**
 * POST /api/research/link-claim-to-thesis
 *
 * Creates a many-to-many relationship between a main claim and a thesis/view.
 * This enables:
 * - One main claim to support multiple theses/views
 * - One thesis/view to be supported by multiple main claims
 * - Different relationship types (supports, refutes, foundation)
 *
 * Request body:
 * {
 *   mainClaimId: string;                     // UUID of the main_claims row
 *   targetType: 'macro_thesis' | 'asset_view';
 *   targetId: string;                        // UUID of macro_theses or asset_theses row
 *   mappingType: 'supports' | 'refutes' | 'foundation';
 *   confidence?: 'high' | 'medium' | 'low';
 *   mappedBy: string;                        // Who created this mapping
 *   notes?: string;
 * }
 *
 * Response:
 * {
 *   success: true;
 *   mappingId: string;                       // UUID of created claim_thesis_mappings row
 *   mappingType: string;
 *   confidence: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mainClaimId, targetType, targetId, mappingType, confidence, mappedBy, notes } =
      body;

    // Validate required fields
    if (!mainClaimId || !targetType || !targetId || !mappingType || !mappedBy) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: mainClaimId, targetType, targetId, mappingType, mappedBy',
        },
        { status: 400 }
      );
    }

    // Validate targetType
    if (!['macro_thesis', 'asset_view'].includes(targetType)) {
      return NextResponse.json(
        { error: 'Invalid targetType. Must be: macro_thesis or asset_view' },
        { status: 400 }
      );
    }

    // Validate mappingType
    if (!['supports', 'refutes', 'foundation'].includes(mappingType)) {
      return NextResponse.json(
        { error: 'Invalid mappingType. Must be: supports, refutes, or foundation' },
        { status: 400 }
      );
    }

    // Validate confidence if provided
    if (confidence && !['high', 'medium', 'low'].includes(confidence)) {
      return NextResponse.json(
        { error: 'Invalid confidence. Must be: high, medium, or low' },
        { status: 400 }
      );
    }

    // Verify main claim exists
    const [mainClaim] = await db
      .select()
      .from(mainClaims)
      .where(eq(mainClaims.id, mainClaimId))
      .limit(1);

    if (!mainClaim) {
      return NextResponse.json({ error: 'Main claim not found' }, { status: 404 });
    }

    // Verify target exists
    if (targetType === 'macro_thesis') {
      const [thesis] = await db
        .select()
        .from(macroTheses)
        .where(eq(macroTheses.id, targetId))
        .limit(1);

      if (!thesis) {
        return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
      }
    } else {
      const [view] = await db
        .select()
        .from(assetTheses)
        .where(eq(assetTheses.id, targetId))
        .limit(1);

      if (!view) {
        return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
      }
    }

    // Check if this mapping already exists
    const existingMapping = await db
      .select()
      .from(claimThesisMappings)
      .where(
        and(
          eq(claimThesisMappings.mainClaimId, mainClaimId),
          targetType === 'macro_thesis'
            ? eq(claimThesisMappings.macroThesisId, targetId)
            : eq(claimThesisMappings.assetThesisId, targetId)
        )
      )
      .limit(1);

    if (existingMapping.length > 0) {
      return NextResponse.json(
        {
          error: 'This claim is already linked to this thesis/view',
          existingMappingId: existingMapping[0].id,
          suggestion: 'Update the existing mapping instead of creating a new one',
        },
        { status: 409 }
      );
    }

    // Create the mapping
    const [mapping] = await db
      .insert(claimThesisMappings)
      .values({
        mainClaimId,
        macroThesisId: targetType === 'macro_thesis' ? targetId : null,
        assetThesisId: targetType === 'asset_view' ? targetId : null,
        mappingType,
        confidence: confidence || null,
        mappedBy,
        notes: notes || null,
        mappedAt: new Date(),
      })
      .returning();

    // Update the main claim's updated_at timestamp
    await db
      .update(mainClaims)
      .set({ updatedAt: new Date() })
      .where(eq(mainClaims.id, mainClaimId));

    // Compute thesis triage after claim is linked
    // This creates/updates triage records for lifecycle events (rule #1: needs articulation, rule #2: new claims)
    const thesisType = targetType === 'macro_thesis' ? 'macro' : 'asset';
    const triageResult = await computeThesisTriageForThesis(targetId, thesisType as 'macro' | 'asset');
    console.log(`Thesis triage computed for ${thesisType}/${targetId}:`, triageResult);

    return NextResponse.json({
      success: true,
      mappingId: mapping.id,
      mappingType: mapping.mappingType,
      confidence: mapping.confidence,
      message: `Main claim linked to ${targetType} successfully`,
      triageCreated: triageResult.triageCreated,
    });
  } catch (error: any) {
    console.error('Error linking claim to thesis/view:', error);
    return NextResponse.json(
      { error: 'Failed to link claim to thesis/view', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/research/link-claim-to-thesis?mainClaimId=xxx
 *
 * Retrieves all thesis/view mappings for a given main claim
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mainClaimId = searchParams.get('mainClaimId');

    if (!mainClaimId) {
      return NextResponse.json(
        { error: 'Missing required parameter: mainClaimId' },
        { status: 400 }
      );
    }

    // Get all mappings for this claim
    const mappings = await db
      .select()
      .from(claimThesisMappings)
      .where(eq(claimThesisMappings.mainClaimId, mainClaimId));

    // Fetch thesis/view details for each mapping
    const enrichedMappings = await Promise.all(
      mappings.map(async (mapping) => {
        let target = null;
        let targetType = '';

        if (mapping.macroThesisId) {
          const [thesis] = await db
            .select()
            .from(macroTheses)
            .where(eq(macroTheses.id, mapping.macroThesisId))
            .limit(1);
          target = thesis;
          targetType = 'macro_thesis';
        } else if (mapping.assetThesisId) {
          const [view] = await db
            .select()
            .from(assetTheses)
            .where(eq(assetTheses.id, mapping.assetThesisId))
            .limit(1);
          target = view;
          targetType = 'asset_view';
        }

        return {
          mappingId: mapping.id,
          mappingType: mapping.mappingType,
          confidence: mapping.confidence,
          mappedBy: mapping.mappedBy,
          mappedAt: mapping.mappedAt,
          notes: mapping.notes,
          targetType,
          target,
        };
      })
    );

    return NextResponse.json({
      success: true,
      mainClaimId,
      mappings: enrichedMappings,
      count: enrichedMappings.length,
    });
  } catch (error: any) {
    console.error('Error fetching claim mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch claim mappings', details: error.message },
      { status: 500 }
    );
  }
}
