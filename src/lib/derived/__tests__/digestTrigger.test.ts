import { describe, it, expect } from 'vitest';
import { needsDigestRefresh, DIGEST_REFRESH_DELTA_K } from '../digestTriggerRules';

const base = {
  status: 'developing',
  currentClaimCount: 0,
  claimsCountAtLastArticulation: 0,
  hasArticulation: false,
};

describe('needsDigestRefresh', () => {
  it('triggers the first digest once a developing thesis crosses K claims', () => {
    expect(needsDigestRefresh({ ...base, currentClaimCount: 3 })).toBe(true);
  });

  it('does not trigger the first digest below K claims', () => {
    expect(needsDigestRefresh({ ...base, currentClaimCount: 2 })).toBe(false);
  });

  it('triggers a refresh when K new claims have accrued since the last articulation', () => {
    expect(
      needsDigestRefresh({ status: 'developing', currentClaimCount: 8, claimsCountAtLastArticulation: 5, hasArticulation: true }),
    ).toBe(true);
  });

  it('does not refresh when fewer than K new claims have accrued', () => {
    expect(
      needsDigestRefresh({ status: 'developing', currentClaimCount: 7, claimsCountAtLastArticulation: 5, hasArticulation: true }),
    ).toBe(false);
  });

  it('does not refresh when claims were unlinked (negative delta)', () => {
    expect(
      needsDigestRefresh({ status: 'developing', currentClaimCount: 4, claimsCountAtLastArticulation: 6, hasArticulation: true }),
    ).toBe(false);
  });

  it('never triggers with zero claims, even articulated', () => {
    expect(
      needsDigestRefresh({ status: 'developing', currentClaimCount: 0, claimsCountAtLastArticulation: 0, hasArticulation: true }),
    ).toBe(false);
  });

  it('is scoped to developing — monitoring/closed/draft never auto-refresh in B4', () => {
    for (const status of ['monitoring', 'closed', 'draft', 'complete', 'rejected']) {
      expect(needsDigestRefresh({ ...base, status, currentClaimCount: 20, hasArticulation: true })).toBe(false);
    }
  });

  it('honours a custom K', () => {
    expect(needsDigestRefresh({ ...base, currentClaimCount: 2, k: 2 })).toBe(true);
    expect(needsDigestRefresh({ ...base, currentClaimCount: 1, k: 2 })).toBe(false);
  });

  it('defaults K to 3', () => {
    expect(DIGEST_REFRESH_DELTA_K).toBe(3);
  });
});
