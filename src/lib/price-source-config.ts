/**
 * Per-Source Price Delivery Configuration
 *
 * Shared between:
 *   - scripts/check-price-gaps.ts (standalone GitHub Actions checker)
 *   - src/app/api/dashboard/accounting/price-gaps/route.ts (dashboard API)
 *
 * Each price source has a known delivery cadence and lag. This config
 * lets us ask "is each source delivering on schedule?" rather than
 * computing a single blunt freshness percentage.
 */

export type PriceSourceId = 'ibkr' | 'fx_rate' | 'massive' | 'snapshot' | 'proxy';
export type SourceStatus = 'healthy' | 'delayed' | 'down';

export interface PriceSourceConfig {
  id: PriceSourceId;
  label: string;
  /** Does this source deliver on business days only, or every day? */
  deliveryDays: 'business_days' | 'every_day';
  /** T+0 = same-day prices, T+1 = yesterday's prices arrive today */
  normalLagDays: number;
  /** How many missed delivery cycles before the source is considered DOWN */
  downThresholdMissedCycles: number;
}

export const PRICE_SOURCE_CONFIGS: PriceSourceConfig[] = [
  {
    id: 'ibkr',
    label: 'IBKR (Equities & Derivatives)',
    deliveryDays: 'business_days',
    normalLagDays: 1,
    downThresholdMissedCycles: 2,
  },
  {
    id: 'fx_rate',
    label: 'FX Rates (IBKR)',
    deliveryDays: 'business_days',
    normalLagDays: 1,
    downThresholdMissedCycles: 2,
  },
  {
    id: 'massive',
    label: 'Massive (Crypto Daily)',
    deliveryDays: 'every_day',
    normalLagDays: 1,
    downThresholdMissedCycles: 2,
  },
  {
    id: 'snapshot',
    label: 'Exchange Snapshots',
    deliveryDays: 'every_day',
    normalLagDays: 0,
    downThresholdMissedCycles: 3,
  },
  // Stablecoins (manual source, hardcoded $1.00) are excluded from monitoring —
  // there's no delivery pipeline that can be late for a hardcoded value.
  {
    id: 'proxy',
    label: 'Proxy (Follows Target)',
    deliveryDays: 'every_day',
    normalLagDays: 1,
    downThresholdMissedCycles: 3,
  },
];

/**
 * SQL CASE expression that assigns each asset to its primary price source.
 * Used in both the standalone script and API route.
 */
export const ASSET_SOURCE_CASE_SQL = `
  CASE
    WHEN a.pricing_tier = 'proxy' THEN 'proxy'
    WHEN a.asset_class = 'FIAT' THEN 'fx_rate'
    WHEN a.asset_class IN ('EQUITY', 'DERIVATIVE', 'ETF', 'BOND') THEN 'ibkr'
    WHEN a.asset_class IN ('CRYPTO', 'PERP') AND a.pricing_tier = 'market' THEN 'massive'
    ELSE 'snapshot'
  END
`;

// --- Business day helpers ---

export function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

/** Walk backwards from `date` to find the most recent business day (inclusive). */
function previousBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (!isBusinessDay(d)) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

/** Count business days between two dates (start exclusive, end inclusive). */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d <= end) {
    if (isBusinessDay(d)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * What's the latest price date this source should have delivered by now?
 *
 * For T+1 business-day sources (IBKR, FX): on Monday morning, the expected
 * date is Friday. On Tuesday morning, the expected date is Monday.
 *
 * For T+0 daily sources (snapshot, manual): expected date is today.
 * For T+1 daily sources (massive, proxy): expected date is yesterday.
 */
export function expectedLatestPriceDate(source: PriceSourceConfig, now: Date): string {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const target = new Date(today);
  target.setUTCDate(target.getUTCDate() - source.normalLagDays);

  if (source.deliveryDays === 'business_days') {
    return previousBusinessDay(target).toISOString().slice(0, 10);
  }
  return target.toISOString().slice(0, 10);
}

/**
 * Determine a source's health by comparing actual vs expected delivery.
 *
 * - healthy: latest delivery >= expected date
 * - delayed: behind by fewer cycles than the down threshold
 * - down: behind by >= downThresholdMissedCycles
 */
export function assessSourceHealth(
  source: PriceSourceConfig,
  latestDeliveryDate: string | null,
  now: Date,
): SourceStatus {
  if (!latestDeliveryDate) return 'down';

  const expected = expectedLatestPriceDate(source, now);
  if (latestDeliveryDate >= expected) return 'healthy';

  // Count how many delivery cycles we've missed
  const latestDate = new Date(latestDeliveryDate + 'T00:00:00Z');
  const expectedDate = new Date(expected + 'T00:00:00Z');

  let missedCycles: number;
  if (source.deliveryDays === 'business_days') {
    missedCycles = businessDaysBetween(latestDate, expectedDate);
  } else {
    missedCycles = Math.round((expectedDate.getTime() - latestDate.getTime()) / (86400 * 1000));
  }

  return missedCycles >= source.downThresholdMissedCycles ? 'down' : 'delayed';
}

// --- Types for health check results ---

export interface SourceHealthResult {
  sourceId: PriceSourceId;
  label: string;
  status: SourceStatus;
  assetCount: number;
  latestDeliveryDate: string | null;
  expectedDate: string;
  problemAssets: Array<{
    ticker: string;
    assetClass: string;
    lastPriceDate: string | null;
    gapDays: number | null;
  }>;
}

export interface PriceDeliveryReport {
  checkedAt: string;
  totalMonitored: number;
  overallStatus: SourceStatus;
  sources: SourceHealthResult[];
  /** Backwards-compatible: % of assets with price within 1 day */
  freshness: number;
}
