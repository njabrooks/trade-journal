import { describe, it, expect } from 'vitest';
import { computeExcursion, type ExcursionPoint } from '../retrospectiveExcursion';

const pt = (date: string, cumulative: number, confidence?: ExcursionPoint['confidence']): ExcursionPoint => ({
  date,
  cumulative,
  confidence,
});

describe('computeExcursion', () => {
  it('returns a safe empty result for no points', () => {
    const e = computeExcursion([]);
    expect(e.pointCount).toBe(0);
    expect(e.mfe).toBe(0);
    expect(e.mae).toBe(0);
    expect(e.mfeDate).toBeNull();
    expect(e.maeDate).toBeNull();
    expect(e.captureRatio).toBeNull();
    expect(e.giveBackFromPeak).toBeNull();
    expect(e.neverInProfit).toBe(true);
    expect(e.confidence).toBe('no_trades');
  });

  it('peak-then-giveback: the canonical "right call, poorly harvested" case', () => {
    // troughs at -5.2, peaks at +22.4, closes at +3.1
    const e = computeExcursion([
      pt('2026-01-06', 0),
      pt('2026-01-27', -5.2),
      pt('2026-03-17', 22.4),
      pt('2026-05-12', 3.1),
    ]);
    expect(e.mfe).toBe(22.4);
    expect(e.mfeDate).toBe('2026-03-17');
    expect(e.mae).toBe(-5.2);
    expect(e.maeDate).toBe('2026-01-27');
    expect(e.finalCumulative).toBe(3.1);
    expect(e.captureRatio).toBeCloseTo(0.138, 3); // 3.1 / 22.4
    expect(e.giveBackFromPeak).toBe(19.3); // 22.4 − 3.1
    expect(e.neverInProfit).toBe(false);
    expect(e.neverUnderwater).toBe(false);
  });

  it('monotonic up: captured the full move', () => {
    const e = computeExcursion([pt('a', 0), pt('b', 5), pt('c', 12)]);
    expect(e.mfe).toBe(12);
    expect(e.mfeDate).toBe('c');
    expect(e.finalCumulative).toBe(12);
    expect(e.captureRatio).toBe(1); // closed at the peak
    expect(e.giveBackFromPeak).toBe(0);
    expect(e.neverUnderwater).toBe(true); // never below 0
    expect(e.mae).toBe(0);
    expect(e.maeDate).toBe('a');
  });

  it('monotonic down: never in profit', () => {
    const e = computeExcursion([pt('a', 0), pt('b', -3), pt('c', -9)]);
    expect(e.mfe).toBe(0); // peak was the open at 0
    expect(e.mae).toBe(-9);
    expect(e.maeDate).toBe('c');
    expect(e.neverInProfit).toBe(true); // mfe ≤ 0
    expect(e.captureRatio).toBeNull();
    expect(e.giveBackFromPeak).toBeNull();
    expect(e.neverUnderwater).toBe(false);
  });

  it('all negative (entered straight into a loss): never in profit, capture undefined', () => {
    const e = computeExcursion([pt('a', -2), pt('b', -8), pt('c', -4)]);
    expect(e.mfe).toBe(-2); // best it ever was, still a loss
    expect(e.neverInProfit).toBe(true);
    expect(e.captureRatio).toBeNull();
    expect(e.mae).toBe(-8);
    expect(e.finalCumulative).toBe(-4);
  });

  it('never underwater: dips but stays at/above zero', () => {
    const e = computeExcursion([pt('a', 0), pt('b', 8), pt('c', 2), pt('d', 6)]);
    expect(e.mae).toBe(0);
    expect(e.neverUnderwater).toBe(true);
    expect(e.mfe).toBe(8);
    expect(e.captureRatio).toBeCloseTo(0.75, 5); // 6 / 8
  });

  it('single positive point: peak = trough = final, fully captured', () => {
    const e = computeExcursion([pt('only', 5)]);
    expect(e.mfe).toBe(5);
    expect(e.mae).toBe(5);
    expect(e.captureRatio).toBe(1);
    expect(e.giveBackFromPeak).toBe(0);
    expect(e.neverInProfit).toBe(false);
    expect(e.neverUnderwater).toBe(true);
  });

  it('single zero point: treated as never in profit, never underwater', () => {
    const e = computeExcursion([pt('only', 0)]);
    expect(e.mfe).toBe(0);
    expect(e.neverInProfit).toBe(true); // mfe ≤ 0
    expect(e.neverUnderwater).toBe(true); // mae ≥ 0
    expect(e.captureRatio).toBeNull();
  });

  it('first occurrence wins for extremum dates (a later equal value does not overwrite)', () => {
    const e = computeExcursion([pt('a', 10), pt('b', 10), pt('c', 4)]);
    expect(e.mfe).toBe(10);
    expect(e.mfeDate).toBe('a'); // not 'b'
  });

  it('inherits the weakest realized_confidence across the series', () => {
    const e = computeExcursion([
      pt('a', 1, 'full'),
      pt('b', 5, 'partial_history'),
      pt('c', 3, 'full'),
    ]);
    expect(e.confidence).toBe('partial_history');

    const e2 = computeExcursion([pt('a', 1, 'full'), pt('b', 2, 'no_trades')]);
    expect(e2.confidence).toBe('no_trades');

    const e3 = computeExcursion([pt('a', 1, 'full'), pt('b', 2, 'full')]);
    expect(e3.confidence).toBe('full');
  });

  it('defaults missing per-point confidence to full', () => {
    const e = computeExcursion([pt('a', 1), pt('b', 2)]);
    expect(e.confidence).toBe('full');
  });
});
