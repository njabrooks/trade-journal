import { describe, expect, it } from 'vitest';
import { applyLiveOverlay, collectOverlayTickers } from '../livePricingOverlay';
import type { PortfolioPositionsData, PortfolioPositionRow } from '@/db/queries/portfolio';
import type { LiveQuote } from '@/lib/services/livePrices';

function position(overrides: Partial<PortfolioPositionRow>): PortfolioPositionRow {
  return {
    id: 'p1',
    symbol: 'AAPL',
    assetClass: 'STK',
    underlyingTicker: 'AAPL',
    underlyingId: 'u1',
    parentUnderlyingTicker: null,
    expiry: null,
    strike: null,
    optionRight: null,
    side: 'long',
    quantity: 100,
    avgPrice: 150,
    costBasisMoney: 15000,
    spot: 200,
    underlyingSpot: null,
    absNotional: null,
    absNotionalUsd: null,
    marketValueUsd: 20000,
    unrealizedPnl: 5000,
    multiplier: 1,
    currency: 'USD',
    snapshotDate: '2026-06-11',
    accountId: 'a1',
    strategyId: null,
    nav: null,
    delta: null,
    ...overrides,
  };
}

function data(positions: PortfolioPositionRow[]): PortfolioPositionsData {
  return {
    strategies: [
      {
        id: 's1',
        strategyKey: 'K',
        label: 'L',
        status: 'active',
        strategyType: null,
        direction: null,
        assetThesisId: null,
        assetThesisTitle: null,
        positions,
      },
    ],
    unlinkedPositions: [],
    nav: null,
    totalCashUsd: null,
    leverageRatio: null,
    snapshotDate: '2026-06-11',
  };
}

function quote(overrides: Partial<LiveQuote>): LiveQuote {
  return {
    key: 'STK:AAPL',
    ticker: 'AAPL',
    kind: 'STK',
    price: 210,
    currency: 'USD',
    asOfMs: 1_000,
    source: 'yahoo',
    ...overrides,
  };
}

describe('applyLiveOverlay', () => {
  it('scales market value and adjusts unrealized PnL by the price ratio', () => {
    const result = applyLiveOverlay(data([position({})]), { 'STK:AAPL': quote({}) });
    const p = result.data.strategies[0].positions[0];
    // 210/200 ratio: MV 20000 → 21000, unrealized 5000 → 6000
    expect(p.marketValueUsd).toBeCloseTo(21000, 6);
    expect(p.unrealizedPnl).toBeCloseTo(6000, 6);
    expect(p.spot).toBe(210);
    expect(result.status.liveUnderlyings).toBe(1);
    expect(result.status.livePositionCount).toBe(1);
  });

  it('handles short positions (negative market value) correctly', () => {
    const short = position({ quantity: -100, marketValueUsd: -20000, unrealizedPnl: 3000 });
    const result = applyLiveOverlay(data([short]), { 'STK:AAPL': quote({}) });
    const p = result.data.strategies[0].positions[0];
    // price up 5% against a short: MV -21000, unrealized loses 1000
    expect(p.marketValueUsd).toBeCloseTo(-21000, 6);
    expect(p.unrealizedPnl).toBeCloseTo(2000, 6);
  });

  it('rejects quotes deviating beyond the symbol-collision guard', () => {
    // dead-token scenario: live price wildly off the ≤1-day-old stored spot
    const result = applyLiveOverlay(data([position({})]), {
      'STK:AAPL': quote({ price: 0.05 }),
    });
    const p = result.data.strategies[0].positions[0];
    expect(p.marketValueUsd).toBe(20000);
    expect(result.status.liveUnderlyings).toBe(0);
    expect(result.status.overlayableUnderlyings).toBe(1);
  });

  it('rejects quotes in a different listing currency', () => {
    const result = applyLiveOverlay(data([position({ currency: 'GBP' })]), {
      'STK:AAPL': quote({ currency: 'USD' }),
    });
    expect(result.data.strategies[0].positions[0].marketValueUsd).toBe(20000);
    expect(result.status.liveUnderlyings).toBe(0);
  });

  it('never touches non-overlay asset classes', () => {
    const opt = position({ assetClass: 'OPT', symbol: 'AAPL C200', id: 'p2' });
    const result = applyLiveOverlay(data([opt]), { 'STK:AAPL': quote({}) });
    const p = result.data.strategies[0].positions[0];
    expect(p.marketValueUsd).toBe(20000);
    expect(result.status.overlayableUnderlyings).toBe(0);
  });

  it('skips positions with missing or non-positive stored spot', () => {
    const noSpot = position({ spot: null });
    const result = applyLiveOverlay(data([noSpot]), { 'STK:AAPL': quote({}) });
    expect(result.data.strategies[0].positions[0].marketValueUsd).toBe(20000);
  });
});

describe('collectOverlayTickers', () => {
  it('collects distinct STK and CRYPTO tickers only', () => {
    const positions = [
      position({}),
      position({ id: 'p2', accountId: 'a2' }), // duplicate AAPL
      position({ id: 'p3', assetClass: 'CRYPTO', underlyingTicker: 'BTC', symbol: 'BTC' }),
      position({ id: 'p4', assetClass: 'OPT' }),
      position({ id: 'p5', assetClass: 'PERP', underlyingTicker: 'ETH' }),
    ];
    const result = collectOverlayTickers(data(positions));
    expect(result.stk).toEqual(['AAPL']);
    expect(result.crypto).toEqual(['BTC']);
  });
});
