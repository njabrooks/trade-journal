import { describe, it, expect } from 'vitest';
import {
  deriveStrategyStatusFromSnapshots,
  STRATEGY_RECENCY_WINDOW_DAYS,
} from '../strategyStatus';

const asOf = new Date('2026-06-18T00:00:00Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);

describe('deriveStrategyStatusFromSnapshots', () => {
  it('returns draft when the strategy never had positions', () => {
    expect(
      deriveStrategyStatusFromSnapshots({ hadPositions: false, latestOpenSnapshot: null, asOf }),
    ).toBe('draft');
  });

  it('returns complete when it had positions but all are closed out (no open snapshot)', () => {
    expect(
      deriveStrategyStatusFromSnapshots({ hadPositions: true, latestOpenSnapshot: null, asOf }),
    ).toBe('complete');
  });

  it('keeps a recently-snapshotted holding active (CVX-style, 3 days behind)', () => {
    expect(
      deriveStrategyStatusFromSnapshots({ hadPositions: true, latestOpenSnapshot: daysAgo(3), asOf }),
    ).toBe('active');
  });

  it('is robust to mixed account cadence — own latest 6 days behind the book stays active', () => {
    // The whole point of the fix: account also holds something that snapshotted today,
    // but this instrument last snapshotted 6 days ago and is still held.
    expect(
      deriveStrategyStatusFromSnapshots({ hadPositions: true, latestOpenSnapshot: daysAgo(6), asOf }),
    ).toBe('active');
  });

  it('marks a long-exited holding complete (NVDA-style, 114 days behind)', () => {
    expect(
      deriveStrategyStatusFromSnapshots({ hadPositions: true, latestOpenSnapshot: daysAgo(114), asOf }),
    ).toBe('complete');
  });

  it('treats the window boundary inclusively (exactly 7 days = active)', () => {
    expect(
      deriveStrategyStatusFromSnapshots({
        hadPositions: true,
        latestOpenSnapshot: daysAgo(STRATEGY_RECENCY_WINDOW_DAYS),
        asOf,
      }),
    ).toBe('active');
  });

  it('marks just past the window complete (8 days)', () => {
    expect(
      deriveStrategyStatusFromSnapshots({ hadPositions: true, latestOpenSnapshot: daysAgo(8), asOf }),
    ).toBe('complete');
  });

  it('honours a custom window', () => {
    expect(
      deriveStrategyStatusFromSnapshots({
        hadPositions: true,
        latestOpenSnapshot: daysAgo(20),
        asOf,
        windowDays: 30,
      }),
    ).toBe('active');
  });

  it('defaults the window to 7 days', () => {
    expect(STRATEGY_RECENCY_WINDOW_DAYS).toBe(7);
  });
});
