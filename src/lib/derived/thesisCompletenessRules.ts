/**
 * Pure thesis-completeness scoring for the research-gap bridge (W8 — docs/v2/07 §4e, B6).
 * No DB — unit-testable.
 *
 * Expression-driven monitoring means a position can open BEFORE the research exists,
 * leaving a `monitoring` thesis that can't ground a digest or signals. This scores how
 * "researched" a thesis is so the loop can detect those gaps and bridge them (pull
 * Tana first, then surface a DecisionStrip "develop this thesis" item) rather than
 * fabricating belief.
 */

/** Linked-claim count at which the claim dimension is considered fully developed. */
export const COMPLETE_CLAIM_TARGET = 3;

export type CompletenessBand = 'gap' | 'thin' | 'adequate';

export interface CompletenessInputs {
  /** Claims mapped to the thesis (any mapping_type). */
  claimCount: number;
  /** Whether the thesis has any articulation/digest version. */
  hasDigest: boolean;
  /** Latest digest confidence ('low' | 'medium' | 'high' | 'very_high' | 'exploratory' | null). */
  digestConfidence: string | null;
}

export interface CompletenessResult {
  /** 0–100; higher = more researched. */
  score: number;
  band: CompletenessBand;
  /** Human-readable gaps (what's missing), for the bridge prompt. */
  reasons: string[];
}

function confidenceScore(c: string | null): number {
  if (c === 'high' || c === 'very_high') return 25;
  if (c === 'medium') return 15;
  if (c === 'low' || c === 'exploratory') return 5;
  return 0;
}

/**
 * Score a thesis's research completeness.
 *
 *   claims      → up to 60 (linear to COMPLETE_CLAIM_TARGET)
 *   has digest  → 15
 *   confidence  → 25 high / 15 medium / 5 low|exploratory / 0 none
 *
 * The `score` (0–100) is informational. The `band` is **claim-count-primary**,
 * because B6's bridge action is "develop more research" (more claims/sources): a
 * thesis with enough claims has the research it needs even if the digest is missing
 * or low-confidence (that's a synthesis job for B4/B5, not a research gap).
 *
 *   0 claims                       → `gap`      (no research to ground belief on)
 *   1..COMPLETE_CLAIM_TARGET-1      → `thin`     (insufficient research)
 *   >= COMPLETE_CLAIM_TARGET        → `adequate` (enough research; digest/signals are B4/B5)
 */
export function thesisCompleteness(i: CompletenessInputs): CompletenessResult {
  const reasons: string[] = [];
  if (i.claimCount === 0) reasons.push('no linked claims');
  else if (i.claimCount < COMPLETE_CLAIM_TARGET) reasons.push(`few linked claims (${i.claimCount})`);
  if (!i.hasDigest) reasons.push('no digest');
  else if (i.digestConfidence === 'low' || i.digestConfidence === 'exploratory') reasons.push('low-confidence digest');

  const claimScore = (Math.min(i.claimCount, COMPLETE_CLAIM_TARGET) / COMPLETE_CLAIM_TARGET) * 60;
  const digestScore = i.hasDigest ? 15 : 0;
  const score = Math.round(claimScore + digestScore + confidenceScore(i.digestConfidence));

  const band: CompletenessBand =
    i.claimCount === 0 ? 'gap' : i.claimCount < COMPLETE_CLAIM_TARGET ? 'thin' : 'adequate';
  return { score, band, reasons };
}

/**
 * Is this a research gap to bridge? A live (`monitoring`) thesis that isn't yet
 * adequately researched. developing theses are still building (B4 digest path);
 * only monitoring (live position) theses are the position→backfill inversion.
 */
export function isResearchGap(status: string, band: CompletenessBand): boolean {
  return status === 'monitoring' && band !== 'adequate';
}
