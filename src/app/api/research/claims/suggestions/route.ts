import { NextRequest, NextResponse } from 'next/server';
import { getSuggestionsForClaims } from '@/db/queries/research';

/**
 * GET /api/research/claims/suggestions?claimId=xxx
 * GET /api/research/claims/suggestions?claimIds=a,b,c
 *
 * Fetches pending thesis linkage suggestions for one or more claims.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const claimId = searchParams.get('claimId');
    const claimIdsParam = searchParams.get('claimIds');

    let claimIds: string[] = [];
    if (claimId) {
      claimIds = [claimId];
    } else if (claimIdsParam) {
      claimIds = claimIdsParam.split(',').filter(Boolean);
    }

    if (claimIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameter: claimId or claimIds' },
        { status: 400 }
      );
    }

    const suggestionsByClaimId = await getSuggestionsForClaims(claimIds);

    // Flatten into a single array for easy consumption
    const allSuggestions: any[] = [];
    for (const [, suggestions] of suggestionsByClaimId) {
      allSuggestions.push(...suggestions);
    }

    return NextResponse.json({
      success: true,
      suggestions: allSuggestions,
      count: allSuggestions.length,
    });
  } catch (error: any) {
    console.error('Error fetching claim suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions', details: error.message },
      { status: 500 }
    );
  }
}
