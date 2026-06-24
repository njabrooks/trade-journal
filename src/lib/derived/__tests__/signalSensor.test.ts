import { describe, it, expect } from 'vitest';
import {
  parseSensor,
  hasSensor,
  isVestigialExplicitDetails,
  isDecisionGradeSensor,
  resolveSensorCarryForward,
  classifySensorSource,
  describeSensor,
} from '../signalSensor';

// The three real production explicit_details shapes (sampled 2026-06-24).
const PRICE_LADDER = {
  ticker: 'BTC',
  signalKind: 'strategy_price_ladder',
  tvLayoutId: 'Fyx6k9NR',
  targets: [
    { label: 'TP1 40%', level: 1, price: 150000, conditionType: 'price_above' },
    { label: 'TP2 40%', level: 2, price: 200000, conditionType: 'price_above' },
    { label: 'TP3 20%', level: 3, price: 500000, conditionType: 'price_above' },
  ],
};

const FRED_THRESHOLD = {
  dataSource: 'fred',
  checkFrequency: 'weekly',
  conditions: [
    { label: 'Communication Construction', metric: 'yoy_growth', seriesId: 'TLCMUCONS', threshold: -5, dataSource: 'fred', thresholdDirection: 'below' },
    { label: 'Power Construction', metric: 'yoy_growth', seriesId: 'TLPWRCONS', threshold: -5, dataSource: 'fred', thresholdDirection: 'below' },
  ],
};

const NEWS_QUALITATIVE = {
  dataSource: 'news_qualitative',
  checkFrequency: 'weekly',
  monitorContext: 'Watch for any major hyperscaler cutting AI capex guidance…',
  monitorKeywords: ['hyperscaler capex cut', 'AI writedown', 'metaverse moment'],
};

const FLAT_THRESHOLD = { dataSource: 'imf_cofer', metric: 'usd_share_pct', operator: 'below', threshold: 57, checkFrequency: 'monthly' };
const DEPENDENCY = { dataSource: 'internal_db', metric: 'status_or_confidence' };
const DERIVED_METRIC = { dataSource: 'derived', metric: 'implied_valuation_per_mw', operator: 'above', threshold: 15 };

describe('parseSensor — kind detection', () => {
  it('detects a price ladder and its levels', () => {
    const s = parseSensor(PRICE_LADDER, 'data_driven');
    expect(s.kind).toBe('price_ladder');
    expect(s.thresholds).toEqual([150000, 200000, 500000]);
    expect(s.hasThreshold).toBe(true);
    expect(s.sourceClass).toBe('market_price');
    expect(s.metrics[0]).toContain('BTC');
  });

  it('detects a multi-condition FRED threshold collector', () => {
    const s = parseSensor(FRED_THRESHOLD, 'data_driven');
    expect(s.kind).toBe('threshold');
    expect(s.metrics).toEqual(['yoy_growth', 'yoy_growth']);
    expect(s.thresholds).toEqual([-5, -5]);
    expect(s.dataSource).toBe('fred');
    expect(s.sourceClass).toBe('macro_aggregate');
  });

  it('detects a flat metric+threshold collector', () => {
    const s = parseSensor(FLAT_THRESHOLD, 'data_driven');
    expect(s.kind).toBe('threshold');
    expect(s.metrics).toEqual(['usd_share_pct']);
    expect(s.thresholds).toEqual([57]);
    expect(s.sourceClass).toBe('reserve_flow');
  });

  it('classifies a parent-thesis dependency edge, not a metric sensor', () => {
    const s = parseSensor(DEPENDENCY, 'data_driven');
    expect(s.kind).toBe('dependency');
    expect(isDecisionGradeSensor(s)).toBe(false);
  });

  it('treats news_qualitative keyword config as NO real sensor', () => {
    const s = parseSensor(NEWS_QUALITATIVE, 'judgment');
    expect(s.kind).toBe('none');
    expect(s.sourceClass).toBe('qualitative');
  });

  it('treats a derived metric with a numeric threshold as a REAL sensor (not vestigial)', () => {
    const s = parseSensor(DERIVED_METRIC, 'judgment');
    expect(s.kind).toBe('threshold');
    expect(s.sourceClass).toBe('derived');
    expect(s.metrics).toEqual(['implied_valuation_per_mw']);
    expect(s.thresholds).toEqual([15]);
    expect(isVestigialExplicitDetails(DERIVED_METRIC, 'judgment')).toBe(false);
  });

  it('returns kind none for null / declared-but-unconfigured details', () => {
    expect(parseSensor(null, 'data_driven').kind).toBe('none');
    expect(parseSensor(undefined).kind).toBe('none');
    expect(parseSensor({}, 'data_driven').kind).toBe('none');
  });
});

describe('hasSensor / isVestigialExplicitDetails', () => {
  it('hasSensor true for real sensors, false for qualitative/empty', () => {
    expect(hasSensor(PRICE_LADDER)).toBe(true);
    expect(hasSensor(FRED_THRESHOLD)).toBe(true);
    expect(hasSensor(DEPENDENCY)).toBe(true);
    expect(hasSensor(NEWS_QUALITATIVE)).toBe(false);
    expect(hasSensor(null)).toBe(false);
  });

  it('flags vestigial explicit_details (present but no real sensor) — the chronic-neutral exclusion bug', () => {
    // news_qualitative blob is non-null so isCollectorTracked excludes it from chronic-neutral,
    // yet it is qualitative. That is exactly what triage must clear.
    expect(isVestigialExplicitDetails(NEWS_QUALITATIVE, 'judgment')).toBe(true);
    // Real sensors are NOT vestigial.
    expect(isVestigialExplicitDetails(PRICE_LADDER, 'data_driven')).toBe(false);
    expect(isVestigialExplicitDetails(FRED_THRESHOLD, 'data_driven')).toBe(false);
    // Null details are not "vestigial" (nothing present to clear).
    expect(isVestigialExplicitDetails(null)).toBe(false);
  });
});

describe('isDecisionGradeSensor', () => {
  it('price ladders and thresholded collectors are decision-grade', () => {
    expect(isDecisionGradeSensor(parseSensor(PRICE_LADDER))).toBe(true);
    expect(isDecisionGradeSensor(parseSensor(FRED_THRESHOLD))).toBe(true);
    expect(isDecisionGradeSensor(parseSensor(FLAT_THRESHOLD))).toBe(true);
  });
  it('qualitative / dependency are not decision-grade', () => {
    expect(isDecisionGradeSensor(parseSensor(NEWS_QUALITATIVE))).toBe(false);
    expect(isDecisionGradeSensor(parseSensor(DEPENDENCY))).toBe(false);
  });
});

describe('classifySensorSource', () => {
  it('maps the known live data sources to their classes', () => {
    expect(classifySensorSource('fred')).toBe('macro_aggregate');
    expect(classifySensorSource('fred:power_construction')).toBe('macro_aggregate');
    expect(classifySensorSource('imf_cofer')).toBe('reserve_flow');
    expect(classifySensorSource('worldbank')).toBe('reserve_flow');
    expect(classifySensorSource('sec_edgar_capex')).toBe('filing');
    expect(classifySensorSource('tsmc_revenue')).toBe('revenue');
    expect(classifySensorSource('defillama_stablecoins')).toBe('onchain');
    expect(classifySensorSource('price_feed')).toBe('market_price');
    expect(classifySensorSource('tradingview_cdp')).toBe('market_price');
    expect(classifySensorSource('internal_db')).toBe('internal');
    expect(classifySensorSource('derived')).toBe('derived');
    expect(classifySensorSource('news_qualitative')).toBe('qualitative');
    expect(classifySensorSource(null)).toBe('unknown');
  });
});

describe('resolveSensorCarryForward — sensor survives statement iteration', () => {
  it('carries a real sensor forward with data_driven category', () => {
    const carried = resolveSensorCarryForward({ explicitDetails: FRED_THRESHOLD, category: 'data_driven' });
    expect(carried).not.toBeNull();
    expect(carried!.category).toBe('data_driven');
    expect(carried!.explicitDetails).toBe(FRED_THRESHOLD); // copied untouched
  });

  it('carries a price ladder forward', () => {
    expect(resolveSensorCarryForward({ explicitDetails: PRICE_LADDER, category: 'data_driven' })).not.toBeNull();
  });

  it('does NOT carry vestigial qualitative details forward (drops to statement-only)', () => {
    expect(resolveSensorCarryForward({ explicitDetails: NEWS_QUALITATIVE, category: 'judgment' })).toBeNull();
  });

  it('returns null when there is no prior signal', () => {
    expect(resolveSensorCarryForward(null)).toBeNull();
  });
});

describe('describeSensor', () => {
  it('renders each kind', () => {
    expect(describeSensor(parseSensor(PRICE_LADDER))).toContain('price ladder');
    expect(describeSensor(parseSensor(FRED_THRESHOLD))).toContain('threshold');
    expect(describeSensor(parseSensor(DEPENDENCY))).toContain('dependency');
    expect(describeSensor(parseSensor(NEWS_QUALITATIVE))).toContain('no real sensor');
    expect(describeSensor(parseSensor(null))).toContain('statement-only');
  });
});
