/**
 * Pure rule for the classify_exposure decision (C5b — docs/v2/09 §7 Matrix 4).
 * No DB — fully unit-testable.
 *
 * When strategy auto-link creates a *placeholder* asset thesis for a new live exposure
 * (position→backfill), it's ambiguous whether that exposure reflects a genuine belief
 * to develop or a tactical hedge. Above a size bar (§12 #3 — tactical hedges shouldn't
 * each spawn a decision) we ask the user once. This is a deterministic detect-and-raise:
 * no agent judgment is needed to *ask* — the judgment is the user's answer.
 */

/** Default exposure (abs USD) at/above which a placeholder is worth a tactical-vs-belief decision. §12 #3. */
export const DEFAULT_EXPOSURE_BAR_USD = 1000;

export interface ExposureClassificationInputs {
  /** Auto-created placeholder (notes.auto_placeholder, or the placeholder-creation journal entry). */
  isPlaceholder: boolean;
  /** Asset thesis status. */
  status: string;
  /** Current exposure of the linked strategy/strategies (USD; sign-agnostic). */
  notionalUsd: number;
  /** A classify_exposure decision already exists for this thesis (ANY status) — don't re-ask. */
  alreadyClassified: boolean;
  /** Size bar; defaults to DEFAULT_EXPOSURE_BAR_USD. */
  minNotionalUsd?: number;
}

/**
 * Should this placeholder raise a tactical-vs-belief decision now?
 *   not a placeholder                    → false (real theses aren't auto-classified)
 *   not developing/monitoring            → false
 *   already asked (any classify decision) → false (the user settled it)
 *   exposure below the size bar          → false (tactical/dust — don't spawn a decision)
 *   otherwise                            → true
 */
export function needsExposureClassification(i: ExposureClassificationInputs): boolean {
  if (!i.isPlaceholder) return false;
  if (i.status !== 'developing' && i.status !== 'monitoring') return false;
  if (i.alreadyClassified) return false;
  return Math.abs(i.notionalUsd) >= (i.minNotionalUsd ?? DEFAULT_EXPOSURE_BAR_USD);
}
