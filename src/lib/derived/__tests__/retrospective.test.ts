import { describe, it, expect } from 'vitest';
import { needsRetrospective, RETROSPECTIVE_STATUSES } from '../retrospectiveRules';

describe('needsRetrospective', () => {
  it('triggers for resolved theses without a retrospective', () => {
    for (const status of ['closed', 'complete', 'rejected']) {
      expect(needsRetrospective({ status, hasRetrospective: false })).toBe(true);
    }
  });

  it('does not re-trigger once a retrospective exists', () => {
    expect(needsRetrospective({ status: 'closed', hasRetrospective: true })).toBe(false);
  });

  it('does not trigger for live/building theses', () => {
    for (const status of ['developing', 'monitoring', 'draft']) {
      expect(needsRetrospective({ status, hasRetrospective: false })).toBe(false);
    }
  });

  it('RETROSPECTIVE_STATUSES is exactly the resolved set', () => {
    expect([...RETROSPECTIVE_STATUSES].sort()).toEqual(['closed', 'complete', 'rejected']);
  });
});
