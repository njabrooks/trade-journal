import { describe, it, expect } from 'vitest';
import { needsExposureClassification, DEFAULT_EXPOSURE_BAR_USD } from '../exposureClassificationRules';

const base = {
  isPlaceholder: true,
  status: 'monitoring',
  notionalUsd: 5000,
  alreadyClassified: false,
};

describe('needsExposureClassification', () => {
  it('flags a sizeable unclassified placeholder', () => {
    expect(needsExposureClassification(base)).toBe(true);
  });
  it('ignores non-placeholders (real theses)', () => {
    expect(needsExposureClassification({ ...base, isPlaceholder: false })).toBe(false);
  });
  it('does not re-ask once classified (any status)', () => {
    expect(needsExposureClassification({ ...base, alreadyClassified: true })).toBe(false);
  });
  it('respects the size bar — small/dust exposures do not spawn a decision', () => {
    expect(needsExposureClassification({ ...base, notionalUsd: DEFAULT_EXPOSURE_BAR_USD - 1 })).toBe(false);
    expect(needsExposureClassification({ ...base, notionalUsd: DEFAULT_EXPOSURE_BAR_USD })).toBe(true);
  });
  it('is sign-agnostic (a large short exposure counts)', () => {
    expect(needsExposureClassification({ ...base, notionalUsd: -8000 })).toBe(true);
  });
  it('honours a custom size bar', () => {
    expect(needsExposureClassification({ ...base, notionalUsd: 3000, minNotionalUsd: 5000 })).toBe(false);
  });
  it('only applies to developing/monitoring', () => {
    expect(needsExposureClassification({ ...base, status: 'closed' })).toBe(false);
    expect(needsExposureClassification({ ...base, status: 'rejected' })).toBe(false);
  });
});
