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

  // Get counts for each thesis
  const thesisIds = theses.map((t) => t.id);

  // Count asset theses linked as primary macro thesis
  const primaryAssetViewCounts = await db
    .select({
      primaryMacroThesisId: assetTheses.primaryMacroThesisId,
      count: count(),
    })
    .from(assetTheses)
    .where(inArray(assetTheses.primaryMacroThesisId, thesisIds))
    .groupBy(assetTheses.primaryMacroThesisId);

  // Count asset theses linked as related macro thesis (from junction table)
  const relatedAssetViewCounts = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      count: count(),
    })
    .from(assetThesisRelatedMacroTheses)
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds))
    .groupBy(assetThesisRelatedMacroTheses.macroThesisId);

  // Strategies no longer have direct macroThesisId - they inherit through asset thesis
  // Count strategies from both primary and related asset thesis connections
  const primaryStrategyCounts = await db
    .select({
      primaryMacroThesisId: assetTheses.primaryMacroThesisId,
      count: count(),
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .where(inArray(assetTheses.primaryMacroThesisId, thesisIds))
    .groupBy(assetTheses.primaryMacroThesisId);

  const relatedStrategyCounts = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      count: count(),
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .innerJoin(assetThesisRelatedMacroTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds))
    .groupBy(assetThesisRelatedMacroTheses.macroThesisId);

  // Combine counts (note: some asset theses/strategies may be counted in both primary and related)
  const assetViewMap = new Map<string, number>();
  primaryAssetViewCounts.forEach((c) => {
    if (c.primaryMacroThesisId) {
      assetViewMap.set(c.primaryMacroThesisId, Number(c.count));
    }
  });
  relatedAssetViewCounts.forEach((c) => {
    const current = assetViewMap.get(c.macroThesisId) ?? 0;
    assetViewMap.set(c.macroThesisId, current + Number(c.count));
  });

  const strategyMap = new Map<string, number>();
  primaryStrategyCounts.forEach((c) => {
    if (c.primaryMacroThesisId) {
      strategyMap.set(c.primaryMacroThesisId, Number(c.count));
    }
  });
  relatedStrategyCounts.forEach((c) => {
    const current = strategyMap.get(c.macroThesisId) ?? 0;
    strategyMap.set(c.macroThesisId, current + Number(c.count));
  });

  // Fetch all linked asset theses for all theses
  const allAssetTheses = await db
    .select({
      macroThesisId: assetTheses.primaryMacroThesisId,
      id: assetTheses.id,
      title: assetTheses.title,
      ticker: underlyings.ticker,
      relatedMacroThesisId: sql<string | null>`NULL`.as('relatedMacroThesisId'),
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(assetTheses.primaryMacroThesisId, thesisIds));

  // Fetch related asset theses (through junction table)
  const relatedAssetTheses = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      id: assetTheses.id,
      title: assetTheses.title,
      ticker: underlyings.ticker,
      relatedMacroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetThesisRelatedMacroTheses.assetThesisId, assetTheses.id))
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds));

  // Fetch all linked strategies for all theses
  const allStrategies = await db
    .select({
      macroThesisId: assetTheses.primaryMacroThesisId,
      id: strategies.id,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
      relatedMacroThesisId: sql<string | null>`NULL`.as('relatedMacroThesisId'),
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .where(inArray(assetTheses.primaryMacroThesisId, thesisIds));

  // Fetch strategies through related asset theses
  const relatedStrategies = await db
    .select({
      macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      id: strategies.id,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
      relatedMacroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
    })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .innerJoin(assetThesisRelatedMacroTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, thesisIds));

  // Build maps of linked entities
  const assetThesesByThesisId = new Map<string, Array<{ id: string; title: string; ticker: string | null }>>();
  const strategiesByThesisId = new Map<string, Array<{ id: string; label: string | null; status: string }>>();

  // Combine primary and related asset theses (dedupe by ID per thesis)
  [...allAssetTheses, ...relatedAssetTheses].forEach((at) => {
    const thesisId = at.macroThesisId;
    if (!thesisId) return;

    if (!assetThesesByThesisId.has(thesisId)) {
      assetThesesByThesisId.set(thesisId, []);
    }

    const existing = assetThesesByThesisId.get(thesisId)!;
    if (!existing.some(e => e.id === at.id)) {
      existing.push({
        id: at.id,
        title: at.title,
        ticker: at.ticker,
      });
    }
  });

  // Combine primary and related strategies (dedupe by ID per thesis)
  [...allStrategies, ...relatedStrategies].forEach((s) => {
    const thesisId = s.macroThesisId;
    if (!thesisId) return;

    if (!strategiesByThesisId.has(thesisId)) {
      strategiesByThesisId.set(thesisId, []);
    }

    const existing = strategiesByThesisId.get(thesisId)!;
    if (!existing.some(e => e.id === s.id)) {
      existing.push({
        id: s.id,
        label: s.label,
        status: s.status,
      });
    }
  });

  return theses.map((thesis) => {
    const linkedAssetTheses = assetThesesByThesisId.get(thesis.id) ?? [];
    const linkedStrategies = strategiesByThesisId.get(thesis.id) ?? [];

    return {
      ...thesis,
      assetViewCount: assetViewMap.get(thesis.id) ?? 0,
      strategyCount: strategyMap.get(thesis.id) ?? 0,
      linkedAssetTheses,
      linkedStrategies,
    };
  });
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
  // Get asset theses where this is the primary macro thesis
  const primaryViews = await db
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

  // Get asset theses where this is a related macro thesis
  const relatedViews = await db
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
    .innerJoin(assetThesisRelatedMacroTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, thesisId))
    .orderBy(desc(assetTheses.createdAt));

  // Combine and dedupe by ID
  const viewsMap = new Map();
  primaryViews.forEach((v) => viewsMap.set(v.id, v));
  relatedViews.forEach((v) => viewsMap.set(v.id, v));
  
  return Array.from(viewsMap.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getLinkedStrategiesForThesis(thesisId: string) {
  // Strategies inherit macro thesis through asset theses
  // Get strategies from primary macro thesis connections
  const primaryStrats = await db
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

  // Get strategies from related macro thesis connections
  const relatedStrats = await db
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

  // Combine and dedupe by ID
  const stratsMap = new Map();
  primaryStrats.forEach((s) => stratsMap.set(s.id, s));
  relatedStrats.forEach((s) => stratsMap.set(s.id, s));
  
  return Array.from(stratsMap.values()).sort((a, b) => 
    new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime()
  );
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
