import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { researchInsights, macroTheses, assetViews, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ClaimsStructure, MainClaim } from '@/types/claims';
import { afterMacroThesisSave, afterAssetViewSave } from '@/lib/obsidian/hooks';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { insightId, claimId, conversionType, data } = body;

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

      // Sync to Obsidian (non-blocking)
      afterMacroThesisSave(thesis).catch((error) => {
        console.error('Failed to sync macro thesis to Obsidian:', error);
      });
    } else if (conversionType === 'asset_view') {
      // Validate ticker
      if (!data.ticker || data.ticker === 'undefined' || typeof data.ticker !== 'string' || data.ticker.trim() === '') {
        return NextResponse.json({ error: 'Valid ticker is required for asset view' }, { status: 400 });
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

      // Create asset view
      const [view] = await db
        .insert(assetViews)
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

      // Sync to Obsidian (non-blocking)
      afterAssetViewSave(view).catch((error) => {
        console.error('Failed to sync asset view to Obsidian:', error);
      });
    } else {
      return NextResponse.json({ error: 'Invalid conversion type' }, { status: 400 });
    }

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

    return NextResponse.json({
      success: true,
      id: createdId,
      type: conversionType,
    });
  } catch (error) {
    console.error('Error converting claim:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
