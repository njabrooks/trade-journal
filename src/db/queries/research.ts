import { db } from '@/db';
import {
  researchArtifacts,
  researchInsights,
  researchMappings,
  researchProcessingRuns,
  macroTheses,
  assetViews,
  strategies,
  positions,
  underlyings,
} from '@/db/schema';
import { eq, desc, and, isNull, inArray, sql, count, or } from 'drizzle-orm';
import type {
  NewResearchArtifact,
  NewResearchInsight,
  NewResearchMapping,
  NewResearchProcessingRun,
} from '@/db/schema';

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

export async function getResearchForAssetView(viewId: string) {
  const mappings = await db
    .select({
      mapping: researchMappings,
      insight: researchInsights,
      artifact: researchArtifacts,
    })
    .from(researchMappings)
    .innerJoin(researchInsights, eq(researchMappings.researchInsightId, researchInsights.id))
    .innerJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
    .where(eq(researchMappings.assetViewId, viewId))
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

export async function getEvidenceSummaryForAssetView(viewId: string) {
  const mappings = await db
    .select({
      mappingType: researchMappings.mappingType,
      count: sql<number>`count(*)::int`,
    })
    .from(researchMappings)
    .where(eq(researchMappings.assetViewId, viewId))
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
