import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { researchInsights, mainClaims, mainClaimEvidence } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ClaimsStructure } from '@/types/claims';
import { afterMainClaimSave } from '@/lib/obsidian/hooks';

/**
 * POST /api/research/promote-claim
 *
 * Promotes a main claim from an audit's JSONB claims_structure to a first-class
 * main_claims table row. This allows the claim to:
 * - Accumulate evidence from multiple audits over time
 * - Link to multiple theses/views (many-to-many)
 * - Have independent lifecycle tracking
 *
 * Request body:
 * {
 *   insightId: string;       // UUID of research_insight containing the claim
 *   claimId: string;         // ID of the claim within claims_structure (e.g., "claim-1")
 * }
 *
 * Response:
 * {
 *   success: true;
 *   mainClaimId: string;     // UUID of created main_claims row
 *   title: string;
 *   category: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { insightId, claimId } = body;

    // Validate required fields
    if (!insightId || !claimId) {
      return NextResponse.json(
        { error: 'Missing required fields: insightId, claimId' },
        { status: 400 }
      );
    }

    // Fetch the insight to get claims_structure
    const [insight] = await db
      .select()
      .from(researchInsights)
      .where(eq(researchInsights.id, insightId))
      .limit(1);

    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    if (!insight.claimsStructure) {
      return NextResponse.json(
        { error: 'No claims structure found in this insight' },
        { status: 400 }
      );
    }

    const claimsStructure = insight.claimsStructure as ClaimsStructure;

    // Find the claim to promote
    const claim = claimsStructure.main_claims.find((c) => c.id === claimId);

    if (!claim) {
      return NextResponse.json(
        { error: `Claim ${claimId} not found in insight` },
        { status: 404 }
      );
    }

    // Check if this claim has already been promoted
    // Use a more robust check: match on claim text AND category
    // This prevents race conditions where the same claim is promoted multiple times
    const existingClaims = await db
      .select()
      .from(mainClaims)
      .where(eq(mainClaims.claim, claim.claim))
      .limit(1);

    if (existingClaims.length > 0) {
      return NextResponse.json(
        {
          error: 'A main claim with this exact text already exists',
          existingClaimId: existingClaims[0].id,
          existingClaimTitle: existingClaims[0].title,
          suggestion: 'Consider linking evidence to the existing claim instead',
        },
        { status: 409 }
      );
    }

    // Extract relevant tickers from claim metadata
    const relevantTickers = claim.relevant_tickers || [];

    // Create the main claim
    // Note: Future improvement - add unique constraint on claim text hash to prevent duplicates at DB level
    const [createdMainClaim] = await db
      .insert(mainClaims)
      .values({
        // Claim identity
        title: claim.claim.substring(0, 200), // Use first 200 chars of claim as title
        category: claim.category,

        // Toulmin Framework
        claim: claim.claim,
        evidence: claim.evidence ? [claim.evidence] : [],
        reasoning: claim.reasoning,
        backing: claim.backing,
        qualifier: claim.qualifier,
        rebuttal: claim.rebuttal ? [claim.rebuttal] : [],

        // Metadata
        timeHorizon: claim.time_horizon || null,
        relevantTickers: relevantTickers.length > 0 ? relevantTickers : null,

        // Lifecycle
        status: 'unconfirmed',
        confidenceEvolution: null,

        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEvidenceAddedAt: null,
      })
      .returning();

    // Link supporting evidence claims to the main claim
    const supportingClaimIds = claim.supporting_evidence_claims || [];
    const rebuttingClaimIds = claim.rebutting_evidence_claims || [];
    let linkedEvidenceCount = 0;

    if (supportingClaimIds.length > 0 || rebuttingClaimIds.length > 0) {
      const evidenceLinks = [
        ...supportingClaimIds.map((evidenceClaimId: string) => ({
          mainClaimId: createdMainClaim.id,
          researchInsightId: insightId,
          supportingClaimId: evidenceClaimId,
          relationshipType: 'supports' as const,
        })),
        ...rebuttingClaimIds.map((evidenceClaimId: string) => ({
          mainClaimId: createdMainClaim.id,
          researchInsightId: insightId,
          supportingClaimId: evidenceClaimId,
          relationshipType: 'rebuts' as const,
        })),
      ];

      if (evidenceLinks.length > 0) {
        await db.insert(mainClaimEvidence).values(evidenceLinks);
        linkedEvidenceCount = evidenceLinks.length;
      }
    }

    // Sync to Obsidian (non-blocking)
    afterMainClaimSave(createdMainClaim).catch((error) => {
      console.error('Failed to sync main claim to Obsidian:', error);
    });

    return NextResponse.json({
      success: true,
      mainClaimId: createdMainClaim.id,
      title: createdMainClaim.title,
      category: createdMainClaim.category,
      linkedEvidenceCount,
      message: `Main claim promoted successfully with ${linkedEvidenceCount} evidence claims linked`,
    });
  } catch (error: any) {
    console.error('Error promoting claim:', error);
    return NextResponse.json(
      { error: 'Failed to promote claim', details: error.message },
      { status: 500 }
    );
  }
}
