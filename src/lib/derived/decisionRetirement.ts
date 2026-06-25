/**
 * Decision-packet retirement on re-underwrite (Gap 2, docs/v2/10).
 *
 * relate-research raises a `review_refuting_claim` / `confirm_claim_link` decision packet
 * when it links a claim to a thesis. A subsequent re-underwrite (build-core-argument) that
 * folds that same claim into the living underwriting IS the human acting on it — so the
 * packet must be retired rather than re-surfacing in /decisions as if untouched.
 *
 * The match key is the COMPOSITE claim provenance (source_insight_id, source_claim_id). This
 * is load-bearing: `source_claim_id` alone is a per-insight ordinal ("claim-2", "claim-3"),
 * NOT globally unique — matching on it alone would wrongly retire unrelated packets that
 * happen to share an ordinal. Both parts are required.
 */

/** Decision types a re-underwrite is entitled to retire once it incorporates the claim. */
export const RETIRABLE_ON_REUNDERWRITE: ReadonlySet<string> = new Set([
  'review_refuting_claim',
  'confirm_claim_link',
]);

/**
 * Composite provenance key for a research-sourced claim. Returns null unless BOTH parts are
 * present — a partial key must never match, since `source_claim_id` is not unique on its own.
 */
export function provenanceKey(
  insightId: string | null | undefined,
  sourceClaimId: string | null | undefined
): string | null {
  if (!insightId || !sourceClaimId) return null;
  return `${insightId}::${sourceClaimId}`;
}

/**
 * True when a decision packet should be retired by a re-underwrite: it is a retirable type
 * AND its claim (by composite provenance key) is among the claims the new articulation
 * incorporated. `incorporatedKeys` is built with {@link provenanceKey} over the articulation's
 * claimIdsUsed, so the null-on-partial-key rule applies symmetrically on both sides.
 */
export function isPacketIncorporated(
  decisionType: string | null | undefined,
  insightId: string | null | undefined,
  sourceClaimId: string | null | undefined,
  incorporatedKeys: ReadonlySet<string>
): boolean {
  if (!decisionType || !RETIRABLE_ON_REUNDERWRITE.has(decisionType)) return false;
  const key = provenanceKey(insightId, sourceClaimId);
  return key !== null && incorporatedKeys.has(key);
}
