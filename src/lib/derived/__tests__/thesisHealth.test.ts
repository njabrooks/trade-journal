import { describe, it, expect } from 'vitest';
import { thesisHealthDue, isWeakening, THESIS_HEALTH_FLOOR_DAYS } from '../thesisHealthRules';

const asOf = new Date('2026-06-18T00:00:00Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);

describe('thesisHealthDue', () => {
  it('is not due when the thesis has no active signals', () => {
    expect(thesisHealthDue({ hasActiveSignals: false, lastHealthCheck: daysAgo(30), hasNewEvidenceSince: true, asOf })).toBe(false);
  });

  it('is due when never health-checked (baseline)', () => {
    expect(thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: null, hasNewEvidenceSince: false, asOf })).toBe(true);
  });

  it('is due when new evidence arrived since the last check (on-evidence trigger)', () => {
    expect(thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: daysAgo(1), hasNewEvidenceSince: true, asOf })).toBe(true);
  });

  it('is NOT due when recently checked and no new evidence (no "still fine" churn)', () => {
    expect(thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: daysAgo(1), hasNewEvidenceSince: false, asOf })).toBe(false);
  });

  it('is due on the weekly floor even with no new evidence', () => {
    expect(thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: daysAgo(THESIS_HEALTH_FLOOR_DAYS), hasNewEvidenceSince: false, asOf })).toBe(true);
  });

  it('honours a custom floor', () => {
    expect(thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: daysAgo(20), hasNewEvidenceSince: false, asOf, floorDays: 30 })).toBe(false);
    expect(thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: daysAgo(31), hasNewEvidenceSince: false, asOf, floorDays: 30 })).toBe(true);
  });
});

describe('isWeakening', () => {
  it('flags weakening and invalidated as decision-worthy', () => {
    expect(isWeakening('weakening')).toBe(true);
    expect(isWeakening('invalidated')).toBe(true);
  });
  it('does not flag healthy verdicts', () => {
    for (const a of ['neutral', 'strengthening', 'confirmed']) expect(isWeakening(a)).toBe(false);
  });
});
