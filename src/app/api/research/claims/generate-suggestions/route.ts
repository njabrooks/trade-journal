import { NextRequest, NextResponse } from 'next/server';
import { generateClaimThesisSuggestions } from '@/lib/services/claim-thesis-suggestions';
import { db } from '@/db';
import { mainClaims } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { AIModel } from '@/lib/services/ai-providers';

/**
 * POST /api/research/claims/generate-suggestions
 *
 * Triggers AI-powered thesis linkage suggestion generation for claims.
 *
 * Request body:
 * {
 *   insightId: string;          // Research insight the claims came from
 *   claimIds?: string[];        // Optional: specific claims (defaults to all for insight)
 *   model?: AIModel;            // Optional: AI model to use
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { insightId, claimIds, model } = body;

    if (!insightId) {
      return NextResponse.json(
        { error: 'Missing required field: insightId' },
        { status: 400 }
      );
    }

    // If no specific claim IDs provided, find all claims for this insight
    let targetClaimIds: string[] = claimIds || [];
    if (targetClaimIds.length === 0) {
      const claims = await db
        .select({ id: mainClaims.id })
        .from(mainClaims)
        .where(eq(mainClaims.sourceInsightId, insightId));
      targetClaimIds = claims.map((c) => c.id);
    }

    if (targetClaimIds.length === 0) {
      return NextResponse.json({
        success: true,
        recommendationIds: [],
        count: 0,
        message: 'No claims found for this insight',
      });
    }

    const recommendationIds = await generateClaimThesisSuggestions(
      insightId,
      targetClaimIds,
      model as AIModel | undefined
    );

    return NextResponse.json({
      success: true,
      recommendationIds,
      count: recommendationIds.length,
      claimsAnalyzed: targetClaimIds.length,
    });
  } catch (error: any) {
    console.error('Error generating claim suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions', details: error.message },
      { status: 500 }
    );
  }
}
