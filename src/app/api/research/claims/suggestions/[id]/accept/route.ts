import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  researchHierarchyRecommendations,
  mainClaims,
  claimThesisMappings,
  macroTheses,
  assetTheses,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { computeThesisTriageForThesis } from '@/lib/derived/thesisTriage';
import { logToJournal } from '@/lib/workflow';

/**
 * POST /api/research/claims/suggestions/[id]/accept
 *
 * Accepts a claim-thesis suggestion:
 * 1. Creates claim_thesis_mapping
 * 2. Updates suggestion status to 'accepted'
 * 3. Optionally promotes claim from 'draft' to 'active'
 * 4. Logs journal entries
 * 5. Computes thesis triage
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mappingTypeOverride = body.mappingType;

    // Fetch the recommendation (atomic check for pending status)
    const [recommendation] = await db
      .select()
      .from(researchHierarchyRecommendations)
      .where(
        and(
          eq(researchHierarchyRecommendations.id, id),
          eq(researchHierarchyRecommendations.status, 'pending')
        )
      )
      .limit(1);

    if (!recommendation) {
      return NextResponse.json(
        { error: 'Suggestion not found or already processed' },
        { status: 404 }
      );
    }

    if (!recommendation.mainClaimId) {
      return NextResponse.json(
        { error: 'This recommendation is not a claim-level suggestion' },
        { status: 400 }
      );
    }

    const targetThesisId = recommendation.existingThesisId;
    const targetAssetThesisId = recommendation.existingAssetThesisId;

    if (!targetThesisId && !targetAssetThesisId) {
      return NextResponse.json(
        { error: 'Suggestion has no target thesis' },
        { status: 400 }
      );
    }

    // Get the claim
    const [claim] = await db
      .select()
      .from(mainClaims)
      .where(eq(mainClaims.id, recommendation.mainClaimId))
      .limit(1);

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    // Get target thesis title for journal
    let targetTitle = 'Unknown';
    let targetType: 'macro' | 'asset' = 'macro';
    if (targetThesisId) {
      const [thesis] = await db
        .select({ title: macroTheses.title })
        .from(macroTheses)
        .where(eq(macroTheses.id, targetThesisId))
        .limit(1);
      if (thesis) targetTitle = thesis.title;
      targetType = 'macro';
    } else if (targetAssetThesisId) {
      const [assetThesis] = await db
        .select({ title: assetTheses.title })
        .from(assetTheses)
        .where(eq(assetTheses.id, targetAssetThesisId))
        .limit(1);
      if (assetThesis) targetTitle = assetThesis.title;
      targetType = 'asset';
    }

    // Check for duplicate mapping
    const existingMapping = await db
      .select()
      .from(claimThesisMappings)
      .where(
        and(
          eq(claimThesisMappings.mainClaimId, recommendation.mainClaimId),
          targetThesisId
            ? eq(claimThesisMappings.macroThesisId, targetThesisId)
            : eq(claimThesisMappings.assetThesisId, targetAssetThesisId!)
        )
      )
      .limit(1);

    if (existingMapping.length > 0) {
      // Mapping already exists — just mark suggestion as accepted
      await db
        .update(researchHierarchyRecommendations)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(researchHierarchyRecommendations.id, id));

      return NextResponse.json({
        success: true,
        mappingId: existingMapping[0].id,
        alreadyLinked: true,
      });
    }

    const finalMappingType = mappingTypeOverride || recommendation.mappingType || 'supports';

    // Create the mapping
    const [mapping] = await db
      .insert(claimThesisMappings)
      .values({
        mainClaimId: recommendation.mainClaimId,
        macroThesisId: targetThesisId || null,
        assetThesisId: targetAssetThesisId || null,
        mappingType: finalMappingType,
        mappedBy: 'suggestion_accepted',
        mappedAt: new Date(),
      })
      .returning();

    // Update recommendation status
    await db
      .update(researchHierarchyRecommendations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(researchHierarchyRecommendations.id, id));

    // Promote claim from draft to active if still draft
    let claimStatus = claim.status;
    if (claim.status === 'draft') {
      await db
        .update(mainClaims)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(mainClaims.id, recommendation.mainClaimId));
      claimStatus = 'active';
    }

    // Log journal entries
    const targetObjectType = targetThesisId ? 'macro_thesis' : 'asset_thesis';
    const targetObjectId = (targetThesisId || targetAssetThesisId)!;

    await logToJournal({
      objectType: targetObjectType,
      objectId: targetObjectId,
      objectTitle: targetTitle,
      actionType: 'claim_linked',
      actionDescription: `Claim linked via AI suggestion (${finalMappingType}): "${claim.title}"`,
      previousState: {},
      newState: {
        mappingId: mapping.id,
        mappingType: finalMappingType,
        suggestionId: id,
      },
      source: 'automation',
      metadata: {
        mainClaimId: recommendation.mainClaimId,
        claimTitle: claim.title,
        confidenceScore: recommendation.confidenceScore,
        aiModel: recommendation.aiModel,
      },
    });

    // Compute thesis triage (best-effort — don't fail the accept if this errors)
    try {
      await computeThesisTriageForThesis(targetObjectId, targetType);
    } catch (triageError: any) {
      console.warn('Thesis triage computation failed (non-fatal):', triageError.message);
    }

    return NextResponse.json({
      success: true,
      mappingId: mapping.id,
      claimStatus,
      mappingType: finalMappingType,
    });
  } catch (error: any) {
    console.error('Error accepting suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to accept suggestion', details: error.message },
      { status: 500 }
    );
  }
}
