/**
 * Pure rule for the retrospective-on-close trigger (W8 — docs/v2/07 §4d, B7). No DB.
 *
 * When a thesis resolves — `closed` (was expressed, now flat), `complete`, or
 * `rejected` — the loop fires a one-off retrospective: final P&L, duration, what the
 * journal trail shows, was-I-right. This rule decides which resolved theses still
 * need one.
 */

/** Resolved statuses that warrant a retrospective. `closed` retains everything for analysis; complete/rejected are the resolved variants. */
export const RETROSPECTIVE_STATUSES = ['closed', 'complete', 'rejected'];

export interface RetrospectiveTriggerInputs {
  status: string;
  /** Whether a retrospective journal entry already exists for this thesis. */
  hasRetrospective: boolean;
}

/** Does this thesis need a retrospective now? (Resolved + not yet retrospected.) */
export function needsRetrospective(i: RetrospectiveTriggerInputs): boolean {
  return RETROSPECTIVE_STATUSES.includes(i.status) && !i.hasRetrospective;
}
