import { describe, it, expect } from 'vitest';
import {
  classifySignalChronicNeutral,
  isMaterialMove,
  hasFlagWithin,
  detectPriceCoverageGap,
  isChronicFlag,
  MIN_TRACKING_OBSERVATIONS,
  type SnapshotLite,
  type PricePoint,
} from '../signalQualityRules';

const NOW = new Date('2026-06-24T00:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const snap = (assessment: string | null, dataSource: string, dayAgo: number): SnapshotLite => ({
  assessment,
  dataSource,
  snapshotDate: daysAgo(dayAgo),
});
/** N tracking observations, all `assessment`, spread one per day ending yesterday. */
const tracking = (n: number, assessment: string | null, source = 'thesis_observe'): SnapshotLite[] =>
  Array.from({ length: n }, (_, i) => snap(assessment, source, i + 1));
const px = (dayAgo: number, spot: number): PricePoint => ({ date: daysAgo(dayAgo), spot });

describe('classifySignalChronicNeutral', () => {
  it('no snapshots → insufficient_data (the data gate)', () => {
    const r = classifySignalChronicNeutral([], NOW);
    expect(r.observedCount).toBe(0);
    expect(r.neutralRate).toBeNull();
    expect(r.verdict).toBe('insufficient_data');
  });

  it('below the observation floor → insufficient_data', () => {
    const r = classifySignalChronicNeutral(tracking(MIN_TRACKING_OBSERVATIONS - 1, 'neutral'), NOW);
    expect(r.observedCount).toBe(MIN_TRACKING_OBSERVATIONS - 1);
    expect(r.verdict).toBe('insufficient_data');
  });

  it('observed ≥ floor, never non-neutral → chronic_neutral (the hard flag)', () => {
    const r = classifySignalChronicNeutral(tracking(14, 'neutral'), NOW);
    expect(r.observedCount).toBe(14);
    expect(r.nonNeutralCount).toBe(0);
    expect(r.neutralRate).toBe(1);
    expect(r.verdict).toBe('chronic_neutral');
  });

  it('one stray flip at exactly the low-info rate → low_information', () => {
    // 10 obs, 1 non-neutral → neutralRate 0.9 (>= LOW_INFO_NEUTRAL_RATE)
    const snaps = [...tracking(9, 'neutral'), snap('strengthening', 'thesis_observe', 10)];
    const r = classifySignalChronicNeutral(snaps, NOW);
    expect(r.observedCount).toBe(10);
    expect(r.nonNeutralCount).toBe(1);
    expect(r.neutralRate).toBeCloseTo(0.9, 5);
    expect(r.verdict).toBe('low_information');
  });

  it('regularly discriminates → discriminating (no flag)', () => {
    // 10 obs, 3 non-neutral → rate 0.7 < 0.9
    const snaps = [...tracking(7, 'neutral'), snap('weakening', 'thesis_observe', 8), snap('strengthening', 'thesis_observe', 9), snap('weakening', 'thesis_observe', 10)];
    const r = classifySignalChronicNeutral(snaps, NOW);
    expect(r.nonNeutralCount).toBe(3);
    expect(r.verdict).toBe('discriminating');
  });

  it('THE TRAP: daily_synthesis gap-fill neutrals are NOT counted', () => {
    // 12 neutral daily_synthesis rows (producer was dark) + 0 real tracking obs
    const gapFill = Array.from({ length: 12 }, (_, i) => snap('neutral', 'daily_synthesis', i + 1));
    const r = classifySignalChronicNeutral(gapFill, NOW);
    expect(r.observedCount).toBe(0);
    expect(r.verdict).toBe('insufficient_data'); // a producer outage must NOT read as chronic-neutral
  });

  it('research_routing evidence is excluded from the denominator', () => {
    const routed = Array.from({ length: 10 }, (_, i) => snap('strengthening', 'research_routing', i + 1));
    const r = classifySignalChronicNeutral(routed, NOW);
    expect(r.observedCount).toBe(0);
    expect(r.verdict).toBe('insufficient_data');
  });

  it('snapshots older than the window are excluded', () => {
    const stale = Array.from({ length: 10 }, (_, i) => snap('neutral', 'thesis_observe', 50 + i));
    const r = classifySignalChronicNeutral(stale, NOW);
    expect(r.observedCount).toBe(0);
    expect(r.verdict).toBe('insufficient_data');
  });

  it('mixes real tracking with gap-fill: only tracking counts', () => {
    const snaps = [...tracking(8, 'neutral', 'thesis_observe'), ...Array.from({ length: 5 }, (_, i) => snap('neutral', 'daily_synthesis', i + 9))];
    const r = classifySignalChronicNeutral(snaps, NOW);
    expect(r.observedCount).toBe(8);
    expect(r.verdict).toBe('chronic_neutral');
  });

  it('legacy thesis_monitor counts as a tracking source', () => {
    const r = classifySignalChronicNeutral(tracking(10, 'neutral', 'thesis_monitor'), NOW);
    expect(r.observedCount).toBe(10);
    expect(r.verdict).toBe('chronic_neutral');
  });
});

describe('isChronicFlag', () => {
  it('flags chronic_neutral and low_information only', () => {
    expect(isChronicFlag('chronic_neutral')).toBe(true);
    expect(isChronicFlag('low_information')).toBe(true);
    expect(isChronicFlag('discriminating')).toBe(false);
    expect(isChronicFlag('insufficient_data')).toBe(false);
    expect(isChronicFlag('excluded_collector')).toBe(false);
  });
});

describe('isMaterialMove', () => {
  it('sparse series (unpriced name) → null', () => {
    expect(isMaterialMove([px(5, 100)], NOW, 0.4)).toBeNull();
    expect(isMaterialMove([], NOW, 0.4)).toBeNull();
  });

  it('small move below the floor → null', () => {
    expect(isMaterialMove([px(28, 100), px(1, 105)], NOW, 0.2)).toBeNull(); // +5% < 15%
  });

  it('low-vol name: the 15% floor binds → material', () => {
    const m = isMaterialMove([px(28, 100), px(1, 116)], NOW, 0.15)!; // windowσ≈0.052, 2σ≈0.10 < floor
    expect(m).not.toBeNull();
    expect(m.threshold).toBeCloseTo(0.15, 5);
    expect(m.magnitudePct).toBeCloseTo(0.16, 5);
    expect(m.changePct).toBeGreaterThan(0);
  });

  it('high-vol name: needs more than the floor (sigma binds)', () => {
    // rv20 0.80 → windowσ≈0.276 → 2σ≈0.552. A 40% move is NOT material; a 65% move is.
    expect(isMaterialMove([px(28, 100), px(1, 140)], NOW, 0.8)).toBeNull();
    const big = isMaterialMove([px(28, 100), px(1, 165)], NOW, 0.8)!;
    expect(big).not.toBeNull();
    expect(big.threshold).toBeGreaterThan(0.5);
  });

  it('down move: negative changePct, extreme anchored at the displaced point', () => {
    const m = isMaterialMove([px(28, 100), px(14, 90), px(1, 65)], NOW, 0.45)!; // −35% > 31% threshold
    expect(m.changePct).toBeLessThan(0);
    expect(m.magnitudePct).toBeCloseTo(0.35, 5);
    expect(m.moveDate.getTime()).toBe(daysAgo(1).getTime());
  });

  it('silent drawdown that recovers is still flagged (extreme, not net) — the HLIT case', () => {
    // 100 → trough 75 (−25%) → recovers to 98 (net only −2%). Extreme is the trough.
    const m = isMaterialMove([px(28, 100), px(14, 75), px(1, 98)], NOW, 0.2)!;
    expect(m).not.toBeNull();
    expect(m.changePct).toBeCloseTo(-0.25, 5); // the trough, not the −2% net
    expect(m.moveDate.getTime()).toBe(daysAgo(14).getTime());
    expect(m.spanDays).toBe(14);
  });
});

describe('hasFlagWithin', () => {
  const moveDate = daysAgo(10);
  it('flag exactly on the move date → true', () => {
    expect(hasFlagWithin([daysAgo(10)], moveDate)).toBe(true);
  });
  it('flag 7 days off → true (inclusive), 8 days off → false', () => {
    expect(hasFlagWithin([daysAgo(3)], moveDate)).toBe(true); // 7d before
    expect(hasFlagWithin([daysAgo(2)], moveDate)).toBe(false); // 8d before
  });
  it('no flags → false', () => {
    expect(hasFlagWithin([], moveDate)).toBe(false);
  });
});

describe('detectPriceCoverageGap', () => {
  const series = [px(28, 100), px(14, 92), px(1, 80)]; // −20%

  it('material move, no signal flagged → a gap', () => {
    const gap = detectPriceCoverageGap(series, NOW, 0.2, [], 'GLW')!;
    expect(gap).not.toBeNull();
    expect(gap.kind).toBe('price');
    expect(gap.flaggedWithin).toBe(false);
    expect(gap.changePct).toBeLessThan(0);
    expect(gap.detail).toContain('GLW');
    expect(gap.detail).toContain('−20%');
    expect(gap.detail).toContain('no signal flagged');
  });

  it('material move BUT a signal flagged it in-window → no gap (the system worked)', () => {
    const flagNearExtreme = [daysAgo(1)]; // extreme is the 1-day-ago point
    expect(detectPriceCoverageGap(series, NOW, 0.2, flagNearExtreme, 'GLW')).toBeNull();
  });

  it('immaterial move → no gap', () => {
    expect(detectPriceCoverageGap([px(28, 100), px(1, 104)], NOW, 0.2, [], 'GLW')).toBeNull();
  });

  it('macro kind is carried through', () => {
    const gap = detectPriceCoverageGap(series, NOW, 0.2, [], 'AI Infra (exposure-weighted)', 'price_macro')!;
    expect(gap.kind).toBe('price_macro');
  });
});
