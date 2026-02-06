import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { macroTheses, assetTheses, underlyings, claimThesisMappings } from '@/db/schema';
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
        viewId: claimThesisMappings.assetThesisId,
      })
      .from(claimThesisMappings)
      .where(eq(claimThesisMappings.mainClaimId, claimId));

    const linkedThesisIds = existingLinks
      .map(link => link.thesisId)
      .filter((id): id is string => id !== null);

    const linkedViewIds = existingLinks
      .map(link => link.viewId)
      .filter((id): id is string => id !== null);

    // Fetch all theses (include description and sectors for keyword search)
    let thesesQuery = db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        thesisType: macroTheses.thesisType,
        description: macroTheses.description,
        sectors: macroTheses.sectors,
      })
      .from(macroTheses)
      .orderBy(macroTheses.createdAt);

    const allTheses = await thesesQuery;
    const availableTheses = allTheses.filter(
      thesis => !linkedThesisIds.includes(thesis.id)
    );
    const linkedTheses = allTheses.filter(
      thesis => linkedThesisIds.includes(thesis.id)
    );

    // Fetch all views (include description for keyword search)
    const allViews = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        status: assetTheses.status,
        ticker: underlyings.ticker,
        description: assetTheses.description,
      })
      .from(assetTheses)
      .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .orderBy(assetTheses.createdAt);

    const availableViews = allViews.filter(
      view => !linkedViewIds.includes(view.id)
    );
    const linkedViews = allViews.filter(
      view => linkedViewIds.includes(view.id)
    );

    // Combine theses and views into a single entities array
    // StandardLinkDialog expects { entities: [...], currentlyLinked: [...] } format
    // Include description and sectors for keyword search
    const entities = [
      ...availableTheses.map(thesis => ({
        id: thesis.id,
        title: thesis.title,
        type: 'macroThesis' as const,
        thesisType: thesis.thesisType,
        status: thesis.status,
        description: thesis.description,
        sectors: thesis.sectors,
      })),
      ...availableViews.map(view => ({
        id: view.id,
        title: view.title,
        type: 'assetThesis' as const,
        ticker: view.ticker,
        status: view.status,
        description: view.description,
      })),
    ];

    const currentlyLinked = [
      ...linkedTheses.map(thesis => ({
        id: thesis.id,
        title: thesis.title,
        type: 'macroThesis' as const,
        thesisType: thesis.thesisType,
        status: thesis.status,
        description: thesis.description,
        sectors: thesis.sectors,
      })),
      ...linkedViews.map(view => ({
        id: view.id,
        title: view.title,
        type: 'assetThesis' as const,
        ticker: view.ticker,
        status: view.status,
        description: view.description,
      })),
    ];

    return NextResponse.json({ entities, currentlyLinked });
  } catch (error: any) {
    console.error('Error fetching available entities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entities', details: error.message },
      { status: 500 }
    );
  }
}
