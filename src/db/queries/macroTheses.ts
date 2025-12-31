import { db } from '@/db';
import { macroTheses, assetTheses, strategies, accounts, underlyings, mainClaims, claimThesisMappings, researchInsights, researchArtifacts } from '@/db/schema';
import { eq, desc, inArray, count, sql } from 'drizzle-orm';
import type { NewMacroThesis } from '@/db/schema';

export interface MacroThesisListItem {
  id: string;
  title: string;
  description: string | null;
  thesisType: string;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  sectors: string[] | null;
  direction: string | null;
  notes: any;
  createdAt: Date;
  updatedAt: Date;
  assetViewCount: number;
  strategyCount: number;
}

export async function getMacroThesesList(): Promise<MacroThesisListItem[]> {
  const theses = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      description: macroTheses.description,
      thesisType: macroTheses.thesisType,
      timeHorizon: macroTheses.timeHorizon,
      confidenceLevel: macroTheses.confidenceLevel,
      status: macroTheses.status,
      sectors: macroTheses.sectors,
      direction: macroTheses.direction,
      notes: macroTheses.notes,
      createdAt: macroTheses.createdAt,
      updatedAt: macroTheses.updatedAt,
    })
    .from(macroTheses)
    .orderBy(desc(macroTheses.createdAt));

  if (theses.length === 0) {
    return [];
  }

  // Get counts for each thesis
  const thesisIds = theses.map((t) => t.id);

  // Count asset theses linked as primary macro thesis
  const assetViewCounts = await db
    .select({
      primaryMacroThesisId: assetTheses.primaryMacroThesisId,
      count: count(),
    })
    .from(assetTheses)
    .where(inArray(assetTheses.primaryMacroThesisId, thesisIds))
    .groupBy(assetTheses.primaryMacroThesisId);

  // Strategies no longer have direct macroThesisId - they inherit through asset thesis
  // So strategy count is derived from asset theses
  const strategyCounts = await db
    .select({
      primaryMacroThesisId: assetTheses.primaryMacroThesisId,
      count: count(),
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .where(inArray(assetTheses.primaryMacroThesisId, thesisIds))
    .groupBy(assetTheses.primaryMacroThesisId);

  const assetViewMap = new Map(
    assetViewCounts.map((c) => [c.primaryMacroThesisId, Number(c.count)])
  );
  const strategyMap = new Map(
    strategyCounts.map((c) => [c.primaryMacroThesisId, Number(c.count)])
  );

  return theses.map((thesis) => ({
    ...thesis,
    assetViewCount: assetViewMap.get(thesis.id) ?? 0,
    strategyCount: strategyMap.get(thesis.id) ?? 0,
  }));
}

export async function getMacroThesisById(id: string) {
  const rows = await db
    .select()
    .from(macroTheses)
    .where(eq(macroTheses.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function createMacroThesis(data: NewMacroThesis): Promise<string> {
  const [thesis] = await db
    .insert(macroTheses)
    .values(data)
    .returning({ id: macroTheses.id });
  return thesis.id;
}

export async function updateMacroThesis(
  id: string,
  data: Partial<NewMacroThesis>
): Promise<void> {
  await db
    .update(macroTheses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(macroTheses.id, id));
}

export async function deleteMacroThesis(id: string): Promise<void> {
  await db.delete(macroTheses).where(eq(macroTheses.id, id));
}

export async function getLinkedAssetThesesForThesis(thesisId: string) {
  const views = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      underlyingTicker: underlyings.ticker,
      status: assetTheses.status,
      confidenceLevel: assetTheses.confidenceLevel,
      createdAt: assetTheses.createdAt,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(eq(assetTheses.primaryMacroThesisId, thesisId))
    .orderBy(desc(assetTheses.createdAt));

  return views;
}

export async function getLinkedStrategiesForThesis(thesisId: string) {
  // Strategies inherit macro thesis through asset theses
  const strats = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
      strategyType: strategies.strategyType,
      accountLabel: accounts.label,
      accountBrokerId: accounts.brokerAccountId,
      openedAt: strategies.openedAt,
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .leftJoin(accounts, eq(strategies.accountId, accounts.id))
    .where(eq(assetTheses.primaryMacroThesisId, thesisId))
    .orderBy(desc(strategies.openedAt));

  return strats;
}

export async function getLinkedMainClaimsForThesis(thesisId: string) {
  const claims = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      category: mainClaims.category,
      claim: mainClaims.claim,
      qualifier: mainClaims.qualifier,
      timeHorizon: mainClaims.timeHorizon,
      relevantTickers: mainClaims.relevantTickers,
      status: mainClaims.status,
      mappingType: claimThesisMappings.mappingType,
      createdAt: mainClaims.createdAt,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
    .where(eq(claimThesisMappings.macroThesisId, thesisId))
    .orderBy(desc(mainClaims.createdAt));

  return claims;
}

export async function getMainClaimsWithSourcesForThesis(thesisId: string) {
  // Get claims linked to this thesis with their source information
  const claimsData = await db
    .select({
      claim: mainClaims,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
    .leftJoin(researchInsights, eq(mainClaims.sourceInsightId, researchInsights.id))
    .leftJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
    .where(eq(claimThesisMappings.macroThesisId, thesisId))
    .orderBy(desc(mainClaims.createdAt));

  // Get linked theses and views for each claim
  const claimIds = claimsData.map((c) => c.claim.id);
  
  let linkedThesesMap = new Map();
  let linkedViewsMap = new Map();
  
  if (claimIds.length > 0) {
    const thesisLinks = await db
      .select({
        claimId: claimThesisMappings.mainClaimId,
        thesisId: macroTheses.id,
        thesisTitle: macroTheses.title,
      })
      .from(claimThesisMappings)
      .innerJoin(macroTheses, eq(claimThesisMappings.macroThesisId, macroTheses.id))
      .where(inArray(claimThesisMappings.mainClaimId, claimIds));

    const viewLinks = await db
      .select({
        claimId: claimThesisMappings.mainClaimId,
        viewId: assetTheses.id,
        viewTitle: assetTheses.title,
        viewTicker: underlyings.ticker,
      })
      .from(claimThesisMappings)
      .innerJoin(assetTheses, eq(claimThesisMappings.assetThesisId, assetTheses.id))
      .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .where(inArray(claimThesisMappings.mainClaimId, claimIds));

    // Build maps
    for (const link of thesisLinks) {
      if (!linkedThesesMap.has(link.claimId)) {
        linkedThesesMap.set(link.claimId, []);
      }
      linkedThesesMap.get(link.claimId).push({
        id: link.thesisId,
        title: link.thesisTitle,
      });
    }

    for (const link of viewLinks) {
      if (!linkedViewsMap.has(link.claimId)) {
        linkedViewsMap.set(link.claimId, []);
      }
      linkedViewsMap.get(link.claimId).push({
        id: link.viewId,
        title: link.viewTitle,
        ticker: link.viewTicker || '',
      });
    }
  }

  return claimsData.map((row) => ({
    claim: row.claim,
    insight: row.insight,
    artifact: row.artifact,
    linkedTheses: linkedThesesMap.get(row.claim.id) || [],
    linkedViews: linkedViewsMap.get(row.claim.id) || [],
  }));
}
