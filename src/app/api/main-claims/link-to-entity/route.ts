import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { claimThesisMappings, mainClaims, macroTheses, assetTheses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/main-claims/link-to-entity
 *
 * Links an existing main claim to an existing thesis or asset thesis.
 *
 * This allows flexible linking after entities are created separately,
 * rather than requiring linkage at creation time.
 *
 * Request body:
 * {
 *   mainClaimId: string;         // UUID of the main_claim to link
 *   entityType: 'thesis' | 'view';
 *   entityId: string;            // UUID of the thesis or view
 *   relationshipType?: 'supports' | 'refutes' | 'foundation';
 * }
 *
 * Response:
 * {
 *   success: true;
 *   linkId: string;
 *   message: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mainClaimId,
      entityType,
      entityId,
      relationshipType = 'supports',
    } = body;

    // Validate required fields
    if (!mainClaimId || !entityType || !entityId) {
      return NextResponse.json(
        { error: 'Missing required fields: mainClaimId, entityType, entityId' },
        { status: 400 }
      );
    }

    // Validate entityType
    if (!['thesis', 'view'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entityType. Must be: thesis or view' },
        { status: 400 }
      );
    }

    // Validate relationshipType
    if (!['supports', 'refutes', 'foundation'].includes(relationshipType)) {
      return NextResponse.json(
        { error: 'Invalid relationshipType. Must be: supports, refutes, or foundation' },
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
      return NextResponse.json(
        { error: `Main claim not found: ${mainClaimId}` },
        { status: 404 }
      );
    }

    // Verify target entity exists
    if (entityType === 'thesis') {
      const [thesis] = await db
        .select()
        .from(macroTheses)
        .where(eq(macroTheses.id, entityId))
        .limit(1);

      if (!thesis) {
        return NextResponse.json(
          { error: `Macro thesis not found: ${entityId}` },
          { status: 404 }
        );
      }
    } else if (entityType === 'view') {
      const [view] = await db
        .select()
        .from(assetTheses)
        .where(eq(assetTheses.id, entityId))
        .limit(1);

      if (!view) {
        return NextResponse.json(
          { error: `Asset view not found: ${entityId}` },
          { status: 404 }
        );
      }
    }

    // Check if link already exists
    const whereClause = entityType === 'thesis'
      ? and(
          eq(claimThesisMappings.mainClaimId, mainClaimId),
          eq(claimThesisMappings.macroThesisId, entityId)
        )
      : and(
          eq(claimThesisMappings.mainClaimId, mainClaimId),
          eq(claimThesisMappings.assetThesisId, entityId)
        );

    const existingLink = await db
      .select()
      .from(claimThesisMappings)
      .where(whereClause)
      .limit(1);

    if (existingLink.length > 0) {
      return NextResponse.json(
        {
          error: 'Link already exists between this main claim and entity',
          existingLinkId: existingLink[0].id,
        },
        { status: 409 }
      );
    }

    // Create the link
    const linkValues = {
      mainClaimId,
      mappingType: relationshipType,
      mappedBy: 'manual', // Manual linking via UI
      ...(entityType === 'thesis'
        ? { macroThesisId: entityId, assetThesisId: null }
        : { assetThesisId: entityId, macroThesisId: null }
      ),
    };

    const [createdLink] = await db
      .insert(claimThesisMappings)
      .values(linkValues)
      .returning();

    return NextResponse.json({
      success: true,
      linkId: createdLink.id,
      message: `Main claim linked to ${entityType} successfully (${relationshipType})`,
    });
  } catch (error: any) {
    console.error('Error linking main claim to entity:', error);
    return NextResponse.json(
      { error: 'Failed to link main claim', details: error.message },
      { status: 500 }
    );
  }
}
