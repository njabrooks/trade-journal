import { db } from '@/db';
import { thesisArticulations, signals, signalStatusHistory } from '@/db/schema';
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
 * Get active signals for a thesis (excludes superseded)
 * Note: Legacy alias getActiveValidationPoints also exported for backwards compatibility
 */
export async function getActiveSignals(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  return db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.thesisId, thesisId),
        eq(signals.thesisType, thesisType)
      )
    )
    .orderBy(signals.createdAt);
}

// Legacy alias
export const getActiveValidationPoints = getActiveSignals;

/**
 * Get all signals for a thesis (including superseded)
 */
export async function getAllSignals(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  return db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.thesisId, thesisId),
        eq(signals.thesisType, thesisType)
      )
    )
    .orderBy(signals.createdAt);
}

// Legacy alias
export const getAllValidationPoints = getAllSignals;

/**
 * Get signal by ID
 */
export async function getSignalById(id: string) {
  const [signal] = await db
    .select()
    .from(signals)
    .where(eq(signals.id, id))
    .limit(1);

  return signal || null;
}

// Legacy alias
export const getValidationPointById = getSignalById;

/**
 * Get status history for a signal
 */
export async function getSignalStatusHistory(signalId: string) {
  return db
    .select()
    .from(signalStatusHistory)
    .where(eq(signalStatusHistory.signalId, signalId))
    .orderBy(desc(signalStatusHistory.timestamp));
}

// Legacy alias
export const getValidationStatusHistory = getSignalStatusHistory;

/**
 * Get signals that need attention (triggered or monitoring)
 */
export async function getSignalsNeedingAttention(
  thesisId?: string,
  thesisType?: 'macro' | 'asset'
) {
  const baseQuery = db.select().from(signals);

  if (thesisId && thesisType) {
    return baseQuery
      .where(
        and(
          eq(signals.thesisId, thesisId),
          eq(signals.thesisType, thesisType)
        )
      )
      .orderBy(signals.updatedAt);
  }

  // Get all triggered/monitoring signals across all theses
  return baseQuery.orderBy(desc(signals.updatedAt));
}

// Legacy alias
export const getValidationPointsNeedingAttention = getSignalsNeedingAttention;

/**
 * Summary stats for signals
 */
export async function getSignalsStats(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  const signalsList = await getActiveSignals(thesisId, thesisType);

  return {
    total: signalsList.length,
    confirmation: signalsList.filter((s) => s.type === 'confirmation').length,
    warning: signalsList.filter((s) => s.type === 'warning').length,
    triggered: signalsList.filter((s) => s.status === 'triggered').length,
    monitoring: signalsList.filter((s) => s.status === 'monitoring').length,
    critical: signalsList.filter((s) => s.importance === 'critical').length,
    explicit: signalsList.filter((s) => s.category === 'explicit').length,
    judgmentRequired: signalsList.filter((s) => s.category === 'judgment_required').length,
    // Legacy field names for backwards compatibility
    validation: signalsList.filter((s) => s.type === 'confirmation').length,
    invalidation: signalsList.filter((s) => s.type === 'warning').length,
  };
}

// Legacy alias
export const getValidationPointsStats = getSignalsStats;
