import { db } from '@/db';
import { macroTheses, assetTheses, strategies, accounts, underlyings, mainClaims, claimThesisMappings, researchInsights, researchArtifacts, assetThesisRelatedMacroTheses } from '@/db/schema';
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
  linkedAssetTheses: Array<{ id: string; title: string; ticker: string | null }>;
  linkedStrategies: Array<{ id: string; label: string | null; status: string }>;
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

  const thesisIds = theses.map((t) => t.id);

  // Count linked asset theses (via junction table)
  const assetViewCounts = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      count: count(),
    })
    .from(assetThesisRelatedMacroTheses)
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds))
    .groupBy(assetThesisRelatedMacroTheses.macroThesisId);

  const assetViewMap = new Map(
    assetViewCounts.map((c) => [c.macroThesisId, Number(c.count)])
  );

  // Count strategies (via asset thesis junction)
  const strategyCounts = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      count: count(),
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .innerJoin(assetThesisRelatedMacroTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds))
    .groupBy(assetThesisRelatedMacroTheses.macroThesisId);

  const strategyMap = new Map(
    strategyCounts.map((c) => [c.macroThesisId, Number(c.count)])
  );

  // Fetch all linked asset theses (via junction table)
  const allLinkedAssetTheses = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      id: assetTheses.id,
      title: assetTheses.title,
      ticker: underlyings.ticker,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetThesisRelatedMacroTheses.assetThesisId, assetTheses.id))
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds));

  // Fetch all linked strategies (via asset thesis junction)
  const allLinkedStrategies = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      id: strategies.id,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .innerJoin(assetThesisRelatedMacroTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds));

  // Build maps of linked entities
  const assetThesesByThesisId = new Map<string, Array<{ id: string; title: string; ticker: string | null }>>();
  const strategiesByThesisId = new Map<string, Array<{ id: string; label: string | null; status: string }>>();

  allLinkedAssetTheses.forEach((at) => {
    if (!assetThesesByThesisId.has(at.macroThesisId)) {
      assetThesesByThesisId.set(at.macroThesisId, []);
    }
    assetThesesByThesisId.get(at.macroThesisId)!.push({
      id: at.id,
      title: at.title,
      ticker: at.ticker,
    });
  });

  allLinkedStrategies.forEach((s) => {
    if (!strategiesByThesisId.has(s.macroThesisId)) {
      strategiesByThesisId.set(s.macroThesisId, []);
    }
    // Dedupe by strategy ID (a strategy may link through multiple asset theses)
    const existing = strategiesByThesisId.get(s.macroThesisId)!;
    if (!existing.some(e => e.id === s.id)) {
      existing.push({
        id: s.id,
        label: s.label,
        status: s.status,
      });
    }
  });

  return theses.map((thesis) => ({
    ...thesis,
    assetViewCount: assetViewMap.get(thesis.id) ?? 0,
    strategyCount: strategyMap.get(thesis.id) ?? 0,
    linkedAssetTheses: assetThesesByThesisId.get(thesis.id) ?? [],
    linkedStrategies: strategiesByThesisId.get(thesis.id) ?? [],
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
  // Get all asset theses linked to this macro thesis (via junction table)
  const views = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      underlyingTicker: underlyings.ticker,
      status: assetTheses.status,
      confidenceLevel: assetTheses.confidenceLevel,
      createdAt: assetTheses.createdAt,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetThesisRelatedMacroTheses.assetThesisId, assetTheses.id))
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, thesisId))
    .orderBy(desc(assetTheses.createdAt));

  return views;
}

export async function getLinkedStrategiesForThesis(thesisId: string) {
  // Strategies inherit macro thesis through asset theses (via junction table)
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
    .innerJoin(assetThesisRelatedMacroTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .leftJoin(accounts, eq(strategies.accountId, accounts.id))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, thesisId))
    .orderBy(desc(strategies.openedAt));

  // Dedupe by ID (a strategy may link through multiple asset theses)
  const stratsMap = new Map();
  strats.forEach((s) => stratsMap.set(s.id, s));

  return Array.from(stratsMap.values());
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
        mappingType: claimThesisMappings.mappingType,
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
        mappingType: claimThesisMappings.mappingType,
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
        mappingType: link.mappingType,
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
        mappingType: link.mappingType,
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
