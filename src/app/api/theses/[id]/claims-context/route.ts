import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  mainClaims,
  claimThesisMappings,
  underlyings,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export interface ThesisClaimsContextSummary {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string | null;
  ticker: string | null; // Only for asset theses
  claims: Array<{
    id: string;
    title: string;
    claim: string;
    category: string;
    qualifier: string | null;
    status: string;
    mappingType: string;
    createdAt: Date;
  }>;
  summary: {
    total: number;
    supports: number;
    refutes: number;
    foundation: number;
    lastUpdated: Date | null;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ThesisClaimsContextSummary | { error: string }>> {
  try {
    const { id: thesisId } = await params;
    const { searchParams } = new URL(request.url);
    const thesisType = searchParams.get('type') as 'macro' | 'asset' | null;

    if (!thesisType || (thesisType !== 'macro' && thesisType !== 'asset')) {
      return NextResponse.json(
        { error: 'Invalid or missing type parameter. Must be "macro" or "asset".' },
        { status: 400 }
      );
    }

    // Get thesis details
    let thesisTitle: string | null = null;
    let ticker: string | null = null;

    if (thesisType === 'macro') {
      const rows = await db
        .select({ title: macroTheses.title })
        .from(macroTheses)
        .where(eq(macroTheses.id, thesisId))
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
      }
      thesisTitle = rows[0].title;
    } else {
      const rows = await db
        .select({
          title: assetTheses.title,
          ticker: underlyings.ticker,
        })
        .from(assetTheses)
        .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
        .where(eq(assetTheses.id, thesisId))
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json({ error: 'Asset thesis not found' }, { status: 404 });
      }
      thesisTitle = rows[0].title;
      ticker = rows[0].ticker;
    }

    // Get claims linked to this thesis
    const claims = await db
      .select({
        id: mainClaims.id,
        title: mainClaims.title,
        claim: mainClaims.claim,
        category: mainClaims.category,
        qualifier: mainClaims.qualifier,
        status: mainClaims.status,
        mappingType: claimThesisMappings.mappingType,
        createdAt: mainClaims.createdAt,
      })
      .from(claimThesisMappings)
      .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
      .where(
        thesisType === 'macro'
          ? eq(claimThesisMappings.macroThesisId, thesisId)
          : eq(claimThesisMappings.assetThesisId, thesisId)
      )
      .orderBy(desc(mainClaims.createdAt));

    // Calculate summary
    const supports = claims.filter((c) => c.mappingType === 'supports').length;
    const refutes = claims.filter((c) => c.mappingType === 'refutes').length;
    const foundation = claims.filter((c) => c.mappingType === 'foundation').length;
    const lastUpdated = claims.length > 0 ? claims[0].createdAt : null;

    return NextResponse.json({
      thesisId,
      thesisType,
      thesisTitle,
      ticker,
      claims,
      summary: {
        total: claims.length,
        supports,
        refutes,
        foundation,
        lastUpdated,
      },
    });
  } catch (error) {
    console.error('Failed to fetch thesis claims context:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thesis claims context' },
      { status: 500 }
    );
  }
}
