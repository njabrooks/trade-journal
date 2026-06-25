import { describe, it, expect } from 'vitest';
import { computeExcursion, windowCombined, type ExcursionPoint } from '../retrospectiveExcursion';

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

describe('windowCombined (episode rebasing)', () => {
  it('episode 1 (no carry-in) returns the slice unchanged', () => {
    const s = [pt('d1', 0), pt('d2', 5), pt('d3', 3)];
    expect(windowCombined(s, 'd1', 'd3')).toEqual(s);
  });

  it('rebases a later episode by the carry-in (cumulative before the window)', () => {
    // episode 1 banks +10 (d1..d3); episode 2 (d4..d7) reads 10→12→9→11 inception-to-date.
    const s = [
      pt('d1', 0), pt('d2', 7), pt('d3', 10),
      pt('d4', 10), pt('d5', 12), pt('d6', 9), pt('d7', 11),
    ];
    expect(windowCombined(s, 'd4', 'd7').map((p) => [p.date, p.cumulative])).toEqual([
      ['d4', 0], ['d5', 2], ['d6', -1], ['d7', 1],
    ]);
  });

  it("the rebased window measures the episode's OWN excursion, not the glued lifetime", () => {
    const s = [
      pt('d1', 0), pt('d2', 10), // episode 1: +10 banked
      pt('d3', 10), pt('d4', 12), pt('d5', 11), // episode 2: peaks +2, closes +1
    ];
    const raw = computeExcursion(s.slice(2)); // naive slice — still carries the +10
    const rebased = computeExcursion(windowCombined(s, 'd3', 'd5'));
    expect(raw.captureRatio).toBeCloseTo(11 / 12, 3); // wrong: dominated by episode 1
    expect(rebased.mfe).toBe(2);
    expect(rebased.finalCumulative).toBe(1);
    expect(rebased.captureRatio).toBe(0.5); // right: episode 2 captured half its own peak
  });

  it('open episode (null close) takes everything from openDay onward, rebased', () => {
    const s = [pt('d1', 0), pt('d2', 6), pt('d3', 6), pt('d4', 10)]; // banked 6 by d2; episode opens d3
    expect(windowCombined(s, 'd3', null).map((p) => [p.date, p.cumulative])).toEqual([
      ['d3', 0], ['d4', 4],
    ]);
  });

  it('returns empty when the window excludes all points', () => {
    expect(windowCombined([pt('d1', 1), pt('d2', 2)], 'd5', 'd9')).toEqual([]);
  });
});
