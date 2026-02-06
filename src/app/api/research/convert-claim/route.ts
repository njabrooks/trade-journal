import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { researchInsights, macroTheses, assetTheses, underlyings, mainClaims, claimThesisMappings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ClaimsStructure, MainClaim } from '@/types/claims';
import { computeThesisTriageForThesis } from '@/lib/derived/thesisTriage';
import { logToJournal } from '@/lib/workflow';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { insightId, claimId, conversionType, relationshipType = 'supports', data } = body;

    if (!insightId || !claimId || !conversionType || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
      return NextResponse.json({ error: 'No claims structure found' }, { status: 400 });
    }

    const claimsStructure = insight.claimsStructure as ClaimsStructure;

    // Find the claim to convert
    const claimIndex = claimsStructure.main_claims.findIndex((c) => c.id === claimId);
    if (claimIndex === -1) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    const claim = claimsStructure.main_claims[claimIndex];

    // Check if already converted
    if (claim.converted_to) {
      return NextResponse.json(
        {
          error: `Claim already converted to ${claim.converted_to.type}`,
          convertedId: claim.converted_to.id,
        },
        { status: 400 }
      );
    }

    let createdId: string;

    if (conversionType === 'macro_thesis') {
      // Create macro thesis
      const [thesis] = await db
        .insert(macroTheses)
        .values({
          title: data.title,
          description: data.description,
          thesisType: data.thesisType,
          timeHorizon: data.timeHorizon,
          confidenceLevel: data.confidenceLevel,
          status: 'active',
          notes: data.notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      createdId = thesis.id;
    } else if (conversionType === 'asset_thesis') {
      // Validate ticker
      if (!data.ticker || data.ticker === 'undefined' || typeof data.ticker !== 'string' || data.ticker.trim() === '') {
        return NextResponse.json({ error: 'Valid ticker is required for asset thesis' }, { status: 400 });
      }

      // Resolve ticker to underlying_id
      let [underlying] = await db
        .select()
        .from(underlyings)
        .where(eq(underlyings.ticker, data.ticker))
        .limit(1);

      // Create underlying if it doesn't exist
      if (!underlying) {
        [underlying] = await db
          .insert(underlyings)
          .values({
            ticker: data.ticker,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
      }

      // Create asset thesis
      const [view] = await db
        .insert(assetTheses)
        .values({
          underlyingId: underlying.id,
          title: data.title,
          description: data.description,
          timeHorizon: data.timeHorizon,
          confidenceLevel: data.confidenceLevel,
          status: 'active',
          notes: data.notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      createdId = view.id;
    } else {
      return NextResponse.json({ error: 'Invalid conversion type' }, { status: 400 });
    }

    // Create a main_claim record from the source claim (for linking)
    const [createdMainClaim] = await db
      .insert(mainClaims)
      .values({
        title: claim.claim.substring(0, 100), // Use first 100 chars of claim as title
        category: claim.type === 'macro_thesis_candidate' ? 'macro' : 'asset_specific',
        claim: claim.claim,
        evidence: claim.evidence || [],
        reasoning: claim.reasoning,
        backing: claim.backing,
        qualifier: claim.qualifier,
        timeHorizon: claim.time_horizon,
        relevantTickers: claim.relevant_tickers || [],
        status: 'active', // Mark as active since it was converted (standardized #ENH-048)
        sourceInsightId: insightId,
        sourceClaimId: claimId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create claim-to-thesis mapping
    await db.insert(claimThesisMappings).values({
      mainClaimId: createdMainClaim.id,
      macroThesisId: conversionType === 'macro_thesis' ? createdId : null,
      assetThesisId: conversionType === 'asset_thesis' ? createdId : null,
      mappingType: relationshipType,
      mappedBy: 'conversion', // Indicate this was created during claim conversion
      notes: `Original claim converted to ${conversionType}`,
      mappedAt: new Date(),
    });

    // Log claim conversion to journal for provenance tracking
    await logToJournal({
      objectType: conversionType === 'macro_thesis' ? 'macro_thesis' : 'asset_thesis',
      objectId: createdId,
      objectTitle: data.title,
      actionType: 'claim_converted',
      actionDescription: `Claim converted to new ${conversionType === 'macro_thesis' ? 'macro thesis' : 'asset thesis'}: "${claim.claim.substring(0, 100)}${claim.claim.length > 100 ? '...' : ''}"`,
      previousState: {},
      newState: {
        thesisId: createdId,
        thesisType: conversionType,
        claimId: createdMainClaim.id,
        relationshipType,
      },
      source: 'user',
      metadata: {
        sourceInsightId: insightId,
        sourceClaimId: claimId,
        mainClaimId: createdMainClaim.id,
        claimCategory: claim.type,
        claimQualifier: claim.qualifier,
        relevantTickers: claim.relevant_tickers,
      },
    });

    // Update the claim with converted_to metadata
    const updatedClaim: MainClaim = {
      ...claim,
      converted_to: {
        type: conversionType,
        id: createdId,
        converted_at: new Date().toISOString(),
      },
    };

    // Update claims_structure
    const updatedClaimsStructure: ClaimsStructure = {
      ...claimsStructure,
      main_claims: [
        ...claimsStructure.main_claims.slice(0, claimIndex),
        updatedClaim,
        ...claimsStructure.main_claims.slice(claimIndex + 1),
      ],
    };

    // Save updated claims_structure back to insight
    await db
      .update(researchInsights)
      .set({
        claimsStructure: updatedClaimsStructure as any,
        updatedAt: new Date(),
      })
      .where(eq(researchInsights.id, insightId));

    // Compute thesis triage after claim is linked
    // This creates triage records for lifecycle events (rule #1: needs articulation, rule #2: new claims)
    const thesisType = conversionType === 'macro_thesis' ? 'macro' : 'asset';
    const triageResult = await computeThesisTriageForThesis(createdId, thesisType);
    console.log(`Thesis triage computed for ${thesisType}/${createdId}:`, triageResult);

    return NextResponse.json({
      success: true,
      id: createdId,
      type: conversionType,
      claimId: createdMainClaim.id,
      relationshipType,
      triageCreated: triageResult.triageCreated,
    });
  } catch (error) {
    console.error('Error converting claim:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
