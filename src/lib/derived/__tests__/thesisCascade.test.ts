import { describe, it, expect } from 'vitest';
import {
  deriveAssetThesisStatus,
  deriveMacroThesisStatus,
  CASCADE_ELIGIBLE,
} from '../thesisCascadeRules';

describe('deriveAssetThesisStatus', () => {
  it('promotes developing → monitoring when an active strategy is attached', () => {
    expect(deriveAssetThesisStatus({ current: 'developing', activeStrategyCount: 1 })).toBe('monitoring');
  });

  it('keeps monitoring while at least one strategy is active', () => {
    expect(deriveAssetThesisStatus({ current: 'monitoring', activeStrategyCount: 2 })).toBe('monitoring');
  });

  it('closes a monitoring thesis when its last active strategy goes flat', () => {
    expect(deriveAssetThesisStatus({ current: 'monitoring', activeStrategyCount: 0 })).toBe('closed');
  });

  it('re-expresses a closed thesis (closed → monitoring) when a strategy goes active again', () => {
    expect(deriveAssetThesisStatus({ current: 'closed', activeStrategyCount: 1 })).toBe('monitoring');
  });

  it('keeps a closed thesis closed while it has no active strategy', () => {
    expect(deriveAssetThesisStatus({ current: 'closed', activeStrategyCount: 0 })).toBe('closed');
  });

  it('leaves a never-expressed developing thesis developing (no active strategy)', () => {
    // The key conservatism: a developing thesis with no active strategy has never
    // been live (it would already be monitoring otherwise), so it stays building —
    // it is NOT closed. Avoids mass-closing legacy developing theses on first run.
    expect(deriveAssetThesisStatus({ current: 'developing', activeStrategyCount: 0 })).toBe('developing');
  });

  it('does not treat a draft strategy as live expression (draft has no positions)', () => {
    // activeStrategyCount counts only status === 'active'; a draft-only thesis reads
    // as 0 active and stays developing.
    expect(deriveAssetThesisStatus({ current: 'developing', activeStrategyCount: 0 })).toBe('developing');
  });

  it('returns null (leave unchanged) for non-cascade-eligible statuses', () => {
    for (const s of ['draft', 'active', 'complete', 'rejected']) {
      expect(deriveAssetThesisStatus({ current: s, activeStrategyCount: 5 })).toBeNull();
    }
  });
});

describe('deriveMacroThesisStatus', () => {
  it('promotes developing → monitoring when any linked asset is monitoring', () => {
    expect(deriveMacroThesisStatus({ current: 'developing', anyLinkedAssetMonitoring: true })).toBe('monitoring');
  });

  it('a single live linked asset is enough to flip the macro to monitoring', () => {
    expect(deriveMacroThesisStatus({ current: 'developing', anyLinkedAssetMonitoring: true })).toBe('monitoring');
  });

  it('closes a monitoring macro when no linked asset is live anymore', () => {
    expect(deriveMacroThesisStatus({ current: 'monitoring', anyLinkedAssetMonitoring: false })).toBe('closed');
  });

  it('re-expresses a closed macro (closed → monitoring) when a linked asset goes live', () => {
    expect(deriveMacroThesisStatus({ current: 'closed', anyLinkedAssetMonitoring: true })).toBe('monitoring');
  });

  it('keeps a closed macro closed while no linked asset is live', () => {
    expect(deriveMacroThesisStatus({ current: 'closed', anyLinkedAssetMonitoring: false })).toBe('closed');
  });

  it('leaves a developing macro developing when no linked asset is live (e.g. pure top-down belief)', () => {
    expect(deriveMacroThesisStatus({ current: 'developing', anyLinkedAssetMonitoring: false })).toBe('developing');
  });

  it('returns null (leave unchanged) for non-cascade-eligible statuses', () => {
    for (const s of ['draft', 'active', 'complete', 'rejected']) {
      expect(deriveMacroThesisStatus({ current: s, anyLinkedAssetMonitoring: true })).toBeNull();
    }
  });
});

describe('CASCADE_ELIGIBLE', () => {
  it('is exactly the lifecycle-managed set', () => {
    expect([...CASCADE_ELIGIBLE].sort()).toEqual(['closed', 'developing', 'monitoring']);
  });
});
