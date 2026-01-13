import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { claimThesisMappings, mainClaims, macroTheses, assetTheses } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { computeThesisTriageForThesis } from '@/lib/derived/thesisTriage';
import { logToJournal } from '@/lib/workflow';

/**
 * POST /api/research/claims/link-to-entities
 *
 * Links a main claim to existing macro theses and/or asset thesiss.
 * Also sets the claim status to 'confirmed' after linking.
 *
 * Request body:
 * {
 *   claimId: string;              // Main claim UUID
 *   thesisIds?: string[];         // Array of macro thesis UUIDs to link
 *   viewIds?: string[];           // Array of asset thesis UUIDs to link
 *   relationshipType?: 'supports' | 'refutes' | 'foundation'; // Relationship type (default: 'supports')
 * }
 *
 * Response:
 * {
 *   success: true;
 *   linkedThesesCount: number;
 *   linkedViewsCount: number;
 *   message: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId, thesisIds = [], viewIds = [], relationshipType = 'supports' } = body;

    // Validate required fields
    if (!claimId) {
      return NextResponse.json(
        { error: 'Missing required field: claimId' },
        { status: 400 }
      );
    }

    if (thesisIds.length === 0 && viewIds.length === 0) {
      return NextResponse.json(
        { error: 'Must provide at least one thesis or view to link to' },
        { status: 400 }
      );
    }

    // Verify claim exists
    const [claim] = await db
      .select()
      .from(mainClaims)
      .where(eq(mainClaims.id, claimId))
      .limit(1);

    if (!claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    let linkedThesesCount = 0;
    let linkedViewsCount = 0;

    // Validate relationshipType
    if (!['supports', 'refutes', 'foundation'].includes(relationshipType)) {
      return NextResponse.json(
        { error: 'Invalid relationshipType. Must be: supports, refutes, or foundation' },
        { status: 400 }
      );
    }

    // Link to theses
    if (thesisIds.length > 0) {
      const thesisLinks = thesisIds.map((thesisId: string) => ({
        mainClaimId: claimId,
        macroThesisId: thesisId,
        assetThesisId: null,
        mappingType: relationshipType,
        mappedBy: 'user_link', // User manually linked via dialog
      }));

      await db.insert(claimThesisMappings).values(thesisLinks).onConflictDoNothing();
      linkedThesesCount = thesisLinks.length;
    }

    // Link to views
    if (viewIds.length > 0) {
      const viewLinks = viewIds.map((viewId: string) => ({
        mainClaimId: claimId,
        macroThesisId: null,
        assetThesisId: viewId,
        mappingType: relationshipType,
        mappedBy: 'user_link', // User manually linked via dialog
      }));

      await db.insert(claimThesisMappings).values(viewLinks).onConflictDoNothing();
      linkedViewsCount = viewLinks.length;
    }

    // Update claim status to confirmed
    await db
      .update(mainClaims)
      .set({
        status: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(mainClaims.id, claimId));

    // Log to journal for each linked thesis/view
    // Fetch thesis titles for logging
    if (thesisIds.length > 0) {
      const theses = await db
        .select({ id: macroTheses.id, title: macroTheses.title })
        .from(macroTheses)
        .where(inArray(macroTheses.id, thesisIds));

      for (const thesis of theses) {
        await logToJournal({
          objectType: 'macro_thesis',
          objectId: thesis.id,
          objectTitle: thesis.title,
          actionType: 'claim_linked',
          actionDescription: `Claim linked (${relationshipType}): "${claim.claim.substring(0, 100)}${claim.claim.length > 100 ? '...' : ''}"`,
          previousState: {},
          newState: {
            mappingType: relationshipType,
          },
          source: 'user',
          metadata: {
            mainClaimId: claimId,
            claimTitle: claim.title,
            claimCategory: claim.category,
            sourceInsightId: claim.sourceInsightId,
          },
        });
      }
    }

    // Fetch view titles for logging
    if (viewIds.length > 0) {
      const views = await db
        .select({ id: assetTheses.id, title: assetTheses.title })
        .from(assetTheses)
        .where(inArray(assetTheses.id, viewIds));

      for (const view of views) {
        await logToJournal({
          objectType: 'asset_thesis',
          objectId: view.id,
          objectTitle: view.title,
          actionType: 'claim_linked',
          actionDescription: `Claim linked (${relationshipType}): "${claim.claim.substring(0, 100)}${claim.claim.length > 100 ? '...' : ''}"`,
          previousState: {},
          newState: {
            mappingType: relationshipType,
          },
          source: 'user',
          metadata: {
            mainClaimId: claimId,
            claimTitle: claim.title,
            claimCategory: claim.category,
            sourceInsightId: claim.sourceInsightId,
          },
        });
      }
    }

    // Compute triage for all linked theses/views
    for (const thesisId of thesisIds) {
      await computeThesisTriageForThesis(thesisId, 'macro');
    }
    for (const viewId of viewIds) {
      await computeThesisTriageForThesis(viewId, 'asset');
    }

    return NextResponse.json({
      success: true,
      linkedThesesCount,
      linkedViewsCount,
      message: `Claim linked to ${linkedThesesCount} theses and ${linkedViewsCount} views, status set to confirmed`,
    });
  } catch (error: any) {
    console.error('Error linking claim to entities:', error);
    return NextResponse.json(
      { error: 'Failed to link claim', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/research/claims/link-to-entities
 *
 * Unlinks a main claim from a thesis or view.
 *
 * Request body:
 * {
 *   claimId: string;       // Main claim UUID
 *   targetType: 'macroThesis' | 'assetThesis';
 *   targetId: string;      // Thesis or view UUID to unlink
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId, targetType, targetId } = body;

    // Validate required fields
    if (!claimId || !targetType || !targetId) {
      return NextResponse.json(
        { error: 'Missing required fields: claimId, targetType, targetId' },
        { status: 400 }
      );
    }

    // Verify claim exists
    const [claim] = await db
      .select()
      .from(mainClaims)
      .where(eq(mainClaims.id, claimId))
      .limit(1);

    if (!claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    // Delete the mapping based on target type and log to journal
    if (targetType === 'macroThesis') {
      // Fetch thesis title for logging
      const [thesis] = await db
        .select({ id: macroTheses.id, title: macroTheses.title })
        .from(macroTheses)
        .where(eq(macroTheses.id, targetId))
        .limit(1);

      await db
        .delete(claimThesisMappings)
        .where(
          and(
            eq(claimThesisMappings.mainClaimId, claimId),
            eq(claimThesisMappings.macroThesisId, targetId)
          )
        );

      // Log unlink to journal
      if (thesis) {
        await logToJournal({
          objectType: 'macro_thesis',
          objectId: targetId,
          objectTitle: thesis.title,
          actionType: 'claim_unlinked',
          actionDescription: `Claim unlinked: "${claim.claim.substring(0, 100)}${claim.claim.length > 100 ? '...' : ''}"`,
          previousState: { linked: true },
          newState: { linked: false },
          source: 'user',
          metadata: {
            mainClaimId: claimId,
            claimTitle: claim.title,
            claimCategory: claim.category,
          },
        });
      }
    } else if (targetType === 'assetThesis') {
      // Fetch view title for logging
      const [view] = await db
        .select({ id: assetTheses.id, title: assetTheses.title })
        .from(assetTheses)
        .where(eq(assetTheses.id, targetId))
        .limit(1);

      await db
        .delete(claimThesisMappings)
        .where(
          and(
            eq(claimThesisMappings.mainClaimId, claimId),
            eq(claimThesisMappings.assetThesisId, targetId)
          )
        );

      // Log unlink to journal
      if (view) {
        await logToJournal({
          objectType: 'asset_thesis',
          objectId: targetId,
          objectTitle: view.title,
          actionType: 'claim_unlinked',
          actionDescription: `Claim unlinked: "${claim.claim.substring(0, 100)}${claim.claim.length > 100 ? '...' : ''}"`,
          previousState: { linked: true },
          newState: { linked: false },
          source: 'user',
          metadata: {
            mainClaimId: claimId,
            claimTitle: claim.title,
            claimCategory: claim.category,
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid targetType. Must be: macroThesis or assetThesis' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Link removed successfully',
    });
  } catch (error: any) {
    console.error('Error unlinking claim from entity:', error);
    return NextResponse.json(
      { error: 'Failed to unlink claim', details: error.message },
      { status: 500 }
    );
  }
}
