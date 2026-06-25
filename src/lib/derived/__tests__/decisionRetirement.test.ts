import { describe, it, expect } from 'vitest';
import {
  provenanceKey,
  isPacketIncorporated,
  RETIRABLE_ON_REUNDERWRITE,
} from '../decisionRetirement';

describe('provenanceKey', () => {
  it('builds a composite key when both parts are present', () => {
    expect(provenanceKey('insight-A', 'claim-2')).toBe('insight-A::claim-2');
  });

  it('returns null when either part is missing (no partial keys)', () => {
    expect(provenanceKey('insight-A', null)).toBeNull();
    expect(provenanceKey(null, 'claim-2')).toBeNull();
    expect(provenanceKey(undefined, undefined)).toBeNull();
    expect(provenanceKey('insight-A', '')).toBeNull();
  });
});

describe('isPacketIncorporated', () => {
  const keys = new Set([provenanceKey('insight-A', 'claim-2')!]);

  it('retires a refuting packet whose claim was incorporated', () => {
    expect(isPacketIncorporated('review_refuting_claim', 'insight-A', 'claim-2', keys)).toBe(true);
  });

  it('retires a confirm-link packet whose claim was incorporated', () => {
    expect(isPacketIncorporated('confirm_claim_link', 'insight-A', 'claim-2', keys)).toBe(true);
  });

  // The load-bearing guard: source_claim_id ("claim-2") is a per-insight ordinal, so the
  // SAME ordinal under a DIFFERENT insight must NOT cross-match.
  it('does NOT retire a same-ordinal claim from a different insight', () => {
    expect(isPacketIncorporated('review_refuting_claim', 'insight-B', 'claim-2', keys)).toBe(false);
  });

  it('does NOT retire a non-retirable decision type, even with a matching key', () => {
    expect(isPacketIncorporated('re_underwrite_due', 'insight-A', 'claim-2', keys)).toBe(false);
    expect(isPacketIncorporated('develop_thin_thesis', 'insight-A', 'claim-2', keys)).toBe(false);
  });

  it('does NOT retire when provenance is incomplete (partial key never matches)', () => {
    expect(isPacketIncorporated('review_refuting_claim', 'insight-A', null, keys)).toBe(false);
    expect(isPacketIncorporated('review_refuting_claim', null, 'claim-2', keys)).toBe(false);
  });

  it('does NOT retire a claim that was linked but not incorporated (absent from used keys)', () => {
    expect(isPacketIncorporated('review_refuting_claim', 'insight-A', 'claim-9', keys)).toBe(false);
  });

  it('does NOT retire when decision type is null/undefined', () => {
    expect(isPacketIncorporated(null, 'insight-A', 'claim-2', keys)).toBe(false);
    expect(isPacketIncorporated(undefined, 'insight-A', 'claim-2', keys)).toBe(false);
  });
});

describe('RETIRABLE_ON_REUNDERWRITE', () => {
  it('covers exactly the relate-research claim-link decision types', () => {
    expect([...RETIRABLE_ON_REUNDERWRITE].sort()).toEqual([
      'confirm_claim_link',
      'review_refuting_claim',
    ]);
  });
});
