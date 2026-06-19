import { describe, it, expect } from 'vitest';
import { decideStrategyThesisAction, inferThesisDirection } from '../strategyThesisLinkRules';

const base = {
  alreadyLinked: false,
  isStablecoin: false,
  hasThesisOnCanonical: false,
  canonicalAssetClass: 'STK' as string | null,
  unresolvedProxy: false,
};

describe('decideStrategyThesisAction', () => {
  it('skips an already-linked strategy', () => {
    expect(decideStrategyThesisAction({ ...base, alreadyLinked: true })).toBe('skip');
  });

  it('skips stablecoins/cash', () => {
    expect(decideStrategyThesisAction({ ...base, isStablecoin: true })).toBe('skip');
  });

  it('links when a thesis exists on the canonical underlying (e.g. IBIT→BTC)', () => {
    expect(decideStrategyThesisAction({ ...base, canonicalAssetClass: 'CRYPTO', hasThesisOnCanonical: true })).toBe('link');
  });

  it('creates a placeholder for a direct underlying with no thesis (NEAR, NBIS)', () => {
    expect(decideStrategyThesisAction({ ...base, canonicalAssetClass: 'PERP' })).toBe('create_placeholder');
    expect(decideStrategyThesisAction({ ...base, canonicalAssetClass: 'STK' })).toBe('create_placeholder');
  });

  it('flags an unresolved option/proxy with no parent (PURR)', () => {
    expect(decideStrategyThesisAction({ ...base, canonicalAssetClass: 'OPT' })).toBe('flag');
  });

  it('flags an explicitly unresolved proxy regardless of asset class', () => {
    expect(decideStrategyThesisAction({ ...base, canonicalAssetClass: 'STK', unresolvedProxy: true })).toBe('flag');
  });

  it('prefers link over flag when a thesis already exists', () => {
    expect(decideStrategyThesisAction({ ...base, canonicalAssetClass: 'OPT', hasThesisOnCanonical: true })).toBe('link');
  });
});

describe('inferThesisDirection', () => {
  it('maps net long → bullish, net short → bearish, flat → neutral', () => {
    expect(inferThesisDirection(10)).toBe('bullish');
    expect(inferThesisDirection(-5)).toBe('bearish');
    expect(inferThesisDirection(0)).toBe('neutral');
  });
});
