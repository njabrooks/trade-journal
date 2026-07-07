import { describe, it, expect } from 'vitest';
import { computeAvgCostSinceFlat } from '../costBasis';

describe('computeAvgCostSinceFlat', () => {
  it('derives basis from a simple accumulation', () => {
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 50, price: 100 },
        { qty: 50, price: 110 },
      ],
      100
    );
    expect(avg).toBeCloseTo(105, 10);
  });

  it('ignores a dead position closed before the current one opened (SR3Z6 incident)', () => {
    // Feb: buy 2, sell 2 (flat). Jul: buy 100 in three tranches.
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 1, price: 96.785 },
        { qty: 1, price: 96.8 },
        { qty: -2, price: 96.85 },
        { qty: 1, price: 96.005 },
        { qty: 50, price: 96.005 },
        { qty: 49, price: 95.995 },
      ],
      100
    );
    expect(avg).toBeCloseTo(96.0001, 10);
  });

  it('leaves average unchanged on a partial reduction', () => {
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 10, price: 100 },
        { qty: -5, price: 110 },
      ],
      5
    );
    expect(avg).toBeCloseTo(100, 10);
  });

  it('re-weights the average on adds after a partial reduction', () => {
    // +10@100 → -5@110 (avg stays 100) → +5@120 → avg = (5*100 + 5*120)/10
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 10, price: 100 },
        { qty: -5, price: 110 },
        { qty: 5, price: 120 },
      ],
      10
    );
    expect(avg).toBeCloseTo(110, 10);
  });

  it('handles short positions', () => {
    const avg = computeAvgCostSinceFlat(
      [
        { qty: -200, price: 0.03 },
        { qty: -150, price: 0.025 },
      ],
      -350
    );
    expect(avg).toBeCloseTo((200 * 0.03 + 150 * 0.025) / 350, 10);
  });

  it('restarts basis at the flip price when position crosses zero without touching it', () => {
    // +5@100 then -8@120: net -3 opened at 120
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 5, price: 100 },
        { qty: -8, price: 120 },
      ],
      -3
    );
    expect(avg).toBeCloseTo(120, 10);
  });

  it('returns null when trade history does not reconcile to the position', () => {
    // Position is 100 but recorded trades only account for 40
    const avg = computeAvgCostSinceFlat([{ qty: 40, price: 96 }], 100);
    expect(avg).toBeNull();
  });

  it('returns null for a flat position', () => {
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 2, price: 96.79 },
        { qty: -2, price: 96.85 },
      ],
      0
    );
    expect(avg).toBeNull();
  });

  it('returns null with no trades', () => {
    expect(computeAvgCostSinceFlat([], 10)).toBeNull();
  });

  it('uses the most recent flat boundary, not an earlier one', () => {
    // Two full round trips, then the live position
    const avg = computeAvgCostSinceFlat(
      [
        { qty: 10, price: 50 },
        { qty: -10, price: 55 },
        { qty: 20, price: 60 },
        { qty: -20, price: 65 },
        { qty: 10, price: 70 },
      ],
      10
    );
    expect(avg).toBeCloseTo(70, 10);
  });
});
