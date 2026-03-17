/**
 * DefiLlama data collector for signal tracking.
 * Fetches protocol fees/revenue data and calculates annualized metrics.
 */

export interface DefiLlamaSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
}

/**
 * Fetch DefiLlama fees data and calculate the metric specified in explicit_details.
 */
export async function collectDefiLlama(
  explicitDetails: Record<string, unknown>
): Promise<DefiLlamaSnapshot | null> {
  const endpoint = explicitDetails.endpoint as string | undefined;
  if (!endpoint) return null;

  const res = await fetch(endpoint);
  if (!res.ok) {
    console.warn(`  DefiLlama fetch failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json() as Record<string, unknown>;
  const metric = explicitDetails.metric as string;
  const calculation = explicitDetails.calculation as string | undefined;
  const threshold = explicitDetails.threshold as number;

  let value: number | null = null;

  // Extract the raw metric value
  if (metric === 'total30d') {
    value = data.total30d as number;
  } else if (metric === 'total24h') {
    value = data.total24h as number;
  } else if (metric === 'total7d') {
    value = data.total7d as number;
  }

  if (value === null) return null;

  // Apply calculation
  if (calculation === 'total30d * 12') {
    value = value * 12;
  }

  const pct = threshold > 0 ? (value / threshold) * 100 : 0;

  return {
    observedValue: value,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || 'USD',
  };
}
