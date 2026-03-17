/**
 * Internal DB collector for signal tracking.
 * Checks parent thesis status/confidence for invalidation signals.
 */

import { db, schema } from '../db.js';
import { eq } from 'drizzle-orm';

export interface InternalDbSnapshot {
  observedValue: number; // 1 = condition met (thesis invalidated/downgraded), 0 = no change
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary: string;
}

/**
 * Check parent thesis status for invalidation signals.
 */
export async function collectInternalDb(
  explicitDetails: Record<string, unknown>
): Promise<InternalDbSnapshot | null> {
  const parentThesisId = explicitDetails.parentThesisId as string | undefined;
  if (!parentThesisId) return null;

  const parentTitle = explicitDetails.parentThesisTitle as string || 'Unknown thesis';
  const conditions = explicitDetails.conditions as Array<Record<string, unknown>> | undefined;

  // Query the parent thesis
  const [thesis] = await db
    .select({
      status: schema.macroTheses.status,
      confidenceLevel: schema.macroTheses.confidenceLevel,
      title: schema.macroTheses.title,
    })
    .from(schema.macroTheses)
    .where(eq(schema.macroTheses.id, parentThesisId))
    .limit(1);

  if (!thesis) {
    return {
      observedValue: 0,
      thresholdValue: 1,
      pctToThreshold: 0,
      unit: 'status',
      evidenceSummary: `Parent thesis "${parentTitle}" not found in database`,
    };
  }

  // Check conditions (any match = invalidation signal triggered)
  let triggered = false;
  let reason = '';

  if (conditions) {
    for (const cond of conditions) {
      const field = cond.field as string;
      const threshold = cond.threshold as string;

      if (field === 'status' && thesis.status === threshold) {
        triggered = true;
        reason = `Status is "${thesis.status}"`;
        break;
      }
      if (field === 'confidence_level' && thesis.confidenceLevel === threshold) {
        triggered = true;
        reason = `Confidence downgraded to "${thesis.confidenceLevel}"`;
        break;
      }
    }
  }

  return {
    observedValue: triggered ? 1 : 0,
    thresholdValue: 1,
    pctToThreshold: triggered ? 100 : 0,
    unit: 'status',
    evidenceSummary: triggered
      ? `⚠️ Parent thesis "${thesis.title}": ${reason}`
      : `Parent thesis "${thesis.title}": status=${thesis.status}, confidence=${thesis.confidenceLevel}`,
  };
}
