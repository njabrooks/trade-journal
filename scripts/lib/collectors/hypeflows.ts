/**
 * HypeFlows data collector for signal tracking.
 * Uses the existing hypeflows client to fetch market share data.
 */

import { hypeflows } from '../hypeflows.js';

export interface HypeFlowsSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
}

/**
 * Fetch HypeFlows market share data for signal tracking.
 */
export async function collectHypeFlows(
  explicitDetails: Record<string, unknown>
): Promise<HypeFlowsSnapshot | null> {
  const metric = explicitDetails.metric as string;
  const threshold = explicitDetails.threshold as number;

  const snapshot = await hypeflows.getLatestSnapshot();
  if (!snapshot) return null;

  let value: number | null = null;

  if (metric === 'market_share_pct') {
    value = snapshot.marketSharePct;
  }

  if (value === null) return null;

  const pct = threshold > 0 ? (value / threshold) * 100 : 0;

  return {
    observedValue: value,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || '%',
  };
}
