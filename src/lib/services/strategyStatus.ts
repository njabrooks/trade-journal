/**
 * Pure strategy open/closed classification — no DB, fully unit-testable.
 *
 * Replaces the old "is the strategy present on the ACCOUNT's single latest
 * snapshot date" rule, which mis-closed held instruments whenever an account
 * mixed snapshot cadences (e.g. crypto snapshots daily while equities snapshot
 * via Flex on different days): an instrument that didn't snapshot on the
 * account's one latest date was wrongly marked `complete` though still held.
 *
 * New rule: judge from the strategy's OWN latest open snapshot against a recency
 * window. A holding that hasn't appeared (qty != 0) within `windowDays` of the
 * current book is treated as exited. This correctly keeps an equity that
 * snapshotted 3 days ago `active` while marking a position last seen 100+ days
 * ago `complete`, regardless of what else its account holds.
 */

/** Max gap (days) a genuinely-held instrument may go without a snapshot before it reads as exited. */
export const STRATEGY_RECENCY_WINDOW_DAYS = 7;

export interface StrategyStatusInputs {
  /** True if the strategy has ever had any position rows. */
  hadPositions: boolean;
  /** The strategy's own latest snapshot_date with quantity != 0; null if it has no open rows ever. */
  latestOpenSnapshot: Date | null;
  /** Reference "current book" date — the latest snapshot across the whole book (robust to a global ingestion pause). */
  asOf: Date;
  /** Recency window in days; defaults to STRATEGY_RECENCY_WINDOW_DAYS. */
  windowDays?: number;
}

export function deriveStrategyStatusFromSnapshots(
  inputs: StrategyStatusInputs,
): 'active' | 'complete' | 'draft' {
  const { hadPositions, latestOpenSnapshot, asOf } = inputs;
  const windowDays = inputs.windowDays ?? STRATEGY_RECENCY_WINDOW_DAYS;

  if (!hadPositions) return 'draft'; // never had any positions
  if (!latestOpenSnapshot) return 'complete'; // had positions but all closed out (qty = 0)

  const ageDays = (asOf.getTime() - latestOpenSnapshot.getTime()) / 86_400_000;
  return ageDays <= windowDays ? 'active' : 'complete';
}

/**
 * autoSource marker stamped on strategies the recompute auto-cleans (empty auto-created
 * shells). Kept DISTINCT from a user rejection so the strategy reject-guards can ignore it
 * and still let a FUTURE genuine position for the symbol create a fresh strategy.
 */
export const AUTO_CLEANED_EMPTY_SOURCE = 'auto_cleaned_empty';

export interface AbandonedShellInputs {
  /** Was the strategy auto-created by the ingestion pipeline (not user-made)? */
  isAuto: boolean;
  /** Status just derived from snapshots (`draft` ⟺ never had any positions). */
  derivedStatus: 'active' | 'complete' | 'draft';
  /** When the strategy was opened — proxy for first-seen (strategies have no createdAt). */
  openedAt: Date;
  /** Reference "current book" date — latest snapshot across the whole book. */
  asOf: Date;
  /** Grace window in days before an empty auto-shell is considered abandoned. */
  windowDays?: number;
}

/**
 * True when an auto-created strategy has never held a position and has aged past the grace
 * window — i.e. a phantom shell (e.g. an IBKR option exercise/assignment STK booking that
 * netted to no position). Such shells should be auto-cleaned, not parked in `draft` forever.
 *
 * Fires ONLY for `isAuto` strategies (never user-created drafts) and ONLY when the derived
 * status is `draft` (zero positions ever — a genuinely-held strategy is `active`/`complete`,
 * so a real position can never be mistaken for an abandoned shell).
 */
export function isAbandonedAutoShell(inputs: AbandonedShellInputs): boolean {
  if (!inputs.isAuto) return false;
  if (inputs.derivedStatus !== 'draft') return false;
  const windowDays = inputs.windowDays ?? STRATEGY_RECENCY_WINDOW_DAYS;
  const ageDays = (inputs.asOf.getTime() - inputs.openedAt.getTime()) / 86_400_000;
  return ageDays > windowDays;
}
