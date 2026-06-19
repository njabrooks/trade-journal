import { db } from '@/db';
import { assetTheses, macroTheses, underlyings, strategies, accounts, mainClaims, claimThesisMappings, researchInsights, researchArtifacts, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq, desc, inArray, and, count } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NewAssetThesis } from '@/db/schema';

export interface AssetThesisListItem {
  id: string;
  title: string;
  description: string | null;
  underlyingId: string | null;
  ticker: string | null;
  underlyingName: string | null;
  direction: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  notes: any;
  createdAt: Date;
  updatedAt: Date;
  strategyCount: number;
  claimCount: number;
  macroThesisCount: number;
  // All linked macro theses (no primary/related distinction)
  linkedMacroTheses: Array<{ id: string; title: string; thesisType: string; relationshipNote: string | null }>;
  linkedStrategies: Array<{ id: string; label: string | null; status: string }>;
}

export async function getAssetThesesList(): Promise<AssetThesisListItem[]> {
  const views = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      description: assetTheses.description,
      underlyingId: assetTheses.underlyingId,
      ticker: underlyings.ticker,
      underlyingName: underlyings.name,
      direction: assetTheses.direction,
      timeHorizon: assetTheses.timeHorizon,
      confidenceLevel: assetTheses.confidenceLevel,
      status: assetTheses.status,
      notes: assetTheses.notes,
      createdAt: assetTheses.createdAt,
      updatedAt: assetTheses.updatedAt,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .orderBy(desc(assetTheses.createdAt));

  if (views.length === 0) {
    return [];
  }

  const viewIds = views.map((v) => v.id);

  // Get strategy counts (active + draft only)
  const strategyCounts = await db
    .select({
      assetThesisId: strategies.assetThesisId,
      count: count(),
    })
    .from(strategies)
    .where(and(inArray(strategies.assetThesisId, viewIds), inArray(strategies.status, ['active', 'draft'])))
    .groupBy(strategies.assetThesisId);

  const strategyMap = new Map(
    strategyCounts.map((c) => [c.assetThesisId, Number(c.count)])
  );

  // Get macro thesis counts (from junction table)
  const macroThesisCounts = await db
    .select({
      assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
      count: count(),
    })
    .from(assetThesisRelatedMacroTheses)
    .where(inArray(assetThesisRelatedMacroTheses.assetThesisId, viewIds))
    .groupBy(assetThesisRelatedMacroTheses.assetThesisId);

  const macroThesisMap = new Map(
    macroThesisCounts.map((c) => [c.assetThesisId, Number(c.count)])
  );

  // Get claim counts
  const claimCounts = await db
    .select({
      assetThesisId: claimThesisMappings.assetThesisId,
      count: count(),
    })
    .from(claimThesisMappings)
    .where(inArray(claimThesisMappings.assetThesisId, viewIds))
    .groupBy(claimThesisMappings.assetThesisId);

  const claimMap = new Map(
    claimCounts.map((c) => [c.assetThesisId, Number(c.count)])
  );

  // Fetch all linked macro theses for all views (via junction table)
  const allLinkedMacroTheses = await db
    .select({
      assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
      id: macroTheses.id,
      title: macroTheses.title,
      thesisType: macroTheses.thesisType,
      relationshipNote: assetThesisRelatedMacroTheses.relationshipNote,
      addedAt: assetThesisRelatedMacroTheses.addedAt,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
    .where(inArray(assetThesisRelatedMacroTheses.assetThesisId, viewIds))
    .orderBy(assetThesisRelatedMacroTheses.addedAt);

  // Fetch all linked strategies for all views (active + draft only)
  const allStrategies = await db
    .select({
      assetThesisId: strategies.assetThesisId,
      id: strategies.id,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
    })
    .from(strategies)
    .where(and(inArray(strategies.assetThesisId, viewIds), inArray(strategies.status, ['active', 'draft'])));

  // Build maps of linked entities
  const macroThesesByViewId = new Map<string, Array<{ id: string; title: string; thesisType: string; relationshipNote: string | null }>>();
  const strategiesByViewId = new Map<string, Array<{ id: string; label: string | null; status: string }>>();

  allLinkedMacroTheses.forEach((mt) => {
    if (!macroThesesByViewId.has(mt.assetThesisId)) {
      macroThesesByViewId.set(mt.assetThesisId, []);
    }
    macroThesesByViewId.get(mt.assetThesisId)!.push({
      id: mt.id,
      title: mt.title,
      thesisType: mt.thesisType,
      relationshipNote: mt.relationshipNote,
    });
  });

  allStrategies.forEach((s) => {
    if (!s.assetThesisId) return;
    if (!strategiesByViewId.has(s.assetThesisId)) {
      strategiesByViewId.set(s.assetThesisId, []);
    }
    strategiesByViewId.get(s.assetThesisId)!.push({
      id: s.id,
      label: s.label,
      status: s.status,
    });
  });

  return views.map((view) => ({
    ...view,
    strategyCount: strategyMap.get(view.id) ?? 0,
    claimCount: claimMap.get(view.id) ?? 0,
    macroThesisCount: macroThesisMap.get(view.id) ?? 0,
    linkedMacroTheses: macroThesesByViewId.get(view.id) ?? [],
    linkedStrategies: strategiesByViewId.get(view.id) ?? [],
  }));
}

export async function getAssetThesisById(id: string) {
  const rows = await db
    .select({
      view: assetTheses,
      underlying: underlyings,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(eq(assetTheses.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  // Get all linked macro theses (via junction table)
  const linkedMacroTheses = await db
    .select({
      id: assetThesisRelatedMacroTheses.id,
      macroThesisId: macroTheses.id,
      title: macroTheses.title,
      thesisType: macroTheses.thesisType,
      direction: macroTheses.direction,
      timeHorizon: macroTheses.timeHorizon,
      status: macroTheses.status,
      relationshipNote: assetThesisRelatedMacroTheses.relationshipNote,
      addedAt: assetThesisRelatedMacroTheses.addedAt,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
    .where(eq(assetThesisRelatedMacroTheses.assetThesisId, id))
    .orderBy(assetThesisRelatedMacroTheses.addedAt);

  return {
    ...rows[0].view,
    linkedMacroTheses,
    underlying: rows[0].underlying,
  };
}

export async function createAssetThesis(data: NewAssetThesis): Promise<string> {
  const [view] = await db
    .insert(assetTheses)
    .values(data)
    .returning({ id: assetTheses.id });
  return view.id;
}

export async function updateAssetThesis(
  id: string,
  data: Partial<NewAssetThesis>
): Promise<void> {
  await db
    .update(assetTheses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assetTheses.id, id));
}

export async function deleteAssetThesis(id: string): Promise<void> {
  await db.delete(assetTheses).where(eq(assetTheses.id, id));
}

export async function getLinkedStrategiesForAssetThesis(assetThesisId: string) {
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
    .leftJoin(accounts, eq(strategies.accountId, accounts.id))
    .where(eq(strategies.assetThesisId, assetThesisId))
    .orderBy(desc(strategies.openedAt));

  return strats;
}

export async function getLinkedMainClaimsForAssetThesis(assetThesisId: string) {
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
    .where(eq(claimThesisMappings.assetThesisId, assetThesisId))
    .orderBy(desc(mainClaims.createdAt));

  return claims;
}

export async function getMainClaimsWithSourcesForAssetThesis(assetThesisId: string) {
  // Direct artifact provenance (D1) — observations cite their artifact via
  // main_claims.source_artifact_id with no research_insight row. Coalesced below.
  const directArtifact = alias(researchArtifacts, 'direct_artifact');

  // Get claims linked to this asset thesis with their source information
  const claimsData = await db
    .select({
      claim: mainClaims,
      insight: researchInsights,
      artifact: researchArtifacts,
      directArtifact: directArtifact,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
    .leftJoin(researchInsights, eq(mainClaims.sourceInsightId, researchInsights.id))
    .leftJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
    .leftJoin(directArtifact, eq(mainClaims.sourceArtifactId, directArtifact.id))
    .where(eq(claimThesisMappings.assetThesisId, assetThesisId))
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
    artifact: row.artifact ?? row.directArtifact,
    linkedTheses: linkedThesesMap.get(row.claim.id) || [],
    linkedViews: linkedViewsMap.get(row.claim.id) || [],
  }));
}
