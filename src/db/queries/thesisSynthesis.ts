import { db } from '@/db';
import { thesisArticulations, validationPoints, validationStatusHistory } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Get the latest articulation for a thesis
 */
export async function getLatestArticulation(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  const [articulation] = await db
    .select()
    .from(thesisArticulations)
    .where(
      and(
        eq(thesisArticulations.thesisId, thesisId),
        eq(thesisArticulations.thesisType, thesisType)
      )
    )
    .orderBy(desc(thesisArticulations.version))
    .limit(1);

  return articulation || null;
}

/**
 * Get all articulation versions for a thesis
 */
export async function getArticulationHistory(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  return db
    .select()
    .from(thesisArticulations)
    .where(
      and(
        eq(thesisArticulations.thesisId, thesisId),
        eq(thesisArticulations.thesisType, thesisType)
      )
    )
    .orderBy(desc(thesisArticulations.version));
}

/**
 * Get active validation points for a thesis (excludes superseded)
 */
export async function getActiveValidationPoints(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  return db
    .select()
    .from(validationPoints)
    .where(
      and(
        eq(validationPoints.thesisId, thesisId),
        eq(validationPoints.thesisType, thesisType)
      )
    )
    .orderBy(validationPoints.createdAt);
}

/**
 * Get all validation points for a thesis (including superseded)
 */
export async function getAllValidationPoints(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  return db
    .select()
    .from(validationPoints)
    .where(
      and(
        eq(validationPoints.thesisId, thesisId),
        eq(validationPoints.thesisType, thesisType)
      )
    )
    .orderBy(validationPoints.createdAt);
}

/**
 * Get validation point by ID
 */
export async function getValidationPointById(id: string) {
  const [point] = await db
    .select()
    .from(validationPoints)
    .where(eq(validationPoints.id, id))
    .limit(1);

  return point || null;
}

/**
 * Get status history for a validation point
 */
export async function getValidationStatusHistory(validationPointId: string) {
  return db
    .select()
    .from(validationStatusHistory)
    .where(eq(validationStatusHistory.validationPointId, validationPointId))
    .orderBy(desc(validationStatusHistory.timestamp));
}

/**
 * Get validation points that need attention (triggered or monitoring)
 */
export async function getValidationPointsNeedingAttention(
  thesisId?: string,
  thesisType?: 'macro' | 'asset'
) {
  const baseQuery = db.select().from(validationPoints);

  if (thesisId && thesisType) {
    return baseQuery
      .where(
        and(
          eq(validationPoints.thesisId, thesisId),
          eq(validationPoints.thesisType, thesisType)
        )
      )
      .orderBy(validationPoints.updatedAt);
  }

  // Get all triggered/monitoring points across all theses
  return baseQuery.orderBy(desc(validationPoints.updatedAt));
}

/**
 * Summary stats for validation points
 */
export async function getValidationPointsStats(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  const points = await getActiveValidationPoints(thesisId, thesisType);

  return {
    total: points.length,
    validation: points.filter((p) => p.type === 'validation').length,
    invalidation: points.filter((p) => p.type === 'invalidation').length,
    triggered: points.filter((p) => p.status === 'triggered').length,
    monitoring: points.filter((p) => p.status === 'monitoring').length,
    critical: points.filter((p) => p.importance === 'critical').length,
    explicit: points.filter((p) => p.category === 'explicit').length,
    judgmentRequired: points.filter((p) => p.category === 'judgment_required').length,
  };
}
