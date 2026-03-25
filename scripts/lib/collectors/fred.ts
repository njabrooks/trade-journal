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

  // Fetch 5 years of history for trend context and trailing calculations
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

      // Historical YoY growth rates for trend context (annual snapshots)
      const yoyHistory: string[] = [];
      for (let yr = 1; yr <= 4 && observations.length > yr * 12 + 12; yr++) {
        const laterObs = observations.find(o => {
          const d = new Date(o.date);
          const target = new Date(latest.date);
          target.setFullYear(target.getFullYear() - yr);
          return Math.abs(d.getTime() - target.getTime()) < 45 * 24 * 60 * 60 * 1000;
        });
        const earlierObs = observations.find(o => {
          const d = new Date(o.date);
          const target = new Date(latest.date);
          target.setFullYear(target.getFullYear() - yr - 1);
          return Math.abs(d.getTime() - target.getTime()) < 45 * 24 * 60 * 60 * 1000;
        });
        if (laterObs && earlierObs) {
          const histGrowth = ((laterObs.value - earlierObs.value) / earlierObs.value) * 100;
          const yearLabel = new Date(laterObs.date).getFullYear();
          yoyHistory.push(`${yearLabel}: ${histGrowth >= 0 ? '+' : ''}${histGrowth.toFixed(1)}%`);
        }
      }
      if (yoyHistory.length >= 2) {
        yoyHistory.push(`Now: ${observedValue >= 0 ? '+' : ''}${observedValue.toFixed(1)}%`);
        summaryParts.push(`YoY history: ${yoyHistory.join(' → ')}`);
      }
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
    case 'trailing_12m_sum': {
      // Sum the most recent 12 observations (for monthly series = trailing 12-month cumulative)
      if (observations.length < 12) {
        console.warn(`  FRED: need 12+ observations for trailing 12m on ${seriesId}`);
        return null;
      }
      const t12m = observations.slice(0, 12).reduce((sum, o) => sum + o.value, 0);
      observedValue = t12m;
      summaryParts.push(
        `T12M cumulative: ${formatValue(t12m, seriesId)} (${observations[11].date} to ${latest.date})`
      );

      // Prior year T12M for YoY comparison
      if (observations.length >= 24) {
        const t12mPrior = observations.slice(12, 24).reduce((sum, o) => sum + o.value, 0);
        const yoyChange = t12m - t12mPrior;
        summaryParts.push(
          `Prior T12M: ${formatValue(t12mPrior, seriesId)}`,
          `YoY change: ${yoyChange >= 0 ? '+' : ''}${formatValue(yoyChange, seriesId)}`
        );
      }

      // 3-year and 5-year T12M history for trend context
      const historicalT12ms: Array<{ date: string; value: number }> = [];
      for (let offset = 0; offset + 12 <= observations.length && historicalT12ms.length < 5; offset += 12) {
        const sum = observations.slice(offset, offset + 12).reduce((s, o) => s + o.value, 0);
        historicalT12ms.push({ date: observations[offset].date, value: sum });
      }
      if (historicalT12ms.length >= 2) {
        const trend = historicalT12ms.reverse().map(h =>
          `${h.date.slice(0, 7)}: ${formatValue(h.value, seriesId)}`
        ).join(' → ');
        summaryParts.push(`Annual trend: ${trend}`);
      }
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

      // 5-year history for level metrics
      const yearlyLevels: string[] = [];
      const seenYears = new Set<string>();
      for (const obs of observations) {
        const year = obs.date.slice(0, 4);
        if (!seenYears.has(year) && yearlyLevels.length < 5) {
          seenYears.add(year);
          yearlyLevels.push(`${year}: ${formatValue(obs.value, seriesId)}`);
        }
      }
      if (yearlyLevels.length >= 3) {
        summaryParts.push(`History: ${yearlyLevels.reverse().join(' → ')}`);
      }
      break;
    }
  }

  // Calculate pctToThreshold with direction awareness
  // pct approaches 100% as the observed value approaches the threshold
  let pct: number;
  if (direction === 'below') {
    // Triggers when observed FALLS TO threshold from above
    // E.g., M2 growth at 4.9%, threshold 2% → pct = 2/4.9 * 100 = 41%
    // E.g., Fed BS at $6.66T, threshold $6T → pct = 6/6.66 * 100 = 90%
    if (observedValue > 0 && threshold > 0) {
      pct = (threshold / observedValue) * 100;
    } else if (observedValue < 0 && threshold < 0) {
      // Both negative (e.g., deficit): triggers when deficit improves (becomes less negative)
      // Deficit at -1.6T, threshold -1.0T → deficit needs to improve from -1.6T to -1.0T
      // pct = how far we've progressed from "very negative" toward "less negative threshold"
      // Use absolute values: |threshold| / |observed| = 1.0/1.6 = 62.5%
      pct = (Math.abs(threshold) / Math.abs(observedValue)) * 100;
    } else {
      pct = 0;
    }
  } else {
    // Triggers when observed RISES TO threshold (default)
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
