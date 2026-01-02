import { db } from '@/db';
import {
  researchArtifacts,
  researchInsights,
  researchMappings,
  researchProcessingRuns,
  researchHierarchyRecommendations,
  macroTheses,
  assetTheses,
  strategies,
  positions,
  underlyings,
  mainClaims,
  claimThesisMappings,
} from '@/db/schema';
import { eq, desc, and, isNull, inArray, sql, count, or } from 'drizzle-orm';
import type {
  NewResearchArtifact,
  NewResearchInsight,
  NewResearchMapping,
  NewResearchProcessingRun,
  NewResearchHierarchyRecommendation,
  NewMainClaim,
} from '@/db/schema';
import type { ClaimsStructure, MainClaim as AuditMainClaim } from '@/types/claims';
import { isValidClaimsStructure } from '@/types/claims';

// ============================================================================
// Research Artifacts
// ============================================================================

export async function getResearchArtifactsList(filters?: {
  status?: string;
  sourceType?: string;
  tags?: string[];
}) {
  let query = db
    .select()
    .from(researchArtifacts)
    .$dynamic();

  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(researchArtifacts.status, filters.status));
  }

  if (filters?.sourceType) {
    conditions.push(eq(researchArtifacts.sourceType, filters.sourceType));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query.orderBy(desc(researchArtifacts.ingestedAt));
}

export async function getResearchArtifactById(id: string) {
  const rows = await db
    .select()
    .from(researchArtifacts)
    .where(eq(researchArtifacts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createResearchArtifact(data: NewResearchArtifact): Promise<string> {
  const [artifact] = await db
    .insert(researchArtifacts)
    .values(data)
    .returning({ id: researchArtifacts.id });
  return artifact.id;
}

export async function updateResearchArtifact(
  id: string,
  data: Partial<NewResearchArtifact>
): Promise<void> {
  await db
    .update(researchArtifacts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(researchArtifacts.id, id));
}

export async function updateResearchArtifactStatus(
  id: string,
  status: string,
  error?: string
): Promise<void> {
  await db
    .update(researchArtifacts)
    .set({
      status,
      processingError: error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(researchArtifacts.id, id));
}

export async function deleteResearchArtifact(id: string): Promise<void> {
  await db.delete(researchArtifacts).where(eq(researchArtifacts.id, id));
}

// ============================================================================
// Research Insights
// ============================================================================

export async function getResearchInsightByArtifactId(artifactId: string) {
  const rows = await db
    .select()
    .from(researchInsights)
    .where(eq(researchInsights.researchArtifactId, artifactId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getResearchInsightById(id: string) {
  const rows = await db
    .select()
    .from(researchInsights)
    .where(eq(researchInsights.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createResearchInsight(data: NewResearchInsight): Promise<string> {
  const [insight] = await db
    .insert(researchInsights)
    .values(data)
    .returning({ id: researchInsights.id });
  return insight.id;
}

export async function updateResearchInsight(
  id: string,
  data: Partial<NewResearchInsight>
): Promise<void> {
  await db
    .update(researchInsights)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(researchInsights.id, id));
}

/**
 * Auto-promote audit claims to first-class main_claims table
 * Called when research insight is created/updated with claims_structure
 *
 * @param insightId - The research insight ID
 * @returns Number of claims promoted
 */
export async function autoPromoteAuditClaims(insightId: string): Promise<number> {
  // Get the insight with claims structure
  const insight = await getResearchInsightById(insightId);
  if (!insight?.claimsStructure) {
    return 0;
  }

  const claimsStructure = insight.claimsStructure as ClaimsStructure;
  if (!isValidClaimsStructure(claimsStructure)) {
    return 0;
  }

  let promotedCount = 0;

  // For each main claim in the audit, create or update a main_claims record
  for (const auditClaim of claimsStructure.main_claims) {
    // Check if this claim was already promoted (based on source_insight_id + source_claim_id)
    const existing = await db
      .select()
      .from(mainClaims)
      .where(
        and(
          eq(mainClaims.sourceInsightId, insightId),
          eq(mainClaims.sourceClaimId, auditClaim.id)
        )
      )
      .limit(1);

    // Normalize time_horizon: convert "N/A" and empty/null to null
    const normalizedTimeHorizon =
      !auditClaim.time_horizon || (auditClaim.time_horizon as string) === 'N/A'
        ? null
        : auditClaim.time_horizon;

    if (existing.length > 0) {
      // Already promoted, update it in case the audit claim changed
      await db
        .update(mainClaims)
        .set({
          claim: auditClaim.claim,
          evidence: auditClaim.evidence || null, // Already an array, don't wrap it
          reasoning: auditClaim.reasoning || null,
          backing: auditClaim.backing || null,
          qualifier: auditClaim.qualifier || null,
          rebuttal: auditClaim.rebuttal || null, // Already an array, don't wrap it
          timeHorizon: normalizedTimeHorizon,
          relevantTickers: auditClaim.relevant_tickers || [],
          category: auditClaim.category,
          updatedAt: new Date(),
        })
        .where(eq(mainClaims.id, existing[0].id));
    } else {
      // Not yet promoted, create new main_claims record
      const newMainClaim: NewMainClaim = {
        title: auditClaim.title, // Use the concise title from audit heading
        category: auditClaim.category,
        claim: auditClaim.claim,
        evidence: auditClaim.evidence || null, // Already an array, don't wrap it
        reasoning: auditClaim.reasoning || null,
        backing: auditClaim.backing || null,
        qualifier: auditClaim.qualifier || null,
        rebuttal: auditClaim.rebuttal || null, // Already an array, don't wrap it
        timeHorizon: normalizedTimeHorizon,
        relevantTickers: auditClaim.relevant_tickers || [],
        status: 'unconfirmed', // Default status for auto-promoted claims
        sourceInsightId: insightId,
        sourceClaimId: auditClaim.id,
      };

      await db.insert(mainClaims).values(newMainClaim);
      promotedCount++;
    }
  }

  return promotedCount;
}

/**
 * Get all first-class main claims with source metadata
 * Used for unified claims browser page
 */
export async function getAllMainClaimsWithSources() {
  const claims = await db
    .select({
      claim: mainClaims,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(mainClaims)
    .leftJoin(
      researchInsights,
      eq(mainClaims.sourceInsightId, researchInsights.id)
    )
    .leftJoin(
      researchArtifacts,
      eq(researchInsights.researchArtifactId, researchArtifacts.id)
    )
    .orderBy(desc(mainClaims.createdAt));

  // Fetch linked theses and views for all claims
  const claimIds = claims.map(c => c.claim.id);

  if (claimIds.length === 0) {
    return claims.map(c => ({ ...c, linkedTheses: [], linkedViews: [] }));
  }

  const linkedThesesData = await db
    .select({
      claimId: claimThesisMappings.mainClaimId,
      thesisId: macroTheses.id,
      thesisTitle: macroTheses.title,
    })
    .from(claimThesisMappings)
    .innerJoin(macroTheses, eq(claimThesisMappings.macroThesisId, macroTheses.id))
    .where(inArray(claimThesisMappings.mainClaimId, claimIds));

  const linkedViewsData = await db
    .select({
      claimId: claimThesisMappings.mainClaimId,
      viewId: assetTheses.id,
      viewTitle: assetTheses.title,
      ticker: underlyings.ticker,
    })
    .from(claimThesisMappings)
    .innerJoin(assetTheses, eq(claimThesisMappings.assetThesisId, assetTheses.id))
    .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(claimThesisMappings.mainClaimId, claimIds));

  // Group linked entities by claim ID
  const thesesByClaimId = new Map<string, Array<{ id: string; title: string }>>();
  linkedThesesData.forEach(row => {
    if (!thesesByClaimId.has(row.claimId)) {
      thesesByClaimId.set(row.claimId, []);
    }
    thesesByClaimId.get(row.claimId)!.push({
      id: row.thesisId,
      title: row.thesisTitle,
    });
  });

  const viewsByClaimId = new Map<string, Array<{ id: string; title: string; ticker: string }>>();
  linkedViewsData.forEach(row => {
    if (!viewsByClaimId.has(row.claimId)) {
      viewsByClaimId.set(row.claimId, []);
    }
    viewsByClaimId.get(row.claimId)!.push({
      id: row.viewId,
      title: row.viewTitle,
      ticker: row.ticker,
    });
  });

  // Merge linked entities with claims
  return claims.map(c => ({
    ...c,
    linkedTheses: thesesByClaimId.get(c.claim.id) || [],
    linkedViews: viewsByClaimId.get(c.claim.id) || [],
  }));
}

/**
 * Get main claims for a specific artifact with source metadata
 * Used for research details page (filtered view of unified claims browser)
 */
export async function getMainClaimsForArtifact(artifactId: string) {
  const claims = await db
    .select({
      claim: mainClaims,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(mainClaims)
    .leftJoin(
      researchInsights,
      eq(mainClaims.sourceInsightId, researchInsights.id)
    )
    .leftJoin(
      researchArtifacts,
      eq(researchInsights.researchArtifactId, researchArtifacts.id)
    )
    .where(eq(researchArtifacts.id, artifactId))
    .orderBy(desc(mainClaims.createdAt));

  // Fetch linked theses and views for all claims
  const claimIds = claims.map(c => c.claim.id);

  if (claimIds.length === 0) {
    return claims.map(c => ({ ...c, linkedTheses: [], linkedViews: [] }));
  }

  const linkedThesesData = await db
    .select({
      claimId: claimThesisMappings.mainClaimId,
      thesisId: macroTheses.id,
      thesisTitle: macroTheses.title,
    })
    .from(claimThesisMappings)
    .innerJoin(macroTheses, eq(claimThesisMappings.macroThesisId, macroTheses.id))
    .where(inArray(claimThesisMappings.mainClaimId, claimIds));

  const linkedViewsData = await db
    .select({
      claimId: claimThesisMappings.mainClaimId,
      viewId: assetTheses.id,
      viewTitle: assetTheses.title,
      ticker: underlyings.ticker,
    })
    .from(claimThesisMappings)
    .innerJoin(assetTheses, eq(claimThesisMappings.assetThesisId, assetTheses.id))
    .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(claimThesisMappings.mainClaimId, claimIds));

  // Group linked entities by claim ID
  const thesesByClaimId = new Map<string, Array<{ id: string; title: string }>>();
  linkedThesesData.forEach(row => {
    if (!thesesByClaimId.has(row.claimId)) {
      thesesByClaimId.set(row.claimId, []);
    }
    thesesByClaimId.get(row.claimId)!.push({
      id: row.thesisId,
      title: row.thesisTitle,
    });
  });

  const viewsByClaimId = new Map<string, Array<{ id: string; title: string; ticker: string }>>();
  linkedViewsData.forEach(row => {
    if (!viewsByClaimId.has(row.claimId)) {
      viewsByClaimId.set(row.claimId, []);
    }
    viewsByClaimId.get(row.claimId)!.push({
      id: row.viewId,
      title: row.viewTitle,
      ticker: row.ticker,
    });
  });

  // Merge linked entities with claims
  return claims.map(c => ({
    ...c,
    linkedTheses: thesesByClaimId.get(c.claim.id) || [],
    linkedViews: viewsByClaimId.get(c.claim.id) || [],
  }));
}

/**
 * Promote a main claim from 'unconfirmed' to 'confirmed' status
 */
export async function promoteMainClaim(claimId: string): Promise<void> {
  await db
    .update(mainClaims)
    .set({
      status: 'confirmed',
      updatedAt: new Date(),
    })
    .where(eq(mainClaims.id, claimId));
}

/**
 * Get a single main claim by ID with source metadata and linked entity IDs
 * Used for claims detail page
 */
export async function getMainClaimById(claimId: string) {
  const [claimData] = await db
    .select({
      claim: mainClaims,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(mainClaims)
    .leftJoin(
      researchInsights,
      eq(mainClaims.sourceInsightId, researchInsights.id)
    )
    .leftJoin(
      researchArtifacts,
      eq(researchInsights.researchArtifactId, researchArtifacts.id)
    )
    .where(eq(mainClaims.id, claimId))
    .limit(1);

  if (!claimData) {
    return null;
  }

  // Fetch linked macro thesis IDs
  const linkedMacroThesisIds = await db
    .select({
      thesisId: macroTheses.id,
    })
    .from(claimThesisMappings)
    .innerJoin(macroTheses, eq(claimThesisMappings.macroThesisId, macroTheses.id))
    .where(eq(claimThesisMappings.mainClaimId, claimId));

  // Fetch linked asset thesis IDs
  const linkedAssetThesisIds = await db
    .select({
      assetThesisId: assetTheses.id,
    })
    .from(claimThesisMappings)
    .innerJoin(assetTheses, eq(claimThesisMappings.assetThesisId, assetTheses.id))
    .where(eq(claimThesisMappings.mainClaimId, claimId));

  return {
    ...claimData,
    linkedMacroThesisIds: linkedMacroThesisIds.map(row => row.thesisId),
    linkedAssetThesisIds: linkedAssetThesisIds.map(row => row.assetThesisId),
  };
}

/**
 * @deprecated Use getAllMainClaimsWithSources() instead
 * Get all claims from all research insights with source metadata (JSONB)
 * This is the old method that queries JSONB claims_structure
 */
export async function getAllClaimsWithSources() {
  const insights = await db
    .select({
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(researchInsights)
    .innerJoin(
      researchArtifacts,
      eq(researchInsights.researchArtifactId, researchArtifacts.id)
    )
    .where(sql`${researchInsights.claimsStructure} IS NOT NULL`)
    .orderBy(desc(researchArtifacts.publishedDate), desc(researchInsights.structuredAt));

  return insights;
}

// Pre-investment research: insights with no mappings
export async function getPreInvestmentResearch() {
  // Get all insights
  const allInsights = await db
    .select({
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(researchInsights)
    .innerJoin(
      researchArtifacts,
      eq(researchInsights.researchArtifactId, researchArtifacts.id)
    )
    .orderBy(desc(researchInsights.structuredAt));

  // Get all insight IDs that have mappings
  const mappedInsightIds = await db
    .selectDistinct({ insightId: researchMappings.researchInsightId })
    .from(researchMappings);

  const mappedIds = new Set(mappedInsightIds.map((m) => m.insightId));

  // Filter out insights that have mappings
  return allInsights.filter((item) => !mappedIds.has(item.insight.id));
}

// ============================================================================
// Research Mappings
// ============================================================================

export async function createResearchMapping(data: NewResearchMapping): Promise<string> {
  const [mapping] = await db
    .insert(researchMappings)
    .values(data)
    .returning({ id: researchMappings.id });
  return mapping.id;
}

export async function getResearchMappingsForInsight(insightId: string) {
  return db
    .select()
    .from(researchMappings)
    .where(eq(researchMappings.researchInsightId, insightId))
    .orderBy(desc(researchMappings.mappedAt));
}

export async function getResearchForThesis(thesisId: string) {
  const mappings = await db
    .select({
      mapping: researchMappings,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(researchMappings)
    .innerJoin(researchInsights, eq(researchMappings.researchInsightId, researchInsights.id))
    .innerJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
    .where(eq(researchMappings.macroThesisId, thesisId))
    .orderBy(desc(researchMappings.mappedAt));

  return mappings;
}

export async function getResearchForAssetThesis(viewId: string) {
  const mappings = await db
    .select({
      mapping: researchMappings,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(researchMappings)
    .innerJoin(researchInsights, eq(researchMappings.researchInsightId, researchInsights.id))
    .innerJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
    .where(eq(researchMappings.assetThesisId, viewId))
    .orderBy(desc(researchMappings.mappedAt));

  return mappings;
}

export async function getResearchForStrategy(strategyId: string) {
  const mappings = await db
    .select({
      mapping: researchMappings,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(researchMappings)
    .innerJoin(researchInsights, eq(researchMappings.researchInsightId, researchInsights.id))
    .innerJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
    .where(eq(researchMappings.strategyId, strategyId))
    .orderBy(desc(researchMappings.mappedAt));

  return mappings;
}

export async function deleteResearchMapping(id: string): Promise<void> {
  await db.delete(researchMappings).where(eq(researchMappings.id, id));
}

// Get evidence summary for a thesis/view (count of supporting/refuting research)
export async function getEvidenceSummaryForThesis(thesisId: string) {
  const mappings = await db
    .select({
      mappingType: researchMappings.mappingType,
      count: sql<number>`count(*)::int`,
    })
    .from(researchMappings)
    .where(eq(researchMappings.macroThesisId, thesisId))
    .groupBy(researchMappings.mappingType);

  return {
    supports: mappings.find((m) => m.mappingType === 'supports')?.count ?? 0,
    refutes: mappings.find((m) => m.mappingType === 'refutes')?.count ?? 0,
    neutral: mappings.find((m) => m.mappingType === 'neutral')?.count ?? 0,
    exploratory: mappings.find((m) => m.mappingType === 'exploratory')?.count ?? 0,
    total: mappings.reduce((acc, m) => acc + m.count, 0),
  };
}

export async function getEvidenceSummaryForAssetThesis(viewId: string) {
  const mappings = await db
    .select({
      mappingType: researchMappings.mappingType,
      count: sql<number>`count(*)::int`,
    })
    .from(researchMappings)
    .where(eq(researchMappings.assetThesisId, viewId))
    .groupBy(researchMappings.mappingType);

  return {
    supports: mappings.find((m) => m.mappingType === 'supports')?.count ?? 0,
    refutes: mappings.find((m) => m.mappingType === 'refutes')?.count ?? 0,
    neutral: mappings.find((m) => m.mappingType === 'neutral')?.count ?? 0,
    exploratory: mappings.find((m) => m.mappingType === 'exploratory')?.count ?? 0,
    total: mappings.reduce((acc, m) => acc + m.count, 0),
  };
}

// ============================================================================
// Research Processing Runs
// ============================================================================

export async function createResearchProcessingRun(
  data: NewResearchProcessingRun
): Promise<string> {
  const [run] = await db
    .insert(researchProcessingRuns)
    .values(data)
    .returning({ id: researchProcessingRuns.id });
  return run.id;
}

export async function updateResearchProcessingRun(
  id: string,
  data: Partial<NewResearchProcessingRun>
): Promise<void> {
  await db
    .update(researchProcessingRuns)
    .set(data)
    .where(eq(researchProcessingRuns.id, id));
}

export async function getProcessingRunsForArtifact(artifactId: string) {
  return db
    .select()
    .from(researchProcessingRuns)
    .where(eq(researchProcessingRuns.researchArtifactId, artifactId))
    .orderBy(desc(researchProcessingRuns.startedAt));
}

export async function getRecentProcessingRuns(limit = 20) {
  return db
    .select({
      run: researchProcessingRuns,
      artifact: researchArtifacts,
    })
    .from(researchProcessingRuns)
    .innerJoin(
      researchArtifacts,
      eq(researchProcessingRuns.researchArtifactId, researchArtifacts.id)
    )
    .orderBy(desc(researchProcessingRuns.startedAt))
    .limit(limit);
}

// ============================================================================
// Stats and Analytics
// ============================================================================

export async function getResearchStats() {
  const [stats] = await db
    .select({
      totalArtifacts: sql<number>`count(distinct ${researchArtifacts.id})::int`,
      totalInsights: sql<number>`count(distinct ${researchInsights.id})::int`,
      totalMappings: sql<number>`count(distinct ${researchMappings.id})::int`,
      rawCount: sql<number>`count(distinct case when ${researchArtifacts.status} = 'raw' then ${researchArtifacts.id} end)::int`,
      structuredCount: sql<number>`count(distinct case when ${researchArtifacts.status} = 'structured' then ${researchArtifacts.id} end)::int`,
      processingCount: sql<number>`count(distinct case when ${researchArtifacts.status} = 'processing' then ${researchArtifacts.id} end)::int`,
      errorCount: sql<number>`count(distinct case when ${researchArtifacts.status} = 'error' then ${researchArtifacts.id} end)::int`,
    })
    .from(researchArtifacts)
    .leftJoin(researchInsights, eq(researchArtifacts.id, researchInsights.researchArtifactId))
    .leftJoin(researchMappings, eq(researchInsights.id, researchMappings.researchInsightId));

  return stats;
}

// Get total AI processing costs
export async function getTotalAiProcessingCosts() {
  const [result] = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${researchInsights.aiProcessingCostUsd}::numeric), 0)::numeric`,
      count: sql<number>`count(*)::int`,
    })
    .from(researchInsights)
    .where(sql`${researchInsights.aiProcessingCostUsd} is not null`);

  return {
    totalCost: Number(result.totalCost ?? 0),
    processedCount: result.count ?? 0,
  };
}

// ============================================================================
// Research Hierarchy Recommendations
// ============================================================================

export async function createResearchHierarchyRecommendation(
  data: NewResearchHierarchyRecommendation
): Promise<string> {
  const [result] = await db.insert(researchHierarchyRecommendations).values(data).returning({ id: researchHierarchyRecommendations.id });
  return result.id;
}

export async function getRecommendationsForInsight(insightId: string) {
  return db
    .select()
    .from(researchHierarchyRecommendations)
    .where(eq(researchHierarchyRecommendations.researchInsightId, insightId))
    .orderBy(desc(researchHierarchyRecommendations.generatedAt));
}

export async function getRecommendationById(id: string) {
  const [result] = await db
    .select()
    .from(researchHierarchyRecommendations)
    .where(eq(researchHierarchyRecommendations.id, id))
    .limit(1);
  return result || null;
}

export async function updateRecommendationStatus(
  id: string,
  status: 'pending' | 'accepted' | 'rejected' | 'modified',
  modifiedByUser: boolean = false
) {
  const updateData: any = {
    status,
    modifiedByUser,
  };

  if (status === 'accepted') {
    updateData.acceptedAt = new Date();
  } else if (status === 'rejected') {
    updateData.rejectedAt = new Date();
  }

  await db
    .update(researchHierarchyRecommendations)
    .set(updateData)
    .where(eq(researchHierarchyRecommendations.id, id));
}

export async function deleteRecommendation(id: string): Promise<void> {
  await db
    .delete(researchHierarchyRecommendations)
    .where(eq(researchHierarchyRecommendations.id, id));
}
