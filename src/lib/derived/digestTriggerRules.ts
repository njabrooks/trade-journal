/**
 * Pure delta-trigger rule for auto digest synthesis (W8 — docs/v2/07 §4a, B4).
 * No DB — fully unit-testable (the test harness blanks DATABASE_URL_POOLER).
 *
 * A developing thesis refreshes its supporting digest (a new thesis_articulations
 * version) once it has accumulated enough new linked claims since the digest was
 * last written. This is the "when to synthesize" gate; the synthesis itself is the
 * thesis-review skill (Claude), and the write goes through insert-thesis-articulation.
 */

/** Default claim-count delta (claims added since the last articulation) that triggers a refresh. Open decision #5 — start at 3, tune. */
export const DIGEST_REFRESH_DELTA_K = 3;

export interface DigestTriggerInputs {
  /** Thesis status. B4 scope is `developing` only — a digest refresh on a monitoring
   *  thesis would trip insert-thesis-articulation's signal supersession and nuke its
   *  signals; B5 owns the coherent monitoring digest+signal refresh. */
  status: string;
  /** Current count of claims mapped to the thesis (any mapping_type). */
  currentClaimCount: number;
  /** claims_count_at_last_articulation (0 if never articulated). */
  claimsCountAtLastArticulation: number;
  /** Whether the thesis has any articulation version yet. */
  hasArticulation: boolean;
  /** Delta threshold; defaults to DIGEST_REFRESH_DELTA_K. */
  k?: number;
}

/**
 * Should this thesis get a (re)synthesized digest now?
 *
 *   not developing                         → false (B4 scope)
 *   no claims                              → false (nothing to synthesize from)
 *   never articulated, ≥ K claims          → true  (first digest)
 *   articulated, (current − last) ≥ K      → true  (enough new claims since last version)
 *   otherwise                              → false
 */
export function needsDigestRefresh(i: DigestTriggerInputs): boolean {
  if (i.status !== 'developing') return false;
  if (i.currentClaimCount <= 0) return false;
  const k = i.k ?? DIGEST_REFRESH_DELTA_K;
  if (!i.hasArticulation) {
    // First digest: wait until enough claims have accumulated to be worth synthesizing.
    return i.currentClaimCount >= k;
  }
  const delta = i.currentClaimCount - i.claimsCountAtLastArticulation;
  return delta >= k;
}
