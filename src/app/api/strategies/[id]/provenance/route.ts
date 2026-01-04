import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  strategies,
  assetTheses,
  macroTheses,
  mainClaims,
  claimThesisMappings,
  underlyings,
  positions,
  assetThesisRelatedMacroTheses,
} from '@/db/schema';
import { eq, inArray, desc, or } from 'drizzle-orm';

export interface ProvenanceData {
  strategy: {
    id: string;
    strategyKey: string;
    assetThesisId: string | null;
  };
  assetThesis: {
    id: string;
    ticker: string;
    title: string;
    description: string | null;
  } | null;
  macroTheses: Array<{
    id: string;
    title: string;
    confidenceLevel: string | null;
    status: string;
  }>;
  claims: {
    total: number;
    byMappingType: {
      supports: number;
      refutes: number;
      foundation: number;
    };
    items: Array<{
      id: string;
      title: string;
      claim: string;
      category: string;
      qualifier: string | null;
      status: string;
      mappingType: string;
      createdAt: Date;
    }>;
  };
  positions: Array<{
    id: string;
    ticker: string;
    positionType: string | null;
    quantity: string;
    status: 'open' | 'assigned' | 'closed';
    unrealizedPnl: string | null;
    absNotional: string | null;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ProvenanceData | { error: string }>> {
  try {
    const { id: strategyId } = await params;

    // 1. Fetch strategy basic info
    const strategyRows = await db
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        assetThesisId: strategies.assetThesisId,
      })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (strategyRows.length === 0) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const strategy = strategyRows[0];

    // 2. Fetch asset thesis details if linked
    let assetThesis: ProvenanceData['assetThesis'] = null;
    if (strategy.assetThesisId) {
      const assetThesisRows = await db
        .select({
          id: assetTheses.id,
          ticker: underlyings.ticker,
          title: assetTheses.title,
          description: assetTheses.description,
        })
        .from(assetTheses)
        .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
        .where(eq(assetTheses.id, strategy.assetThesisId))
        .limit(1);

      if (assetThesisRows.length > 0) {
        assetThesis = assetThesisRows[0];
      }
    }

    // 3. Fetch macro theses linked to asset thesis
    let macroThesesData: ProvenanceData['macroTheses'] = [];
    if (strategy.assetThesisId) {
      macroThesesData = await db
        .select({
          id: macroTheses.id,
          title: macroTheses.title,
          confidenceLevel: macroTheses.confidenceLevel,
          status: macroTheses.status,
        })
        .from(assetThesisRelatedMacroTheses)
        .innerJoin(
          macroTheses,
          eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id)
        )
        .where(eq(assetThesisRelatedMacroTheses.assetThesisId, strategy.assetThesisId));
    }

    // 4. Fetch claims linked to asset thesis
    let claimsData: ProvenanceData['claims'] = {
      total: 0,
      byMappingType: { supports: 0, refutes: 0, foundation: 0 },
      items: [],
    };

    if (strategy.assetThesisId) {
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

      const supports = claims.filter((c) => c.mappingType === 'supports').length;
      const refutes = claims.filter((c) => c.mappingType === 'refutes').length;
      const foundation = claims.filter((c) => c.mappingType === 'foundation').length;

      claimsData = {
        total: claims.length,
        byMappingType: { supports, refutes, foundation },
        items: claims,
      };
    }

    // 5. Fetch positions linked to strategy (open and assigned only)
    const positionsData = await db
      .select({
        id: positions.id,
        ticker: positions.symbol,
        positionType: positions.positionType,
        quantity: positions.quantity,
        isOpen: positions.isOpen,
        unrealizedPnl: positions.unrealizedPnl,
        absNotional: positions.absNotional,
      })
      .from(positions)
      .where(
        eq(positions.strategyId, strategyId)
      )
      .orderBy(desc(positions.absNotional));

    // Map positions to include status
    const positionsWithStatus = positionsData.map((pos) => ({
      id: pos.id,
      ticker: pos.ticker,
      positionType: pos.positionType,
      quantity: pos.quantity,
      status: pos.isOpen ? 'open' : 'closed' as 'open' | 'closed' | 'assigned',
      unrealizedPnl: pos.unrealizedPnl,
      absNotional: pos.absNotional,
    }));

    return NextResponse.json({
      strategy: {
        id: strategy.id,
        strategyKey: strategy.strategyKey,
        assetThesisId: strategy.assetThesisId,
      },
      assetThesis,
      macroTheses: macroThesesData,
      claims: claimsData,
      positions: positionsWithStatus,
    });
  } catch (error) {
    console.error('Failed to fetch strategy provenance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy provenance' },
      { status: 500 }
    );
  }
}
