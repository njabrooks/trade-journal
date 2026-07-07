/**
 * Pure cost-basis math for the flex position backfill (no DB imports so it
 * stays unit-testable).
 */

export const QTY_EPSILON = 1e-6;

/**
 * Compute a position's average cost from chronologically-ordered trades,
 * looking back only as far as the last time the position was flat. A contract
 * closed months ago and re-opened today gets its basis from the new trades
 * only, never the dead position's (incident 2026-07-06: SR3Z6 inherited a
 * February basis after five months flat and showed a phantom -$197K
 * unrealized loss).
 *
 * Returns null when the trade history doesn't reconcile to the position
 * quantity (incomplete records) — callers must fall back to other sources.
 */
export function computeAvgCostSinceFlat(
  tradeList: Array<{ qty: number; price: number }>,
  targetQty: number
): number | null {
  if (Math.abs(targetQty) < QTY_EPSILON) return null;

  const parsed = tradeList.filter(
    (t) => !Number.isNaN(t.qty) && !Number.isNaN(t.price) && t.qty !== 0
  );
  if (parsed.length === 0) return null;

  // Walk backwards to the most recent point where the position was flat: the
  // shortest suffix of trades summing to the current quantity is the current
  // position's opening window; everything older nets to zero.
  let running = 0;
  let windowStart = -1;
  for (let i = parsed.length - 1; i >= 0; i--) {
    running += parsed[i]!.qty;
    if (Math.abs(running - targetQty) < QTY_EPSILON) {
      windowStart = i;
      break;
    }
  }
  if (windowStart === -1) return null;

  // Average-cost walk over the window: adds re-weight the average, reductions
  // leave it unchanged, a flip through zero restarts it at the flip price.
  let pos = 0;
  let avg = 0;
  for (let i = windowStart; i < parsed.length; i++) {
    const { qty, price } = parsed[i]!;
    if (Math.abs(pos) < QTY_EPSILON) {
      pos = qty;
      avg = price;
    } else if (Math.sign(qty) === Math.sign(pos)) {
      avg = (avg * Math.abs(pos) + price * Math.abs(qty)) / (Math.abs(pos) + Math.abs(qty));
      pos += qty;
    } else {
      const next = pos + qty;
      if (Math.abs(next) < QTY_EPSILON) {
        pos = 0;
        avg = 0;
      } else if (Math.sign(next) === Math.sign(pos)) {
        pos = next;
      } else {
        pos = next;
        avg = price;
      }
    }
  }

  if (Math.abs(pos - targetQty) > QTY_EPSILON || avg === 0) return null;

  return avg;
}
