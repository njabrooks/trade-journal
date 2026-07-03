import { describe, it, expect } from 'vitest';
import {
  computeSizingFindings,
  UNDER_PCT,
  OVER_PCT,
  type SizingInputs,
  type AssetThesisExposureInput,
  type MacroThesisExposureInput,
} from '../sizingCoherence';

const NAV = 1_000_000;

const asset = (over: Partial<AssetThesisExposureInput> = {}): AssetThesisExposureInput => ({
  thesisId: 'a1',
  title: 'Asset thesis',
  ticker: 'AAA',
  confidenceLevel: 'medium',
  direction: 'bullish',
  expressionUsd: 50_000,
  ...over,
});

const macro = (over: Partial<MacroThesisExposureInput> = {}): MacroThesisExposureInput => ({
  thesisId: 'm1',
  title: 'Macro thesis',
  confidenceLevel: 'medium',
  direction: 'bullish',
  linkedAssetThesisIds: [],
  ...over,
});

const inputs = (over: Partial<SizingInputs> = {}): SizingInputs => ({
  navUsd: NAV,
  assetTheses: [],
  macroTheses: [],
  ...over,
});

describe('computeSizingFindings — guards', () => {
  it('returns [] when NAV is zero, negative, or non-finite', () => {
    for (const nav of [0, -100, NaN, Infinity]) {
      expect(computeSizingFindings(inputs({ navUsd: nav, assetTheses: [asset()] }))).toEqual([]);
    }
  });

  it('returns [] for an empty thesis set', () => {
    expect(computeSizingFindings(inputs())).toEqual([]);
  });
});

describe('under_expressed', () => {
  it('flags a high-conviction asset thesis below the threshold', () => {
    // 1% of NAV < UNDER_PCT (2%)
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'high', expressionUsd: 10_000 })] })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: 'under_expressed',
      thesisId: 'a1',
      thesisType: 'asset',
      convictionLevel: 'high',
      expressionPct: 1,
      navUsd: NAV,
    });
  });

  it('flags a high-conviction thesis with ZERO expression', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'high', expressionUsd: 0 })] })
    );
    expect(findings.map((f) => f.kind)).toEqual(['under_expressed']);
    expect(findings[0].expressionPct).toBe(0);
  });

  it('does NOT flag at exactly the threshold (strict <)', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'high', expressionUsd: (UNDER_PCT / 100) * NAV })] })
    );
    expect(findings).toEqual([]);
  });

  it('does not flag medium conviction regardless of size', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'medium', expressionUsd: 0 })] })
    );
    expect(findings).toEqual([]);
  });

  it('flags a high-conviction thesis expressed the WRONG WAY (direction-aware)', () => {
    // Bullish thesis, net short $100k — 10% of NAV in magnitude but aligned = -10%.
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'high', direction: 'bullish', expressionUsd: -100_000 })] })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('under_expressed');
    expect(findings[0].note).toContain('AGAINST');
    // expressionPct stays the honest market-value magnitude
    expect(findings[0].expressionPct).toBe(10);
  });

  it('a bearish thesis expressed net short is correctly aligned (no finding)', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'high', direction: 'bearish', expressionUsd: -100_000 })] })
    );
    expect(findings).toEqual([]);
  });
});

describe('over_expressed', () => {
  it('flags a low-conviction thesis above the threshold', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'low', expressionUsd: 100_000 })] })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'over_expressed', expressionPct: 10 });
  });

  it('flags exploratory conviction above the threshold', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'exploratory', expressionUsd: 90_000 })] })
    );
    expect(findings.map((f) => f.kind)).toEqual(['over_expressed']);
  });

  it('does NOT flag at exactly the threshold (strict >)', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'low', expressionUsd: (OVER_PCT / 100) * NAV })] })
    );
    expect(findings).toEqual([]);
  });

  it('uses magnitude for shorts — a large low-conviction short is over-expressed', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: 'low', direction: 'bearish', expressionUsd: -100_000 })] })
    );
    expect(findings.map((f) => f.kind)).toEqual(['over_expressed']);
  });

  it('skips theses with unknown confidence levels', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ confidenceLevel: null, expressionUsd: 500_000 })] })
    );
    expect(findings).toEqual([]);
  });
});

describe('macro full-credit exposure view', () => {
  it('sums |asset nets| across linked assets and applies the same rules', () => {
    const findings = computeSizingFindings(
      inputs({
        assetTheses: [
          asset({ thesisId: 'a1', confidenceLevel: 'medium', expressionUsd: 60_000 }),
          asset({ thesisId: 'a2', ticker: 'BBB', confidenceLevel: 'medium', expressionUsd: -50_000 }),
        ],
        macroTheses: [
          macro({ confidenceLevel: 'low', linkedAssetThesisIds: ['a1', 'a2'] }),
        ],
      })
    );
    // 110k full-credit magnitude = 11% of NAV > OVER_PCT on low conviction
    const over = findings.filter((f) => f.kind === 'over_expressed');
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ thesisType: 'macro', thesisId: 'm1', expressionPct: 11 });
    expect(over[0].note).toContain('full-credit exposure view');
  });

  it('a high-conviction macro with no expressed linked assets is under-expressed', () => {
    const findings = computeSizingFindings(
      inputs({
        assetTheses: [asset({ thesisId: 'a1', expressionUsd: 0, confidenceLevel: 'medium' })],
        macroTheses: [macro({ confidenceLevel: 'high', linkedAssetThesisIds: ['a1'] })],
      })
    );
    expect(findings.filter((f) => f.thesisType === 'macro').map((f) => f.kind)).toEqual([
      'under_expressed',
    ]);
  });
});

describe('concentration line', () => {
  it('emits one concentration finding for the top cluster with actual vs deserved shares', () => {
    const findings = computeSizingFindings(
      inputs({
        assetTheses: [
          // clustered under the crypto macro
          asset({ thesisId: 'btc', ticker: 'BTC', confidenceLevel: 'high', expressionUsd: 300_000 }),
          // unclustered standalone asset thesis — its own cluster
          asset({ thesisId: 'glw', ticker: 'GLW', confidenceLevel: 'high', expressionUsd: 100_000 }),
        ],
        macroTheses: [macro({ thesisId: 'crypto', title: 'Crypto adoption', confidenceLevel: 'high', linkedAssetThesisIds: ['btc'] })],
      })
    );
    const conc = findings.filter((f) => f.kind === 'concentration');
    expect(conc).toHaveLength(1);
    // top cluster = crypto macro (300k of 400k expressed = 75%); equal conviction → deserves 50%
    expect(conc[0].thesisId).toBe('crypto');
    expect(conc[0].note).toContain('75%');
    expect(conc[0].note).toContain('50%');
    expect(conc[0].expressionPct).toBe(30); // 300k / 1M NAV
  });

  it('clustered assets are not double-counted as their own cluster', () => {
    const findings = computeSizingFindings(
      inputs({
        assetTheses: [
          asset({ thesisId: 'a1', confidenceLevel: 'medium', expressionUsd: 200_000 }),
          asset({ thesisId: 'a2', ticker: 'BBB', confidenceLevel: 'medium', expressionUsd: 100_000 }),
        ],
        macroTheses: [macro({ linkedAssetThesisIds: ['a1', 'a2'] })],
      })
    );
    // Only one cluster (the macro subsumes both assets) → no concentration line
    expect(findings.filter((f) => f.kind === 'concentration')).toEqual([]);
  });

  it('no concentration line with fewer than two expressed clusters', () => {
    const findings = computeSizingFindings(
      inputs({ assetTheses: [asset({ expressionUsd: 100_000 })] })
    );
    expect(findings.filter((f) => f.kind === 'concentration')).toEqual([]);
  });

  it('conviction weighting: an exploratory top cluster deserves the smallest share', () => {
    const findings = computeSizingFindings(
      inputs({
        assetTheses: [
          asset({ thesisId: 'a1', confidenceLevel: 'exploratory', expressionUsd: 300_000 }),
          asset({ thesisId: 'a2', ticker: 'BBB', confidenceLevel: 'high', expressionUsd: 100_000 }),
        ],
      })
    );
    const conc = findings.find((f) => f.kind === 'concentration');
    expect(conc).toBeDefined();
    // weights: exploratory 0.5 vs high 3 → deserved = 0.5/3.5 ≈ 14.29%
    expect(conc!.note).toContain('14.29%');
  });
});

describe('ordering', () => {
  it('orders under_expressed, then over_expressed, then concentration', () => {
    const findings = computeSizingFindings(
      inputs({
        assetTheses: [
          asset({ thesisId: 'a1', confidenceLevel: 'low', expressionUsd: 300_000 }),
          asset({ thesisId: 'a2', ticker: 'BBB', confidenceLevel: 'high', expressionUsd: 5_000 }),
        ],
      })
    );
    expect(findings.map((f) => f.kind)).toEqual([
      'under_expressed',
      'over_expressed',
      'concentration',
    ]);
  });
});
