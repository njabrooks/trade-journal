/**
 * FRED (Federal Reserve Economic Data) collector for signal tracking.
 *
 * Fetches economic time series from the FRED API and calculates derived metrics
 * like YoY growth rates, levels, and changes.
 *
 * Requires FRED_API_KEY in environment.
 *
 * explicit_details shape (single metric):
 * {
 *   dataSource: "fred",
 *   seriesId: "M2SL",
 *   metric: "yoy_growth" | "level" | "mom_change" | "yoy_change",
 *   threshold: 5.0,           // e.g., 5% YoY growth
 *   thresholdUnit: "% YoY",
 *   thresholdDirection: "above" | "below",  // "above" triggers when observed >= threshold
 *   checkFrequency: "weekly",
 *   label: "M2 Money Supply"  // for evidence summary
 * }
 *
 * Can also be used as a condition within a multi-condition signal:
 * {
 *   dataSource: "fred",
 *   seriesId: "WALCL",
 *   metric: "level",
 *   threshold: 7000000,       // $7T in millions
 *   thresholdUnit: "USD millions",
 *   label: "Fed Balance Sheet"
 * }
 */

export interface FredSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface FredObservation {
  date: string;
  value: string;  // FRED returns values as strings, "." for missing
}

interface FredApiResponse {
  realtime_start: string;
  realtime_end: string;
  observation_start: string;
  observation_end: string;
  units: string;
  count: number;
  observations: FredObservation[];
}

const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

export async function collectFred(
  explicitDetails: Record<string, unknown>
): Promise<FredSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const seriesId = explicitDetails.seriesId as string;
  if (!seriesId) {
    console.warn('  FRED: no seriesId provided');
    return null;
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('  FRED: no FRED_API_KEY in environment');
    return null;
  }

  const metric = (explicitDetails.metric as string) || 'level';
  const label = (explicitDetails.label as string) || seriesId;
  const direction = (explicitDetails.thresholdDirection as string) || 'above';

  // Fetch enough history for YoY calculations (18 months back)
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `${BASE_URL}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=desc`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TradeJournal-SignalCollector/1.0' },
  });

  if (!res.ok) {
    console.warn(`  FRED API failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json() as FredApiResponse;
  const observations = json.observations
    .filter(o => o.value !== '.')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }));

  if (observations.length === 0) {
    console.warn(`  FRED: no valid observations for ${seriesId}`);
    return null;
  }

  const latest = observations[0];
  let observedValue: number;
  const summaryParts: string[] = [`${label} (${seriesId})`];

  switch (metric) {
    case 'yoy_growth': {
      // Find observation ~12 months ago
      const targetDate = new Date(latest.date);
      targetDate.setFullYear(targetDate.getFullYear() - 1);
      const yearAgo = findClosestObservation(observations, targetDate);

      if (!yearAgo) {
        console.warn(`  FRED: insufficient history for YoY calculation on ${seriesId}`);
        return null;
      }

      observedValue = ((latest.value - yearAgo.value) / yearAgo.value) * 100;
      summaryParts.push(
        `Latest: ${formatValue(latest.value, seriesId)} (${latest.date})`,
        `Year ago: ${formatValue(yearAgo.value, seriesId)} (${yearAgo.date})`,
        `YoY growth: ${observedValue >= 0 ? '+' : ''}${observedValue.toFixed(2)}%`
      );
      break;
    }
    case 'mom_change': {
      if (observations.length < 2) {
        console.warn(`  FRED: need 2+ observations for MoM on ${seriesId}`);
        return null;
      }
      const prior = observations[1];
      observedValue = latest.value - prior.value;
      summaryParts.push(
        `Latest: ${formatValue(latest.value, seriesId)} (${latest.date})`,
        `Prior: ${formatValue(prior.value, seriesId)} (${prior.date})`,
        `MoM change: ${observedValue >= 0 ? '+' : ''}${formatValue(observedValue, seriesId)}`
      );
      break;
    }
    case 'yoy_change': {
      const targetDate2 = new Date(latest.date);
      targetDate2.setFullYear(targetDate2.getFullYear() - 1);
      const yearAgo2 = findClosestObservation(observations, targetDate2);

      if (!yearAgo2) {
        console.warn(`  FRED: insufficient history for YoY change on ${seriesId}`);
        return null;
      }

      observedValue = latest.value - yearAgo2.value;
      summaryParts.push(
        `Latest: ${formatValue(latest.value, seriesId)} (${latest.date})`,
        `Year ago: ${formatValue(yearAgo2.value, seriesId)} (${yearAgo2.date})`,
        `YoY change: ${observedValue >= 0 ? '+' : ''}${formatValue(observedValue, seriesId)}`
      );
      break;
    }
    case 'level':
    default: {
      observedValue = latest.value;
      summaryParts.push(
        `Latest: ${formatValue(latest.value, seriesId)} (${latest.date})`
      );

      // Add recent trend if enough data
      if (observations.length >= 3) {
        const threeAgo = observations[Math.min(2, observations.length - 1)];
        const recentChange = latest.value - threeAgo.value;
        summaryParts.push(
          `Recent trend: ${recentChange >= 0 ? '+' : ''}${formatValue(recentChange, seriesId)} since ${threeAgo.date}`
        );
      }
      break;
    }
  }

  // Calculate pctToThreshold with direction awareness
  let pct: number;
  if (direction === 'below') {
    // Triggers when observed FALLS TO threshold (e.g., deficit falls below 3%)
    pct = observedValue > 0 ? (threshold / observedValue) * 100 : 0;
  } else {
    // Triggers when observed RISES TO threshold (e.g., M2 growth exceeds 5%)
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  return {
    observedValue: Math.round(observedValue * 1000) / 1000,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || json.units || '',
    evidenceSummary: summaryParts.join(' | '),
  };
}

function findClosestObservation(
  observations: Array<{ date: string; value: number }>,
  targetDate: Date
): { date: string; value: number } | null {
  const targetStr = targetDate.toISOString().split('T')[0];
  let closest: { date: string; value: number } | null = null;
  let closestDiff = Infinity;

  for (const obs of observations) {
    const diff = Math.abs(new Date(obs.date).getTime() - targetDate.getTime());
    // Allow up to 45 days tolerance for monthly series
    if (diff < closestDiff && diff < 45 * 24 * 60 * 60 * 1000) {
      closest = obs;
      closestDiff = diff;
    }
  }

  return closest;
}

function formatValue(val: number, seriesId: string): string {
  // Series measured in billions/millions (M2SL is in billions, WALCL in millions)
  const abs = Math.abs(val);
  if (['M2SL', 'M2NS'].includes(seriesId)) {
    // M2SL is in billions
    return `$${(val / 1000).toFixed(2)}T`;
  }
  if (['WALCL'].includes(seriesId)) {
    // WALCL is in millions
    return `$${(val / 1000000).toFixed(2)}T`;
  }
  if (abs >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(val / 1000).toFixed(1)}K`;
  if (abs < 10) return val.toFixed(2);
  return val.toFixed(0);
}
