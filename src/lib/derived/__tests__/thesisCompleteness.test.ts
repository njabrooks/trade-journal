import { describe, it, expect } from 'vitest';
import { thesisCompleteness, isResearchGap, COMPLETE_CLAIM_TARGET } from '../thesisCompletenessRules';

describe('thesisCompleteness', () => {
  it('scores 0 and band gap for a thesis with nothing', () => {
    const r = thesisCompleteness({ claimCount: 0, hasDigest: false, digestConfidence: null });
    expect(r.score).toBe(0);
    expect(r.band).toBe('gap');
    expect(r.reasons).toContain('no linked claims');
    expect(r.reasons).toContain('no digest');
  });

  it('treats 0 claims as a gap even with a digest', () => {
    const r = thesisCompleteness({ claimCount: 0, hasDigest: true, digestConfidence: 'high' });
    expect(r.band).toBe('gap');
  });

  it('scores an adequately-researched thesis high', () => {
    const r = thesisCompleteness({ claimCount: 5, hasDigest: true, digestConfidence: 'high' });
    expect(r.score).toBe(100); // 60 + 15 + 25
    expect(r.band).toBe('adequate');
    expect(r.reasons).toEqual([]);
  });

  it('flags a few-claims thesis as thin', () => {
    const r = thesisCompleteness({ claimCount: 2, hasDigest: true, digestConfidence: 'medium' });
    expect(r.band).toBe('thin');
    expect(r.reasons).toContain('few linked claims (2)');
  });

  it('notes a low-confidence digest as a reason', () => {
    const r = thesisCompleteness({ claimCount: 4, hasDigest: true, digestConfidence: 'low' });
    expect(r.reasons).toContain('low-confidence digest');
  });

  it('caps the claim dimension at COMPLETE_CLAIM_TARGET', () => {
    const few = thesisCompleteness({ claimCount: COMPLETE_CLAIM_TARGET, hasDigest: false, digestConfidence: null });
    const many = thesisCompleteness({ claimCount: 50, hasDigest: false, digestConfidence: null });
    expect(few.score).toBe(many.score);
  });
});

describe('isResearchGap', () => {
  it('is a gap for monitoring theses that are not adequate', () => {
    expect(isResearchGap('monitoring', 'gap')).toBe(true);
    expect(isResearchGap('monitoring', 'thin')).toBe(true);
    expect(isResearchGap('monitoring', 'adequate')).toBe(false);
  });

  it('is never a gap for non-monitoring theses (developing still building, etc.)', () => {
    for (const s of ['developing', 'closed', 'draft', 'complete', 'rejected']) {
      expect(isResearchGap(s, 'gap')).toBe(false);
    }
  });
});
