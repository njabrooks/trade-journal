import { db } from '@/db';
import { monitoringSpecs, monitoringEvents, validationPoints } from '@/db/schema';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';

/**
 * Create a new monitoring spec
 */
export async function createMonitoringSpec(data: {
  validationPointId: string;
  keywords: string[];
  semanticDescription?: string;
  sources: string[];
  exclusions?: string[];
  frequency: 'daily' | 'weekly' | 'on_demand';
  alertThreshold: {
    type: 'any_new_data' | 'score_threshold' | 'manual_only';
    scoreThreshold?: number;
  };
  enabled?: boolean;
}) {
  // Calculate next check date based on frequency
  const nextCheck = calculateNextCheckDate(data.frequency);

  const [spec] = await db
    .insert(monitoringSpecs)
    .values({
      validationPointId: data.validationPointId,
      keywords: data.keywords,
      semanticDescription: data.semanticDescription || null,
      sources: data.sources,
      exclusions: data.exclusions || [],
      frequency: data.frequency,
      lastChecked: null,
      nextCheck,
      alertThreshold: data.alertThreshold,
      enabled: data.enabled ?? true,
    })
    .returning();

  return spec;
}

/**
 * Get monitoring specs for a thesis
 */
export async function getMonitoringSpecsByThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  return db
    .select({
      spec: monitoringSpecs,
      validationPoint: validationPoints,
    })
    .from(monitoringSpecs)
    .innerJoin(validationPoints, eq(monitoringSpecs.validationPointId, validationPoints.id))
    .where(
      and(
        eq(validationPoints.thesisId, thesisId),
        eq(validationPoints.thesisType, thesisType)
      )
    )
    .orderBy(validationPoints.createdAt);
}

/**
 * Get monitoring specs for a specific validation point
 */
export async function getMonitoringSpecsByValidationPoint(validationPointId: string) {
  return db
    .select()
    .from(monitoringSpecs)
    .where(eq(monitoringSpecs.validationPointId, validationPointId))
    .orderBy(desc(monitoringSpecs.createdAt));
}

/**
 * Get monitoring spec by ID
 */
export async function getMonitoringSpecById(id: string) {
  const [spec] = await db
    .select()
    .from(monitoringSpecs)
    .where(eq(monitoringSpecs.id, id))
    .limit(1);

  return spec || null;
}

/**
 * Update monitoring spec
 */
export async function updateMonitoringSpec(
  id: string,
  data: Partial<{
    keywords: string[];
    semanticDescription: string | null;
    sources: string[];
    exclusions: string[];
    frequency: 'daily' | 'weekly' | 'on_demand';
    alertThreshold: {
      type: 'any_new_data' | 'score_threshold' | 'manual_only';
      scoreThreshold?: number;
    };
    enabled: boolean;
    lastChecked: Date | null;
    nextCheck: Date | null;
  }>
) {
  const [updated] = await db
    .update(monitoringSpecs)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(monitoringSpecs.id, id))
    .returning();

  return updated;
}

/**
 * Delete monitoring spec
 */
export async function deleteMonitoringSpec(id: string) {
  await db.delete(monitoringSpecs).where(eq(monitoringSpecs.id, id));
}

/**
 * Create a monitoring event
 */
export async function createMonitoringEvent(data: {
  monitoringSpecId: string;
  validationPointId: string;
  checkedBy: 'user' | 'scheduled' | 'claude';
  dataSource: 'fred' | 'news' | 'price_iv' | 'sec_filings';
  queryParams: Record<string, any>;
  resultsCount: number;
  resultsSummary: Array<{
    title: string;
    date: string;
    source: string;
    snippet: string;
    link?: string;
    rawData?: any;
  }>;
}) {
  const [event] = await db
    .insert(monitoringEvents)
    .values({
      monitoringSpecId: data.monitoringSpecId,
      validationPointId: data.validationPointId,
      checkedAt: new Date(),
      checkedBy: data.checkedBy,
      dataSource: data.dataSource,
      queryParams: data.queryParams,
      resultsCount: data.resultsCount,
      resultsSummary: data.resultsSummary,
    })
    .returning();

  return event;
}

/**
 * Update monitoring event with user assessment
 */
export async function updateMonitoringEventAssessment(
  eventId: string,
  data: {
    userRelevanceScore?: number;
    userAssessmentNotes?: string;
    triggeredStatusChange?: boolean;
    statusHistoryId?: string;
  }
) {
  const [updated] = await db
    .update(monitoringEvents)
    .set({
      userRelevanceScore: data.userRelevanceScore ?? null,
      userAssessmentNotes: data.userAssessmentNotes ?? null,
      triggeredStatusChange: data.triggeredStatusChange ?? false,
      statusHistoryId: data.statusHistoryId ?? null,
    })
    .where(eq(monitoringEvents.id, eventId))
    .returning();

  return updated;
}

/**
 * Get monitoring events for a validation point
 */
export async function getMonitoringEventsByValidationPoint(
  validationPointId: string,
  limit = 50
) {
  return db
    .select({
      event: monitoringEvents,
      spec: monitoringSpecs,
    })
    .from(monitoringEvents)
    .innerJoin(monitoringSpecs, eq(monitoringEvents.monitoringSpecId, monitoringSpecs.id))
    .where(eq(monitoringEvents.validationPointId, validationPointId))
    .orderBy(desc(monitoringEvents.checkedAt))
    .limit(limit);
}

/**
 * Get monitoring events for a spec
 */
export async function getMonitoringEventsBySpec(specId: string, limit = 50) {
  return db
    .select()
    .from(monitoringEvents)
    .where(eq(monitoringEvents.monitoringSpecId, specId))
    .orderBy(desc(monitoringEvents.checkedAt))
    .limit(limit);
}

/**
 * Get monitoring event by ID
 */
export async function getMonitoringEventById(id: string) {
  const [event] = await db
    .select({
      event: monitoringEvents,
      spec: monitoringSpecs,
      validationPoint: validationPoints,
    })
    .from(monitoringEvents)
    .innerJoin(monitoringSpecs, eq(monitoringEvents.monitoringSpecId, monitoringSpecs.id))
    .innerJoin(validationPoints, eq(monitoringEvents.validationPointId, validationPoints.id))
    .where(eq(monitoringEvents.id, id))
    .limit(1);

  return event || null;
}

/**
 * Get latest monitoring event for a spec
 */
export async function getLatestMonitoringEvent(specId: string) {
  const [event] = await db
    .select()
    .from(monitoringEvents)
    .where(eq(monitoringEvents.monitoringSpecId, specId))
    .orderBy(desc(monitoringEvents.checkedAt))
    .limit(1);

  return event || null;
}

/**
 * Get specs that need checking (enabled, next check is due)
 */
export async function getSpecsDueForCheck() {
  return db
    .select()
    .from(monitoringSpecs)
    .where(
      and(
        eq(monitoringSpecs.enabled, true),
        sql`${monitoringSpecs.nextCheck} <= NOW()`
      )
    )
    .orderBy(monitoringSpecs.nextCheck);
}

/**
 * Update spec last checked time and calculate next check
 */
export async function updateSpecCheckTime(specId: string) {
  const spec = await getMonitoringSpecById(specId);
  if (!spec) return null;

  const now = new Date();
  const nextCheck = calculateNextCheckDate(spec.frequency as 'daily' | 'weekly' | 'on_demand');

  return updateMonitoringSpec(specId, {
    lastChecked: now,
    nextCheck,
  });
}

/**
 * Calculate next check date based on frequency
 */
function calculateNextCheckDate(frequency: 'daily' | 'weekly' | 'on_demand'): Date | null {
  if (frequency === 'on_demand') return null;

  const now = new Date();
  const next = new Date(now);

  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  }

  return next;
}

/**
 * Get monitoring stats for a validation point
 */
export async function getMonitoringStatsForValidationPoint(validationPointId: string) {
  const [stats] = await db
    .select({
      totalChecks: sql<number>`COUNT(*)`,
      lastChecked: sql<Date>`MAX(${monitoringEvents.checkedAt})`,
      avgRelevanceScore: sql<number>`AVG(${monitoringEvents.userRelevanceScore})`,
      triggeredCount: sql<number>`SUM(CASE WHEN ${monitoringEvents.triggeredStatusChange} = true THEN 1 ELSE 0 END)`,
    })
    .from(monitoringEvents)
    .where(eq(monitoringEvents.validationPointId, validationPointId));

  return stats || null;
}
