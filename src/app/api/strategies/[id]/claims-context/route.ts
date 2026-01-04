import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  strategies,
  assetTheses,
  mainClaims,
  claimThesisMappings,
  underlyings,
} from '@/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';

export interface ClaimsContextSummary {
  strategyId: string;
  assetThesisId: string | null;
  assetThesisTitle: string | null;
  assetThesisTicker: string | null;
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
): Promise<NextResponse<ClaimsContextSummary | { error: string }>> {
  try {
    const { id: strategyId } = await params;

    // Get strategy with its asset thesis
    const strategyRows = await db
      .select({
        id: strategies.id,
        assetThesisId: strategies.assetThesisId,
        assetThesisTitle: assetTheses.title,
        ticker: underlyings.ticker,
      })
      .from(strategies)
      .leftJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
      .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (strategyRows.length === 0) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const strategy = strategyRows[0];

    // If no asset thesis linked, return empty context
    if (!strategy.assetThesisId) {
      return NextResponse.json({
        strategyId,
        assetThesisId: null,
        assetThesisTitle: null,
        assetThesisTicker: null,
        claims: [],
        summary: {
          total: 0,
          supports: 0,
          refutes: 0,
          foundation: 0,
          lastUpdated: null,
        },
      });
    }

    // Get claims linked to the asset thesis
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
      .where(eq(claimThesisMappings.assetThesisId, strategy.assetThesisId))
      .orderBy(desc(mainClaims.createdAt));

    // Calculate summary
    const supports = claims.filter((c) => c.mappingType === 'supports').length;
    const refutes = claims.filter((c) => c.mappingType === 'refutes').length;
    const foundation = claims.filter((c) => c.mappingType === 'foundation').length;
    const lastUpdated = claims.length > 0 ? claims[0].createdAt : null;

    return NextResponse.json({
      strategyId,
      assetThesisId: strategy.assetThesisId,
      assetThesisTitle: strategy.assetThesisTitle,
      assetThesisTicker: strategy.ticker,
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
    console.error('Failed to fetch claims context:', error);
    return NextResponse.json(
      { error: 'Failed to fetch claims context' },
      { status: 500 }
    );
  }
}
