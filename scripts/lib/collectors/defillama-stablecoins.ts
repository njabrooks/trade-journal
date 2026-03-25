/**
 * DeFiLlama Stablecoins collector for signal tracking.
 *
 * Fetches total stablecoin supply from the DeFiLlama stablecoins API.
 * Free, no auth, hourly updates, daily granularity back to 2017.
 *
 * explicit_details shape:
 * {
 *   dataSource: "defillama_stablecoins",
 *   metric: "total_supply" | "peggedUSD_supply",
 *   threshold: 250000000000,     // $250B
 *   thresholdUnit: "USD",
 *   thresholdDirection: "below", // invalidation: triggers when supply falls to threshold
 *   checkFrequency: "daily"
 * }
 *
 * API: https://stablecoins.llama.fi/stablecoincharts/all
 * Returns daily data points with totalCirculatingUSD by peg type.
 */

export interface DefiLlamaStablecoinsSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface StablecoinDataPoint {
  date: string; // Unix timestamp as string
  totalCirculating: Record<string, number>;
  totalCirculatingUSD: Record<string, number>;
}

const API_URL = 'https://stablecoins.llama.fi/stablecoincharts/all';

export async function collectDefiLlamaStablecoins(
  explicitDetails: Record<string, unknown>
): Promise<DefiLlamaStablecoinsSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const metric = (explicitDetails.metric as string) || 'total_supply';
  const direction = (explicitDetails.thresholdDirection as string) || 'below';

  const res = await fetch(API_URL, {
    headers: { 'User-Agent': 'TradeJournal-SignalCollector/1.0' },
  });

  if (!res.ok) {
    console.warn(`  DeFiLlama Stablecoins API failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json() as StablecoinDataPoint[];
  if (!data || data.length === 0) {
    console.warn('  DeFiLlama Stablecoins: no data returned');
    return null;
  }

  // Get latest and historical data points
  const latest = data[data.length - 1];
  const latestDate = new Date(parseInt(latest.date) * 1000);

  let observedValue: number;
  const circUSD = latest.totalCirculatingUSD || latest.totalCirculating;

  switch (metric) {
    case 'peggedUSD_supply':
      observedValue = circUSD.peggedUSD || 0;
      break;
    case 'total_supply':
    default:
      observedValue = Object.values(circUSD).reduce((sum, v) => sum + v, 0);
      break;
  }

  // Calculate pctToThreshold with direction awareness
  let pct: number;
  if (direction === 'below') {
    pct = observedValue > 0 ? (threshold / observedValue) * 100 : 0;
  } else {
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  // Build evidence summary with historical context
  const summaryParts: string[] = [
    `Stablecoin total supply: $${(observedValue / 1e9).toFixed(1)}B (${latestDate.toISOString().split('T')[0]})`,
  ];

  // Top peg breakdown
  const pegEntries = Object.entries(circUSD)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const breakdown = pegEntries.map(([peg, val]) =>
    `${peg.replace('pegged', '')}: $${(val / 1e9).toFixed(1)}B`
  ).join(', ');
  summaryParts.push(`Breakdown: ${breakdown}`);

  // Historical trend — find data points at 1m, 3m, 6m, 12m, 24m ago
  const intervals = [
    { label: '1m', days: 30 },
    { label: '3m', days: 90 },
    { label: '6m', days: 180 },
    { label: '1y', days: 365 },
    { label: '2y', days: 730 },
  ];

  const latestTs = parseInt(latest.date);
  const trendParts: string[] = [];

  for (const interval of intervals) {
    const targetTs = latestTs - (interval.days * 86400);
    // Find closest data point
    let closest: StablecoinDataPoint | null = null;
    let closestDiff = Infinity;
    for (const d of data) {
      const diff = Math.abs(parseInt(d.date) - targetTs);
      if (diff < closestDiff && diff < 7 * 86400) { // within 7 days
        closest = d;
        closestDiff = diff;
      }
    }
    if (closest) {
      const histCirc = closest.totalCirculatingUSD || closest.totalCirculating;
      const histValue = metric === 'peggedUSD_supply'
        ? (histCirc.peggedUSD || 0)
        : Object.values(histCirc).reduce((sum, v) => sum + v, 0);
      const change = ((observedValue - histValue) / histValue) * 100;
      trendParts.push(`${interval.label}: $${(histValue / 1e9).toFixed(0)}B (${change >= 0 ? '+' : ''}${change.toFixed(1)}%)`);
    }
  }

  if (trendParts.length > 0) {
    summaryParts.push(`History: ${trendParts.join(' | ')}`);
  }

  // 30-day trend direction
  const thirtyDaysAgoTs = latestTs - (30 * 86400);
  const monthAgoPoint = data.find(d => Math.abs(parseInt(d.date) - thirtyDaysAgoTs) < 3 * 86400);
  if (monthAgoPoint) {
    const monthAgoCirc = monthAgoPoint.totalCirculatingUSD || monthAgoPoint.totalCirculating;
    const monthAgoValue = metric === 'peggedUSD_supply'
      ? (monthAgoCirc.peggedUSD || 0)
      : Object.values(monthAgoCirc).reduce((sum, v) => sum + v, 0);
    const monthChange = observedValue - monthAgoValue;
    const arrow = monthChange > 1e9 ? '↑' : monthChange < -1e9 ? '↓' : '→';
    summaryParts.push(`30d trend: ${arrow} ${monthChange >= 0 ? '+' : ''}$${(monthChange / 1e9).toFixed(1)}B`);
  }

  return {
    observedValue: Math.round(observedValue),
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || 'USD',
    evidenceSummary: summaryParts.join(' | '),
  };
}
