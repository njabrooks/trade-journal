import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims, mainClaimEvidence, researchInsights } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ClaimsStructure } from '@/types/claims';

/**
 * POST /api/research/link-evidence
 *
 * Links a supporting claim from an audit's claims_structure to a first-class main claim.
 * This creates a record in the main_claim_evidence junction table, enabling:
 * - Evidence accumulation from multiple audits
 * - Tracking which research supports which main claims
 * - Supporting/refuting/qualifying relationships
 *
 * Request body:
 * {
 *   mainClaimId: string;         // UUID of the main_claims row
 *   insightId: string;           // UUID of research_insight containing supporting claim
 *   supportingClaimId: string;   // ID of supporting claim in claims_structure (e.g., "claim-19")
 *   relationshipType: 'supports' | 'refutes' | 'qualifies';
 *   addedBy?: string;            // Optional: who added this link
 *   notes?: string;              // Optional: notes about the relationship
 * }
 *
 * Response:
 * {
 *   success: true;
 *   evidenceId: string;          // UUID of created main_claim_evidence row
 *   relationshipType: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mainClaimId,
      insightId,
      supportingClaimId,
      relationshipType,
      addedBy,
      notes,
    } = body;

    // Validate required fields
    if (!mainClaimId || !insightId || !supportingClaimId || !relationshipType) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: mainClaimId, insightId, supportingClaimId, relationshipType',
        },
        { status: 400 }
      );
    }

    // Validate relationship type
    if (!['supports', 'refutes', 'qualifies'].includes(relationshipType)) {
      return NextResponse.json(
        { error: 'Invalid relationshipType. Must be: supports, refutes, or qualifies' },
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

    // Verify insight exists and has claims structure
    const [insight] = await db
      .select()
      .from(researchInsights)
      .where(eq(researchInsights.id, insightId))
      .limit(1);

    if (!insight) {
      return NextResponse.json({ error: 'Research insight not found' }, { status: 404 });
    }

    if (!insight.claimsStructure) {
      return NextResponse.json(
        { error: 'No claims structure found in this insight' },
        { status: 400 }
      );
    }

    const claimsStructure = insight.claimsStructure as ClaimsStructure;

    // Verify supporting claim exists in the claims structure
    const supportingClaim = claimsStructure.evidence_claims.find(
      (c) => c.id === supportingClaimId
    );

    if (!supportingClaim) {
      return NextResponse.json(
        { error: `Supporting claim ${supportingClaimId} not found in insight` },
        { status: 404 }
      );
    }

    // Check if this evidence link already exists
    const existingLink = await db
      .select()
      .from(mainClaimEvidence)
      .where(
        and(
          eq(mainClaimEvidence.mainClaimId, mainClaimId),
          eq(mainClaimEvidence.researchInsightId, insightId),
          eq(mainClaimEvidence.supportingClaimId, supportingClaimId)
        )
      )
      .limit(1);

    if (existingLink.length > 0) {
      return NextResponse.json(
        {
          error: 'This evidence is already linked to the main claim',
          existingEvidenceId: existingLink[0].id,
        },
        { status: 409 }
      );
    }

    // Create the evidence link
    const [evidence] = await db
      .insert(mainClaimEvidence)
      .values({
        mainClaimId,
        researchInsightId: insightId,
        supportingClaimId,
        relationshipType,
        addedBy: addedBy || null,
        notes: notes || null,
        addedAt: new Date(),
      })
      .returning();

    // Update last_evidence_added_at on the main claim
    await db
      .update(mainClaims)
      .set({
        lastEvidenceAddedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mainClaims.id, mainClaimId));

    return NextResponse.json({
      success: true,
      evidenceId: evidence.id,
      relationshipType: evidence.relationshipType,
      message: 'Evidence linked successfully',
    });
  } catch (error: any) {
    console.error('Error linking evidence:', error);
    return NextResponse.json(
      { error: 'Failed to link evidence', details: error.message },
      { status: 500 }
    );
  }
}
