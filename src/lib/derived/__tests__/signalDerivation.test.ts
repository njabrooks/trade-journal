import { describe, it, expect } from 'vitest';
import { signalDerivationAction } from '../signalDerivationRules';

describe('signalDerivationAction', () => {
  it('derives for a monitoring thesis with claims and no signals', () => {
    expect(signalDerivationAction({ status: 'monitoring', activeSignalCount: 0, claimCount: 5 })).toBe('derive');
  });

  it('flags thin when a monitoring thesis has no claims to ground signals (research gap)', () => {
    expect(signalDerivationAction({ status: 'monitoring', activeSignalCount: 0, claimCount: 0 })).toBe('thin');
  });

  it('skips a monitoring thesis that already has active signals (refresh is the health pass)', () => {
    expect(signalDerivationAction({ status: 'monitoring', activeSignalCount: 3, claimCount: 9 })).toBe('skip');
  });

  it('skips non-monitoring theses regardless of claims/signals', () => {
    for (const status of ['developing', 'closed', 'draft', 'complete', 'rejected']) {
      expect(signalDerivationAction({ status, activeSignalCount: 0, claimCount: 10 })).toBe('skip');
    }
  });
});
