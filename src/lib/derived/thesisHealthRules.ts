/**
 * Pure cadence rule for the monitoring thesis-health pass (W8 — docs/v2/07 §4c, B5c).
 * No DB — unit-testable.
 *
 * The health pass re-reads a monitoring thesis's signals against the latest routed
 * evidence + price context and renders a verdict per signal. To avoid re-assessing
 * everything every tick (token cost) and to avoid "still fine" noise, a thesis is
 * only "due" when there's something new to react to OR a weekly floor has elapsed
 * (open decision #2 — on-evidence + weekly floor).
 */

/** Re-assess at least this often even with no new evidence (the weekly floor). */
export const THESIS_HEALTH_FLOOR_DAYS = 7;

export interface ThesisHealthDueInputs {
  /** Only signal-bearing monitoring theses are assessable. */
  hasActiveSignals: boolean;
  /** Last time a health verdict was recorded for this thesis (thesis_health snapshot / decision), or null if never. */
  lastHealthCheck: Date | null;
  /** New routed evidence (non-health snapshots) has landed on this thesis's signals since lastHealthCheck. */
  hasNewEvidenceSince: boolean;
  /** Reference "now" — the latest snapshot across the book (robust to ingestion pauses). */
  asOf: Date;
  /** Weekly floor in days; defaults to THESIS_HEALTH_FLOOR_DAYS. */
  floorDays?: number;
}

/**
 * Is this monitoring thesis due for a health pass now?
 *
 *   no active signals          → false (nothing to assess)
 *   never health-checked        → true  (establish a baseline)
 *   new evidence since last      → true  (on-evidence trigger)
 *   else floor elapsed           → true  (weekly floor)
 *   else                         → false (quiet; no "still fine" churn)
 */
export function thesisHealthDue(i: ThesisHealthDueInputs): boolean {
  if (!i.hasActiveSignals) return false;
  if (!i.lastHealthCheck) return true;
  if (i.hasNewEvidenceSince) return true;
  const days = (i.asOf.getTime() - i.lastHealthCheck.getTime()) / 86_400_000;
  return days >= (i.floorDays ?? THESIS_HEALTH_FLOOR_DAYS);
}

/** Signal verdicts that count as a deterioration — the only ones that raise a DecisionStrip item (§4c). */
export const WEAKENING_ASSESSMENTS = ['weakening', 'invalidated'] as const;
export type WeakeningAssessment = (typeof WEAKENING_ASSESSMENTS)[number];

/** Does a per-signal verdict warrant surfacing a decision to the user? */
export function isWeakening(assessment: string): boolean {
  return (WEAKENING_ASSESSMENTS as readonly string[]).includes(assessment);
}
