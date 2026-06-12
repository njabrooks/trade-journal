import { db } from '@/db';
import { trades, positions } from '@/db/schema';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';

/**
 * Per-strategy realized PnL engine (W4 — docs/v2/05-w4-realized-pnl-design.md).
 *
 * Realized PnL is computed from normalized trade cash flows run through a
 * minimal average-cost state machine per (symbol) within an (account, strategy)
 * scope. This is deliberately NOT the tax-grade engine in src/lib/calculations —
 * strategy fills are plain BUY/SELL with no Koinly/transfer/ADJ semantics, and
 * strategy-level attribution wants average-cost, not lot matching.
 *
 * Source semantics (verified against live data, see design doc):
 * - IBKR rows (OPT/STK/FOP/FSFOP/CASH…): net_amount is signed cash flow,
 *   fee-net, multiplier-inclusive. Quantity is signed (sells negative).
 * - FUTURES (FUT) are the exception: IBKR margins them daily, so trade-row
 *   net_amount only carries the trade-day variation vs that day's settlement
 *   (verified 2026-06 against ESM6: short round trip net_amounts summed to
 *   +1.5K while the true P&L was −50.5K). Realized P&L must instead come from
 *   price-based synthetic flows: −signedQty × price × multiplier − fees.
 *   The multiplier comes from the positions table; a FUT row without one is
 *   skipped (flags partial_history) rather than priced wrongly.
 * - Crypto rows (CRYPTO/PERP): net_amount is gross − fees regardless of side,
 *   always positive; quantity is positive with side carrying direction. True
 *   cash flow must be reconstructed: SELL → gross − fees, BUY → −(gross + fees).
 * - fx_rate_to_base converts trade currency → USD (USD = 1; NULL for USDC ⇒ 1).
 */

const CRYPTO_CLASSES = new Set(['CRYPTO', 'PERP']);
/** Futures-style margined classes where net_amount ≠ economics. FOP/FSFOP stay
 * on net_amount (premium-style); revisit if a margined options product shows
 * the same divergence. */
const MARGINED_CLASSES = new Set(['FUT']);

export interface TradeForRealizedPnl {
  symbol: string;
  assetClass: string | null;
  side: string | null;
  /** signed for IBKR, positive for crypto */
  quantity: string | number;
  price: string | number | null;
  /** signed cash flow for IBKR; gross − fees (unsigned) for crypto */
  netAmount: string | number | null;
  fees: string | number | null;
  fxRateToBase: string | number | null;
  tradeDate: Date | string;
  /** contract multiplier — required for FUT rows (sourced from positions) */
  multiplier?: string | number | null;
}

export interface NormalizedFlow {
  symbol: string;
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** position delta: buys positive, sells negative */
  signedQty: number;
  /** USD cash impact: sells positive, buys negative, fees included */
  cashFlowUsd: number;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return n;
}

function toDateStr(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize one trade row into a position delta + USD cash flow.
 * Returns null when the row cannot be priced (missing quantity, or a crypto
 * row without price) — callers count skips for confidence reporting.
 */
export function normalizeTradeFlow(t: TradeForRealizedPnl): NormalizedFlow | null {
  const fxRaw = num(t.fxRateToBase);
  const fx = isNaN(fxRaw) || fxRaw <= 0 ? 1 : fxRaw;
  const qtyRaw = num(t.quantity);
  if (isNaN(qtyRaw) || qtyRaw === 0) return null;
  const isSell = (t.side ?? '').toUpperCase() === 'SELL';

  if (CRYPTO_CLASSES.has((t.assetClass ?? '').toUpperCase())) {
    const qty = Math.abs(qtyRaw);
    const price = num(t.price);
    if (isNaN(price)) return null;
    const fees = Math.abs(num(t.fees)) || 0;
    const gross = price * qty;
    const cashFlow = isSell ? gross - fees : -(gross + fees);
    return {
      symbol: t.symbol,
      date: toDateStr(t.tradeDate),
      signedQty: isSell ? -qty : qty,
      cashFlowUsd: cashFlow * fx,
    };
  }

  if (MARGINED_CLASSES.has((t.assetClass ?? '').toUpperCase())) {
    // Futures: net_amount only carries trade-day variation vs settlement.
    // Synthesize the economic flow from price × multiplier instead.
    const price = num(t.price);
    const mult = num(t.multiplier);
    if (isNaN(price) || isNaN(mult) || mult <= 0) return null;
    const signedQty = isSell && qtyRaw > 0 ? -qtyRaw : qtyRaw;
    const fees = Math.abs(num(t.fees)) || 0;
    return {
      symbol: t.symbol,
      date: toDateStr(t.tradeDate),
      signedQty,
      cashFlowUsd: (-signedQty * price * mult - fees) * fx,
    };
  }

  // IBKR-style rows: net_amount is the authoritative signed cash flow.
  const net = num(t.netAmount);
  if (isNaN(net)) return null;
  // Quantity is signed in IBKR data; fall back to side if a positive
  // quantity arrives on a SELL row.
  const signedQty = isSell && qtyRaw > 0 ? -qtyRaw : qtyRaw;
  return {
    symbol: t.symbol,
    date: toDateStr(t.tradeDate),
    signedQty,
    cashFlowUsd: net * fx,
  };
}

interface SymbolState {
  /** open position quantity (negative = short) */
  qty: number;
  /**
   * total signed cash basis of the open position:
   * negative for longs (cash paid out), positive for shorts (cash received).
   */
  costBasisTotal: number;
}

export interface RealizedSeriesResult {
  /** realized PnL delta per trade date (YYYY-MM-DD), in USD */
  realizedByDate: Map<string, number>;
  totalRealized: number;
  /** net traded quantity per symbol (for coverage reconciliation) */
  netQtyBySymbol: Map<string, number>;
  /** flow-derived basis of open positions per symbol (signed) */
  openBasisBySymbol: Map<string, number>;
  /** rows normalizeTradeFlow could not price */
  skippedTrades: number;
}

/**
 * Run flows chronologically through an average-cost state machine per symbol.
 *
 * Reduction realizes: realized = closingCashFlow + closedFraction × costBasisTotal.
 * A flip (reduce through zero) splits the flow proportionally by quantity:
 * the closing share realizes, the remainder opens the new position's basis.
 */
export function computeRealizedSeries(rows: TradeForRealizedPnl[]): RealizedSeriesResult {
  const flows: NormalizedFlow[] = [];
  let skippedTrades = 0;
  for (const row of rows) {
    const f = normalizeTradeFlow(row);
    if (f) flows.push(f);
    else skippedTrades++;
  }
  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const states = new Map<string, SymbolState>();
  const realizedByDate = new Map<string, number>();
  const netQtyBySymbol = new Map<string, number>();
  let totalRealized = 0;

  const addRealized = (date: string, amount: number) => {
    if (amount === 0) return;
    realizedByDate.set(date, (realizedByDate.get(date) ?? 0) + amount);
    totalRealized += amount;
  };

  for (const f of flows) {
    netQtyBySymbol.set(f.symbol, (netQtyBySymbol.get(f.symbol) ?? 0) + f.signedQty);
    const state = states.get(f.symbol) ?? { qty: 0, costBasisTotal: 0 };

    const sameDirection =
      state.qty === 0 || Math.sign(f.signedQty) === Math.sign(state.qty);

    if (sameDirection) {
      // Opening or extending: cash flow joins the basis.
      state.qty += f.signedQty;
      state.costBasisTotal += f.cashFlowUsd;
    } else if (Math.abs(f.signedQty) <= Math.abs(state.qty) + 1e-12) {
      // Reducing (possibly to flat): realize proportionally.
      const closedFraction = Math.abs(f.signedQty) / Math.abs(state.qty);
      const basisClosed = state.costBasisTotal * closedFraction;
      addRealized(f.date, f.cashFlowUsd + basisClosed);
      state.costBasisTotal -= basisClosed;
      state.qty += f.signedQty;
      if (Math.abs(state.qty) < 1e-9) {
        // Flat: flush any residual basis rounding into realized.
        addRealized(f.date, state.costBasisTotal);
        state.qty = 0;
        state.costBasisTotal = 0;
      }
    } else {
      // Flip through zero: split the flow by quantity proportion.
      const closingQty = -state.qty;
      const openingQty = f.signedQty - closingQty;
      const closingFlow = f.cashFlowUsd * (Math.abs(closingQty) / Math.abs(f.signedQty));
      const openingFlow = f.cashFlowUsd - closingFlow;
      addRealized(f.date, closingFlow + state.costBasisTotal);
      state.qty = openingQty;
      state.costBasisTotal = openingFlow;
    }

    states.set(f.symbol, state);
  }

  const openBasisBySymbol = new Map<string, number>();
  for (const [symbol, state] of states) {
    if (state.qty !== 0) openBasisBySymbol.set(symbol, state.costBasisTotal);
  }

  return { realizedByDate, totalRealized, netQtyBySymbol, openBasisBySymbol, skippedTrades };
}

export type RealizedConfidence = 'full' | 'partial_history' | 'no_trades';

/**
 * Reconcile net traded quantity against current open positions.
 * A mismatch means trade history for this scope is incomplete (unlinked or
 * pre-ingestion fills) and realized PnL is a partial view, not the truth.
 */
export function assessCoverage(
  netQtyBySymbol: Map<string, number>,
  currentPositions: Array<{ symbol: string; quantity: number }>,
  skippedTrades: number
): RealizedConfidence {
  if (netQtyBySymbol.size === 0) return 'no_trades';
  if (skippedTrades > 0) return 'partial_history';

  const posBySymbol = new Map<string, number>();
  for (const p of currentPositions) {
    posBySymbol.set(p.symbol, (posBySymbol.get(p.symbol) ?? 0) + p.quantity);
  }

  const symbols = new Set([...netQtyBySymbol.keys(), ...posBySymbol.keys()]);
  for (const symbol of symbols) {
    const traded = netQtyBySymbol.get(symbol) ?? 0;
    const held = posBySymbol.get(symbol) ?? 0;
    const tolerance = Math.max(1e-6, 0.005 * Math.max(Math.abs(traded), Math.abs(held)));
    if (Math.abs(traded - held) > tolerance) return 'partial_history';
  }
  return 'full';
}

export interface StrategyRealizedResult {
  realizedPnlToDate: number;
  confidence: RealizedConfidence;
}

/**
 * Contract multipliers for futures symbols, sourced from position rows
 * (trades don't carry one). Account-scoped; latest non-null value wins.
 */
export async function fetchFuturesMultipliers(
  accountId: string,
  symbols: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(symbols)];
  if (unique.length === 0) return out;
  const rows = await db
    .select({
      symbol: positions.symbol,
      multiplier: sql<string | null>`MAX(${positions.multiplier})`,
    })
    .from(positions)
    .where(and(eq(positions.accountId, accountId), inArray(positions.symbol, unique)))
    .groupBy(positions.symbol);
  for (const row of rows) {
    if (row.multiplier !== null) out.set(row.symbol, row.multiplier);
  }
  return out;
}

/**
 * DB wrapper: realized PnL for (account, strategy) through end of snapshotDate,
 * with coverage assessed against that date's positions.
 */
export async function computeStrategyRealizedToDate(
  accountId: string,
  strategyId: string,
  snapshotDate: string
): Promise<StrategyRealizedResult> {
  const tradeRows = await db
    .select({
      symbol: trades.symbol,
      assetClass: trades.assetClass,
      side: trades.side,
      quantity: trades.quantity,
      price: trades.price,
      netAmount: trades.netAmount,
      fees: trades.fees,
      fxRateToBase: trades.fxRateToBase,
      tradeDate: trades.tradeDate,
    })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        eq(trades.strategyId, strategyId),
        lte(sql`${trades.tradeDate}::date`, snapshotDate)
      )
    );

  if (tradeRows.length === 0) {
    return { realizedPnlToDate: 0, confidence: 'no_trades' };
  }

  const multipliers = await fetchFuturesMultipliers(
    accountId,
    tradeRows.filter((r) => MARGINED_CLASSES.has((r.assetClass ?? '').toUpperCase())).map((r) => r.symbol)
  );

  const series = computeRealizedSeries(
    tradeRows.map((r) => ({
      ...r,
      quantity: r.quantity ?? '0',
      tradeDate: r.tradeDate ?? snapshotDate,
      multiplier: multipliers.get(r.symbol) ?? null,
    }))
  );

  const positionRows = await db
    .select({ symbol: positions.symbol, quantity: positions.quantity })
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.strategyId, strategyId),
        eq(positions.snapshotDate, snapshotDate)
      )
    );

  const confidence = assessCoverage(
    series.netQtyBySymbol,
    positionRows.map((p) => ({ symbol: p.symbol, quantity: parseFloat(p.quantity ?? '0') || 0 })),
    series.skippedTrades
  );

  return { realizedPnlToDate: series.totalRealized, confidence };
}
