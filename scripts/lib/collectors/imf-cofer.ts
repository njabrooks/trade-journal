/**
 * IMF COFER (Currency Composition of Official Foreign Exchange Reserves) collector.
 *
 * Fetches USD share of global allocated foreign exchange reserves from the IMF SDMX API.
 * Data is quarterly, updated ~3 months after quarter-end. No API key required.
 *
 * As of Dec 2025, IMF revised COFER to eliminate the "unallocated" portion — all data
 * back to 2000-Q1 now reflects 100% of world reserves with imputed shares for non-reporters.
 *
 * explicit_details shape:
 * {
 *   dataSource: "imf_cofer",
 *   metric: "usd_share_pct",         // USD share of total allocated reserves (%)
 *   threshold: 62.0,                 // e.g., if USD share rises above 62%, invalidates bearish thesis
 *   thresholdUnit: "% of reserves",
 *   thresholdDirection: "above" | "below",  // "above" triggers when observed >= threshold
 *   checkFrequency: "weekly",
 *   label: "USD Share of Global Reserves"
 * }
 */

export interface IMFCoferSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface CoferObservation {
  period: string;   // e.g. "2025-Q3"
  value: number;    // e.g. 56.92
}

const BASE_URL = 'https://api.imf.org/external/sdmx/2.1/data/IMF.STA,COFER,7.0.1';

/**
 * Parse SDMX-ML XML response to extract observations.
 * Uses regex — the Obs elements follow a strict pattern, no XML library needed.
 */
function parseObservations(xml: string): CoferObservation[] {
  const observations: CoferObservation[] = [];
  const obsRegex = /TIME_PERIOD="([^"]+)"[^>]*OBS_VALUE="([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = obsRegex.exec(xml)) !== null) {
    const period = match[1];
    const value = parseFloat(match[2]);
    if (!isNaN(value)) {
      observations.push({ period, value });
    }
  }

  return observations.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Convert a quarter period like "2025-Q3" to a Date (end of quarter).
 */
function quarterToDate(period: string): Date {
  const [year, q] = period.split('-Q');
  const quarterEndMonth = parseInt(q) * 3; // Q1→3, Q2→6, Q3→9, Q4→12
  return new Date(Date.UTC(parseInt(year), quarterEndMonth - 1, 28)); // ~end of quarter
}

/**
 * Fetch COFER data for a specific currency and date range.
 * Default: USD share of allocated reserves (%).
 */
async function fetchCoferData(
  startYear: number,
  endYear: number,
  currency: string = 'CI_USD'
): Promise<CoferObservation[]> {
  // G001 = World, AFXRA = Allocated FX reserves, SHRO_PT = Shares (percent), Q = Quarterly
  const url = `${BASE_URL}/G001.AFXRA.${currency}.SHRO_PT.Q?startPeriod=${startYear}&endPeriod=${endYear}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TradeJournal-SignalCollector/1.0' },
  });

  if (!res.ok) {
    console.warn(`  IMF COFER API failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const xml = await res.text();
  return parseObservations(xml);
}

export async function collectIMFCofer(
  explicitDetails: Record<string, unknown>
): Promise<IMFCoferSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const label = (explicitDetails.label as string) || 'USD Share of Global Reserves';
  const direction = (explicitDetails.thresholdDirection as string) || 'above';

  // Fetch 5 years of data for trend context
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;

  const observations = await fetchCoferData(startYear, currentYear);

  if (observations.length === 0) {
    console.warn('  IMF COFER: no observations returned');
    return null;
  }

  const latest = observations[observations.length - 1];
  const observedValue = latest.value;

  // Build evidence summary with trend context
  const summaryParts: string[] = [label];
  summaryParts.push(`Latest: ${observedValue.toFixed(2)}% (${latest.period})`);

  // Year-over-year comparison
  const latestDate = quarterToDate(latest.period);
  const targetYearAgo = new Date(latestDate);
  targetYearAgo.setFullYear(targetYearAgo.getFullYear() - 1);

  const yearAgo = observations.find(o => {
    const d = quarterToDate(o.period);
    return Math.abs(d.getTime() - targetYearAgo.getTime()) < 120 * 24 * 60 * 60 * 1000;
  });

  if (yearAgo) {
    const change = observedValue - yearAgo.value;
    summaryParts.push(
      `Year ago: ${yearAgo.value.toFixed(2)}% (${yearAgo.period})`,
      `YoY: ${change >= 0 ? '+' : ''}${change.toFixed(2)}pp`
    );
  }

  // Multi-year trend (one per year)
  const yearlyValues: string[] = [];
  const seenYears = new Set<string>();
  for (const obs of observations) {
    const year = obs.period.split('-')[0];
    // Take Q4 or latest available per year
    if (!seenYears.has(year) || obs.period.includes('Q4')) {
      seenYears.add(year);
      // Only keep the latest entry per year (overwrite)
      const idx = yearlyValues.findIndex(v => v.startsWith(year));
      const entry = `${year}: ${obs.value.toFixed(1)}%`;
      if (idx >= 0) yearlyValues[idx] = entry;
      else yearlyValues.push(entry);
    }
  }
  if (yearlyValues.length >= 3) {
    summaryParts.push(`Trend: ${yearlyValues.join(' → ')}`);
  }

  // Calculate pctToThreshold with direction awareness
  let pct: number;
  if (direction === 'below') {
    // Triggers when observed FALLS TO threshold
    pct = observedValue > 0 ? (threshold / observedValue) * 100 : 0;
  } else {
    // Triggers when observed RISES TO threshold (default)
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  return {
    observedValue: Math.round(observedValue * 1000) / 1000,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || '% of reserves',
    evidenceSummary: summaryParts.join(' | '),
  };
}

/**
 * Fetch full historical COFER data for backfill purposes.
 * Returns all quarterly observations from startYear to present.
 */
export async function fetchCoferHistorical(
  startYear: number = 2000,
  currency: string = 'CI_USD'
): Promise<CoferObservation[]> {
  return fetchCoferData(startYear, new Date().getFullYear(), currency);
}
