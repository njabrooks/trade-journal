/**
 * Pure rules for asset→macro framing (C5a — docs/v2/09 §7 Matrix 4:
 * frame_asset_under_macro / classify_macro_link; 08 outstanding #4).
 * No DB — fully unit-testable.
 *
 * Two questions:
 *   1. Which asset theses *need* framing? (deterministic — a coverage gap.)
 *   2. Given the agent's judged framing, auto-link or raise a decision?
 *      (encodes the §12 #4 + #7 sign-off: `related` auto-links at high confidence,
 *       `gated_by` ALWAYS raises a decision because it wires compositional invalidation.)
 */

/** Confidence at/above which a judged `related` link is created silently (no decision). §12 #4/#7. */
export const AUTO_RELATED_CONFIDENCE = 0.7;
/** Below this, the relation is too speculative to act on at all (mirrors relate-research's floor). */
export const FRAMING_FLOOR_CONFIDENCE = 0.4;

export interface FramingInputs {
  /** Asset thesis status — framing only applies to live belief (developing/monitoring). */
  status: string;
  /** Existing asset_thesis_related_macro_theses count for this asset thesis. */
  macroLinkCount: number;
}

/**
 * Does this asset thesis need framing now?
 *   not developing/monitoring  → false (closed/resolved/draft stand alone)
 *   already has a macro link    → false (framed; re-classification is out of scope)
 *   otherwise (0 macro links)   → true  (coverage gap — Matrix 1 "asset thesis w/ no macro")
 *
 * Note: an asset thesis MAY legitimately stand alone; this only flags it as a *candidate*
 * for the agent to judge. The agent drops it (skip) when no macro genuinely frames it.
 */
export function needsFraming(i: FramingInputs): boolean {
  if (i.status !== 'developing' && i.status !== 'monitoring') return false;
  return i.macroLinkCount === 0;
}

export type FramingDisposition = 'auto' | 'decision' | 'skip';

/**
 * Given the agent's judged framing of an asset under a macro, what should happen?
 *   no genuine relation / below floor   → skip   (leave unframed; an asset can stand alone)
 *   gated_by                            → decision (ALWAYS — compositional invalidation, §12 #4)
 *   related, confidence ≥ AUTO          → auto    (silent link)
 *   related, confidence < AUTO          → decision (surface for confirmation, §12 #7)
 */
export function framingDisposition(i: {
  relationshipType: 'related' | 'gated_by' | 'none';
  confidence: number;
  minConfidence?: number;
}): FramingDisposition {
  if (i.relationshipType === 'none' || i.confidence < FRAMING_FLOOR_CONFIDENCE) return 'skip';
  if (i.relationshipType === 'gated_by') return 'decision';
  return i.confidence >= (i.minConfidence ?? AUTO_RELATED_CONFIDENCE) ? 'auto' : 'decision';
}
