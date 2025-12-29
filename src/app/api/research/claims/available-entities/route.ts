import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { macroTheses, assetViews, underlyings, claimThesisMappings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * GET /api/research/claims/available-entities?claimId=xxx
 *
 * Returns available theses and views that can be linked to a claim.
 * Excludes entities that are already linked to the claim.
 *
 * Query params:
 * - claimId: The main claim UUID
 *
 * Response:
 * {
 *   theses: Array<{ id: string, title: string, status: string, type: string }>;
 *   views: Array<{ id: string, title: string, ticker: string, status: string }>;
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const claimId = searchParams.get('claimId');

    if (!claimId) {
      return NextResponse.json(
        { error: 'Missing required parameter: claimId' },
        { status: 400 }
      );
    }

    // Get already linked thesis and view IDs for this claim
    const existingLinks = await db
      .select({
        thesisId: claimThesisMappings.macroThesisId,
        viewId: claimThesisMappings.assetViewId,
      })
      .from(claimThesisMappings)
      .where(eq(claimThesisMappings.mainClaimId, claimId));

    const linkedThesisIds = existingLinks
      .map(link => link.thesisId)
      .filter((id): id is string => id !== null);

    const linkedViewIds = existingLinks
      .map(link => link.viewId)
      .filter((id): id is string => id !== null);

    // Fetch all active theses (excluding already linked ones)
    let thesesQuery = db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        thesisType: macroTheses.thesisType,
      })
      .from(macroTheses)
      .orderBy(macroTheses.createdAt);

    const allTheses = await thesesQuery;
    const availableTheses = allTheses.filter(
      thesis => !linkedThesisIds.includes(thesis.id)
    );

    // Fetch all active views (excluding already linked ones)
    const allViews = await db
      .select({
        id: assetViews.id,
        title: assetViews.title,
        status: assetViews.status,
        ticker: underlyings.ticker,
      })
      .from(assetViews)
      .innerJoin(underlyings, eq(assetViews.underlyingId, underlyings.id))
      .orderBy(assetViews.createdAt);

    const availableViews = allViews.filter(
      view => !linkedViewIds.includes(view.id)
    );

    return NextResponse.json({
      theses: availableTheses,
      views: availableViews,
    });
  } catch (error: any) {
    console.error('Error fetching available entities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entities', details: error.message },
      { status: 500 }
    );
  }
}
