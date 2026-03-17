/**
 * CoinGecko data collector for signal tracking.
 * Fetches market cap, price, and other token metrics.
 */

export interface CoinGeckoSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
}

/**
 * Fetch CoinGecko coin data and extract the metric specified in explicit_details.
 */
export async function collectCoinGecko(
  explicitDetails: Record<string, unknown>
): Promise<CoinGeckoSnapshot | null> {
  const endpoint = explicitDetails.endpoint as string | undefined;
  if (!endpoint) return null;

  const res = await fetch(endpoint);
  if (!res.ok) {
    console.warn(`  CoinGecko fetch failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json() as Record<string, unknown>;
  const metric = explicitDetails.metric as string;
  const threshold = explicitDetails.threshold as number;

  let value: number | null = null;

  // Navigate nested paths like "market_data.market_cap.usd"
  const parts = metric.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      current = null;
      break;
    }
  }

  if (typeof current === 'number') {
    value = current;
  }

  if (value === null) return null;

  const pct = threshold > 0 ? (value / threshold) * 100 : 0;

  return {
    observedValue: value,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || 'USD',
  };
}
