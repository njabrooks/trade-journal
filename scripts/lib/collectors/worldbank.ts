/**
 * World Bank Military Expenditure collector for signal tracking.
 *
 * Fetches defense spending as % of GDP from the World Bank API (sourced from SIPRI).
 * Tracks multiple countries in a single request. Data updates annually (~February).
 *
 * explicit_details shape:
 * {
 *   dataSource: "worldbank",
 *   metric: "military_expenditure_gdp_pct",
 *   countries: ["JPN", "DEU", "USA", "AUS", "GBR"],
 *   threshold: 2.0,       // % of GDP level that would trigger (e.g., decline below 2.0%)
 *   thresholdUnit: "% GDP",
 *   operator: "aggregate_avg" | "country_min" | "country_specific",
 *   targetCountry: "DEU",  // only used when operator is "country_specific"
 *   checkFrequency: "weekly"
 * }
 *
 * Operators:
 * - "aggregate_avg": average across all countries (good for "is spending broadly rising?")
 * - "country_min": minimum across all countries (good for "is any country backsliding?")
 * - "country_specific": single country value (good for tracking Germany or Japan specifically)
 */

export interface WorldBankSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface WorldBankRecord {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

type WorldBankResponse = [
  { page: number; pages: number; per_page: number; total: number; lastupdated: string },
  WorldBankRecord[]
];

const INDICATOR = 'MS.MIL.XPND.GD.ZS'; // Military expenditure (% of GDP)

export async function collectWorldBank(
  explicitDetails: Record<string, unknown>
): Promise<WorldBankSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const countries = (explicitDetails.countries as string[]) || ['JPN', 'DEU', 'USA', 'AUS', 'GBR'];
  const operator = (explicitDetails.operator as string) || 'aggregate_avg';
  const targetCountry = (explicitDetails.targetCountry as string) || '';

  // Fetch last 5 years to show trend
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const countryCodes = countries.join(';').toLowerCase();

  const url = `https://api.worldbank.org/v2/country/${countryCodes}/indicator/${INDICATOR}?format=json&date=${startYear}:${currentYear}&per_page=200`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TradeJournal-SignalCollector/1.0' },
  });

  if (!res.ok) {
    console.warn(`  World Bank API failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json() as WorldBankResponse;
  if (!json[1] || json[1].length === 0) {
    console.warn('  World Bank API: no data returned');
    return null;
  }

  const records = json[1].filter(r => r.value !== null);
  const metadata = json[0];

  // Group by country, find most recent year for each
  const latestByCountry = new Map<string, { value: number; year: string; name: string }>();
  for (const r of records) {
    const existing = latestByCountry.get(r.countryiso3code);
    if (!existing || r.date > existing.year) {
      latestByCountry.set(r.countryiso3code, {
        value: r.value!,
        year: r.date,
        name: r.country.value,
      });
    }
  }

  if (latestByCountry.size === 0) {
    console.warn('  World Bank: no country data found');
    return null;
  }

  // Calculate observed value based on operator
  let observedValue: number;
  const countryValues = Array.from(latestByCountry.entries());

  switch (operator) {
    case 'country_min':
      observedValue = Math.min(...countryValues.map(([, v]) => v.value));
      break;
    case 'country_specific': {
      const target = latestByCountry.get(targetCountry.toUpperCase());
      if (!target) {
        console.warn(`  World Bank: no data for target country ${targetCountry}`);
        return null;
      }
      observedValue = target.value;
      break;
    }
    case 'aggregate_avg':
    default:
      observedValue = countryValues.reduce((sum, [, v]) => sum + v.value, 0) / countryValues.length;
      break;
  }

  // thresholdDirection controls how pctToThreshold is calculated:
  // - "above" (default): pct = observed/threshold * 100 — triggers at >= 100% when observed rises TO threshold
  // - "below": pct = threshold/observed * 100 — triggers at >= 100% when observed FALLS TO threshold
  //   For invalidation signals tracking spending decline, use "below":
  //   e.g., threshold=1.5%, observed=2.17% → pct = 1.5/2.17 * 100 = 69% (safe, far from trigger)
  //   If observed drops to 1.5% → pct = 1.5/1.5 * 100 = 100% (triggered)
  const direction = (explicitDetails.thresholdDirection as string) || 'above';
  let pct: number;
  if (direction === 'below') {
    pct = observedValue > 0 ? (threshold / observedValue) * 100 : 0;
  } else {
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  // Build evidence summary with per-country breakdown
  const dataYear = countryValues[0]?.[1].year || 'unknown';
  const countryLines = countryValues
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([iso, v]) => `${v.name}: ${v.value.toFixed(2)}%`)
    .join(' | ');

  const trendInfo = buildTrendInfo(records, countries);

  const summaryParts = [
    `Data year: ${dataYear} (updated: ${metadata.lastupdated})`,
    countryLines,
    `Avg: ${(countryValues.reduce((s, [, v]) => s + v.value, 0) / countryValues.length).toFixed(2)}%`,
    trendInfo,
  ].filter(Boolean);

  return {
    observedValue: Math.round(observedValue * 1000) / 1000,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || '% GDP',
    evidenceSummary: summaryParts.join(' | '),
  };
}

/**
 * Build a trend summary showing YoY changes for each country.
 */
function buildTrendInfo(records: WorldBankRecord[], countries: string[]): string {
  const parts: string[] = [];

  for (const iso of countries) {
    const countryRecords = records
      .filter(r => r.countryiso3code === iso.toUpperCase() && r.value !== null)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (countryRecords.length >= 2) {
      const latest = countryRecords[0].value!;
      const prior = countryRecords[1].value!;
      const change = latest - prior;
      const arrow = change > 0.05 ? '↑' : change < -0.05 ? '↓' : '→';
      parts.push(`${iso} ${arrow}${change >= 0 ? '+' : ''}${change.toFixed(2)}pp`);
    }
  }

  return parts.length > 0 ? `YoY: ${parts.join(', ')}` : '';
}
