/**
 * Pure rule for auto-linking a strategy to its asset thesis (W8 follow-on). No DB.
 *
 * Principle (per design): EVERY strategy belongs to an asset thesis — even a hedge
 * or tactical trade is just another strategy expressing (or hedging) the long-term
 * belief about the underlying. So the goal is always to link; the only nuance is
 * linking to the RIGHT thesis when the traded instrument differs from the economic
 * underlying (e.g. IBIT→BTC, PURR→HYPE).
 *
 * The DB layer resolves the canonical underlying first (following
 * underlyings.parent_underlying_id, e.g. IBIT→BTC, JITOSOL→SOL), then calls this
 * rule with facts about that canonical underlying.
 */

export type StrategyThesisAction = 'skip' | 'link' | 'create_placeholder' | 'flag';

export interface StrategyThesisLinkInputs {
  /** The strategy already has an asset_thesis_id. */
  alreadyLinked: boolean;
  /** Canonical underlying is a stablecoin / cash equivalent (no belief). */
  isStablecoin: boolean;
  /** An asset thesis already exists for the canonical underlying. */
  hasThesisOnCanonical: boolean;
  /** asset_class of the canonical underlying (post parent-chain resolution). */
  canonicalAssetClass: string | null;
  /** Whether the canonical underlying still has an unresolved parent ambiguity
   *  (an option/derivative or ETF-like instrument with no parent_underlying_id set,
   *  i.e. we can't tell what real underlying it proxies). */
  unresolvedProxy: boolean;
}

/** Asset classes that represent a derivative/proxy whose real underlying may differ. */
const PROXY_ASSET_CLASSES = ['OPT', 'FOP', 'FSFOP', 'WAR'];

/**
 * What to do for one strategy:
 *
 *   already linked                          → skip
 *   stablecoin/cash                          → skip (no belief)
 *   thesis exists on canonical underlying    → link (incl. IBIT→BTC via parent chain)
 *   unresolved proxy (OPT/ETF, no parent)    → flag (needs judgment: which underlying?)
 *   otherwise (direct underlying)            → create_placeholder
 */
export function decideStrategyThesisAction(i: StrategyThesisLinkInputs): StrategyThesisAction {
  if (i.alreadyLinked) return 'skip';
  if (i.isStablecoin) return 'skip';
  if (i.hasThesisOnCanonical) return 'link';
  if (i.unresolvedProxy || (i.canonicalAssetClass != null && PROXY_ASSET_CLASSES.includes(i.canonicalAssetClass))) {
    return 'flag';
  }
  return 'create_placeholder';
}

/** Direction for a placeholder thesis from the strategy's net signed position quantity. */
export function inferThesisDirection(netSignedQuantity: number): 'bullish' | 'bearish' | 'neutral' {
  if (netSignedQuantity > 0) return 'bullish';
  if (netSignedQuantity < 0) return 'bearish';
  return 'neutral';
}
