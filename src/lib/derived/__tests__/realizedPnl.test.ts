import { describe, it, expect, vi } from 'vitest';

// realizedPnl.ts imports @/db at module level for the DB wrapper; the pure
// functions under test never touch it. Shim it so importing doesn't throw
// (vitest.config.ts blanks DATABASE_URL_POOLER on purpose).
vi.mock('@/db', () => ({ db: {} }));

import {
  normalizeTradeFlow,
  computeRealizedSeries,
  assessCoverage,
  type TradeForRealizedPnl,
} from '@/lib/derived/realizedPnl';

const ibkr = (over: Partial<TradeForRealizedPnl>): TradeForRealizedPnl => ({
  symbol: 'TEST',
  assetClass: 'STK',
  side: 'BUY',
  quantity: 1,
  price: null,
  netAmount: -100,
  fees: 0,
  fxRateToBase: 1,
  tradeDate: '2026-01-02',
  ...over,
});

const crypto = (over: Partial<TradeForRealizedPnl>): TradeForRealizedPnl => ({
  symbol: 'HYPE',
  assetClass: 'PERP',
  side: 'BUY',
  quantity: 1,
  price: 100,
  netAmount: null,
  fees: 0,
  fxRateToBase: null,
  tradeDate: '2026-01-02',
  ...over,
});

describe('normalizeTradeFlow', () => {
  it('IBKR option BUY: signed net_amount is authoritative (multiplier baked in)', () => {
    // Real data shape: BUY 2 contracts @ 54.615 → net −10,923.71 (≈ −2×54.615×100 − fees)
    const f = normalizeTradeFlow(
      ibkr({ assetClass: 'OPT', side: 'BUY', quantity: 2, netAmount: -10923.7065 })
    )!;
    expect(f.signedQty).toBe(2);
    expect(f.cashFlowUsd).toBeCloseTo(-10923.7065, 6);
  });

  it('IBKR SELL: quantity already signed negative, net positive', () => {
    const f = normalizeTradeFlow(
      ibkr({ assetClass: 'OPT', side: 'SELL', quantity: -2, netAmount: 3979.204932 })
    )!;
    expect(f.signedQty).toBe(-2);
    expect(f.cashFlowUsd).toBeCloseTo(3979.204932, 6);
  });

  it('IBKR SELL with positive quantity falls back to side for the sign', () => {
    const f = normalizeTradeFlow(ibkr({ side: 'SELL', quantity: 3, netAmount: 300 }))!;
    expect(f.signedQty).toBe(-3);
  });

  it('crypto BUY reconstructs true cash-out: −(gross + fees)', () => {
    // Real data shape: PERP BUY 0.1 @ 453.95, fees 0.008896 → stored net 45.386 (gross − fees)
    // True cash flow = −(45.395 + 0.008896) = −45.403896
    const f = normalizeTradeFlow(
      crypto({ side: 'BUY', quantity: 0.1, price: 453.95, fees: 0.008896, netAmount: 45.386104 })
    )!;
    expect(f.signedQty).toBeCloseTo(0.1, 9);
    expect(f.cashFlowUsd).toBeCloseTo(-(0.1 * 453.95 + 0.008896), 6);
  });

  it('crypto SELL: gross − fees, negative quantity delta', () => {
    // SELL 2491.52 @ 58.576, fees 28.604881 → +145,943.275 − 28.605 = +145,914.670
    const f = normalizeTradeFlow(
      crypto({ side: 'SELL', quantity: 2491.52, price: 58.576, fees: 28.604881 })
    )!;
    expect(f.signedQty).toBeCloseTo(-2491.52, 6);
    expect(f.cashFlowUsd).toBeCloseTo(2491.52 * 58.576 - 28.604881, 3);
  });

  it('applies fx_rate_to_base to USD (GBP example) and defaults null fx to 1', () => {
    const gbp = normalizeTradeFlow(ibkr({ netAmount: 100, fxRateToBase: 1.33 }))!;
    expect(gbp.cashFlowUsd).toBeCloseTo(133, 9);
    const usdc = normalizeTradeFlow(crypto({ side: 'SELL', quantity: 1, price: 50, fxRateToBase: null }))!;
    expect(usdc.cashFlowUsd).toBeCloseTo(50, 9);
  });

  it('returns null for unpriceable rows (zero qty; crypto without price)', () => {
    expect(normalizeTradeFlow(ibkr({ quantity: 0 }))).toBeNull();
    expect(normalizeTradeFlow(crypto({ price: null }))).toBeNull();
  });
});

describe('computeRealizedSeries', () => {
  it('long round trip: realized = sell flow + buy basis', () => {
    // buy 10 (cash −1000), sell 10 (cash +1200) → realized 200
    const r = computeRealizedSeries([
      ibkr({ quantity: 10, netAmount: -1000, tradeDate: '2026-01-02' }),
      ibkr({ side: 'SELL', quantity: -10, netAmount: 1200, tradeDate: '2026-01-05' }),
    ]);
    expect(r.totalRealized).toBeCloseTo(200, 9);
    expect(r.realizedByDate.get('2026-01-05')).toBeCloseTo(200, 9);
    expect(r.netQtyBySymbol.get('TEST')).toBeCloseTo(0, 9);
    expect(r.openBasisBySymbol.size).toBe(0);
  });

  it('partial closes realize proportionally against average basis', () => {
    // buy 10 @ −1000 → basis −1000
    // sell 4 @ +480 → closes 40%: realized 480 + (−400) = 80; basis left −600/qty 6
    // sell 6 @ +540 → realized 540 + (−600) = −60. Total +20.
    const r = computeRealizedSeries([
      ibkr({ quantity: 10, netAmount: -1000, tradeDate: '2026-01-02' }),
      ibkr({ side: 'SELL', quantity: -4, netAmount: 480, tradeDate: '2026-01-03' }),
      ibkr({ side: 'SELL', quantity: -6, netAmount: 540, tradeDate: '2026-01-04' }),
    ]);
    expect(r.realizedByDate.get('2026-01-03')).toBeCloseTo(80, 9);
    expect(r.realizedByDate.get('2026-01-04')).toBeCloseTo(-60, 9);
    expect(r.totalRealized).toBeCloseTo(20, 9);
  });

  it('averages across multiple acquisitions before a close', () => {
    // buy 1 @ −100, buy 1 @ −200 → basis −300 for 2
    // sell 1 @ +180 → closes 50%: realized 180 + (−150) = 30; open basis −150
    const r = computeRealizedSeries([
      ibkr({ quantity: 1, netAmount: -100, tradeDate: '2026-01-02' }),
      ibkr({ quantity: 1, netAmount: -200, tradeDate: '2026-01-03' }),
      ibkr({ side: 'SELL', quantity: -1, netAmount: 180, tradeDate: '2026-01-04' }),
    ]);
    expect(r.totalRealized).toBeCloseTo(30, 9);
    expect(r.openBasisBySymbol.get('TEST')).toBeCloseTo(-150, 9);
  });

  it('short cycle: sell to open, buy to cover', () => {
    // sell 5 @ +500 → short basis +500; buy 5 @ −400 → realized −400 + 500 = 100
    const r = computeRealizedSeries([
      ibkr({ side: 'SELL', quantity: -5, netAmount: 500, tradeDate: '2026-01-02' }),
      ibkr({ side: 'BUY', quantity: 5, netAmount: -400, tradeDate: '2026-01-06' }),
    ]);
    expect(r.totalRealized).toBeCloseTo(100, 9);
  });

  it('flip long→short splits the flow by quantity proportion', () => {
    // long 2 @ basis −200; sell 5 @ +600:
    //   closing 2/5 of flow = +240 → realized 240 − 200 = 40
    //   remaining 3/5 = +360 opens short basis
    // buy 3 @ −300 covers → realized −300 + 360 = 60. Total 100.
    const r = computeRealizedSeries([
      ibkr({ quantity: 2, netAmount: -200, tradeDate: '2026-01-02' }),
      ibkr({ side: 'SELL', quantity: -5, netAmount: 600, tradeDate: '2026-01-03' }),
      ibkr({ side: 'BUY', quantity: 3, netAmount: -300, tradeDate: '2026-01-04' }),
    ]);
    expect(r.realizedByDate.get('2026-01-03')).toBeCloseTo(40, 9);
    expect(r.realizedByDate.get('2026-01-04')).toBeCloseTo(60, 9);
    expect(r.totalRealized).toBeCloseTo(100, 9);
  });

  it('keeps symbols independent and counts skipped rows', () => {
    const r = computeRealizedSeries([
      ibkr({ symbol: 'AAA', quantity: 1, netAmount: -100 }),
      ibkr({ symbol: 'BBB', quantity: 1, netAmount: -50 }),
      ibkr({ symbol: 'AAA', side: 'SELL', quantity: -1, netAmount: 120, tradeDate: '2026-01-03' }),
      ibkr({ symbol: 'CCC', quantity: 0 }), // unpriceable
    ]);
    expect(r.totalRealized).toBeCloseTo(20, 9);
    expect(r.openBasisBySymbol.get('BBB')).toBeCloseTo(-50, 9);
    expect(r.skippedTrades).toBe(1);
  });

  it('crypto round trip nets fees on both legs', () => {
    // buy 2 @ 100, fees 1 → flow −201; sell 2 @ 110, fees 1.1 → flow +218.9
    // realized = 218.9 − 201 = 17.9
    const r = computeRealizedSeries([
      crypto({ side: 'BUY', quantity: 2, price: 100, fees: 1, tradeDate: '2026-01-02' }),
      crypto({ side: 'SELL', quantity: 2, price: 110, fees: 1.1, tradeDate: '2026-01-03' }),
    ]);
    expect(r.totalRealized).toBeCloseTo(17.9, 9);
  });

  it('CAT-style option exercise/assignment realizes through the attached stock legs', () => {
    const rows: TradeForRealizedPnl[] = [
      ibkr({
        symbol: 'CAT   260618C00900000',
        assetClass: 'OPT',
        side: 'BUY',
        quantity: 5,
        netAmount: -23458.50375,
        tradeDate: '2026-05-11',
      }),
      ibkr({
        symbol: 'CAT   260618C00950000',
        assetClass: 'OPT',
        side: 'SELL',
        quantity: -5,
        netAmount: 12096.23054,
        tradeDate: '2026-05-11',
      }),
      ibkr({
        symbol: 'CAT   260618P00860000',
        assetClass: 'OPT',
        side: 'SELL',
        quantity: -5,
        netAmount: 11291.247123,
        tradeDate: '2026-05-11',
      }),
      ibkr({
        symbol: 'CAT   260618C00900000',
        assetClass: 'OPT',
        side: 'SELL',
        quantity: -5,
        netAmount: 0,
        tradeDate: '2026-06-18',
      }),
      ibkr({
        symbol: 'CAT   260618C00950000',
        assetClass: 'OPT',
        side: 'BUY',
        quantity: 5,
        netAmount: 0,
        tradeDate: '2026-06-18',
      }),
      ibkr({
        symbol: 'CAT   260618P00860000',
        assetClass: 'OPT',
        side: 'BUY',
        quantity: 5,
        netAmount: 0,
        tradeDate: '2026-06-18',
      }),
      ibkr({
        symbol: 'CAT',
        assetClass: 'STK',
        side: 'BUY',
        quantity: 500,
        netAmount: -450000,
        tradeDate: '2026-06-18',
      }),
      ibkr({
        symbol: 'CAT',
        assetClass: 'STK',
        side: 'SELL',
        quantity: -500,
        netAmount: 475000,
        tradeDate: '2026-06-18',
      }),
    ];

    const r = computeRealizedSeries(rows);
    expect(r.totalRealized).toBeCloseTo(24928.973913, 6);
    expect(r.netQtyBySymbol.get('CAT')).toBe(0);
    expect(r.netQtyBySymbol.get('CAT   260618C00900000')).toBe(0);
    expect(r.netQtyBySymbol.get('CAT   260618C00950000')).toBe(0);
    expect(r.netQtyBySymbol.get('CAT   260618P00860000')).toBe(0);
  });
});

describe('futures flows (FUT — margined, net_amount is NOT economics)', () => {
  // Live-data case (ESM6 short, 2026-03→04): net_amount per trade row only
  // carries trade-day variation vs settlement; summing those gave +1,503.50
  // while the true round-trip P&L was ≈ −50,534. Price×multiplier flows must
  // be used instead.
  const fut = (over: Partial<TradeForRealizedPnl>): TradeForRealizedPnl => ({
    symbol: 'ESM6',
    assetClass: 'FUT',
    side: 'SELL',
    quantity: -1,
    price: 6663.25,
    netAmount: 160.25, // trade-day variation — must be IGNORED
    fees: -2.25,
    fxRateToBase: 1,
    tradeDate: '2026-03-19',
    multiplier: 50,
    ...over,
  });

  it('normalizes FUT from price × multiplier, not net_amount', () => {
    const f = normalizeTradeFlow(fut({}));
    expect(f).not.toBeNull();
    // SELL 1 @ 6663.25 × 50 → +333,162.50 cash in, minus 2.25 fees
    expect(f!.signedQty).toBe(-1);
    expect(f!.cashFlowUsd).toBeCloseTo(333160.25, 2);
  });

  it('ESM6 short round trip realizes the true loss (regression for the live bug)', () => {
    const series = computeRealizedSeries([
      fut({}), // SELL 1 @ 6663.25
      fut({ quantity: -1, price: 6515.25, netAmount: -5352.25, tradeDate: '2026-04-02' }),
      fut({
        side: 'BUY',
        quantity: 2,
        price: 7094.5,
        netAmount: 6695.5,
        fees: -4.5,
        tradeDate: '2026-04-17',
      }),
    ]);
    // (6663.25 + 6515.25 − 2×7094.5) × 50 − 9 fees = −50,534.00
    expect(series.totalRealized).toBeCloseTo(-50534.0, 2);
    expect(series.netQtyBySymbol.get('ESM6')).toBe(0);
    expect(series.skippedTrades).toBe(0);
  });

  it('skips FUT rows without a multiplier (partial view beats a wrong number)', () => {
    const series = computeRealizedSeries([fut({ multiplier: null })]);
    expect(series.skippedTrades).toBe(1);
    expect(series.totalRealized).toBe(0);
  });

  it('FOP stays on net_amount (premium-style until proven otherwise)', () => {
    const f = normalizeTradeFlow(
      fut({ assetClass: 'FOP', symbol: 'OZWN6 C0710', netAmount: -125, multiplier: null })
    );
    expect(f).not.toBeNull();
    expect(f!.cashFlowUsd).toBeCloseTo(-125, 2);
  });
});

describe('assessCoverage', () => {
  it('full when net traded quantity matches held positions', () => {
    const c = assessCoverage(new Map([['AAA', 10]]), [{ symbol: 'AAA', quantity: 10 }], 0);
    expect(c).toBe('full');
  });

  it('full for a closed scope (net zero, no positions)', () => {
    const c = assessCoverage(new Map([['AAA', 0]]), [], 0);
    expect(c).toBe('full');
  });

  it('partial_history on quantity mismatch (e.g. unlinked early fills)', () => {
    // Real-data example: DOGE strategy net traded −96,458 vs held 0.0164
    const c = assessCoverage(new Map([['DOGE', -96458.836]]), [{ symbol: 'DOGE', quantity: 0.0164 }], 0);
    expect(c).toBe('partial_history');
  });

  it('partial_history when a held symbol has no trades at all', () => {
    const c = assessCoverage(new Map([['AAA', 5]]), [
      { symbol: 'AAA', quantity: 5 },
      { symbol: 'BBB', quantity: 3 },
    ], 0);
    expect(c).toBe('partial_history');
  });

  it('partial_history when rows were skipped; no_trades when empty', () => {
    expect(assessCoverage(new Map([['AAA', 1]]), [{ symbol: 'AAA', quantity: 1 }], 2)).toBe('partial_history');
    expect(assessCoverage(new Map(), [], 0)).toBe('no_trades');
  });

  it('tolerates sub-0.5% rounding differences but not real gaps', () => {
    // diff 0.2 on 100.2 = 0.2% → inside the 0.5% tolerance → full
    expect(assessCoverage(new Map([['AAA', 100.2]]), [{ symbol: 'AAA', quantity: 100.0 }], 0)).toBe('full');
    // diff 2 on 102 ≈ 2% → outside tolerance → partial
    expect(assessCoverage(new Map([['AAA', 102]]), [{ symbol: 'AAA', quantity: 100.0 }], 0)).toBe('partial_history');
  });
});
