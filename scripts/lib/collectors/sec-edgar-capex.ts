/**
 * SEC EDGAR XBRL Capex collector for hyperscaler aggregate capital expenditure.
 *
 * Fetches quarterly capex from SEC 10-Q/10-K filings for the Big 4 hyperscalers
 * (Alphabet, Microsoft, Meta, Amazon) via the EDGAR XBRL companyconcept API.
 * Aggregates calendar-quarter capex and calculates YoY growth.
 *
 * No API key required — just a User-Agent header per SEC fair-access policy.
 * Data frequency: quarterly (~4 updates/year, ~30-45 days after quarter-end).
 *
 * explicit_details shape:
 * {
 *   dataSource: "sec_edgar_capex",
 *   metric: "aggregate_yoy_growth",    // YoY growth of aggregate quarterly capex
 *   threshold: 0,                      // 0% = growth turns negative
 *   thresholdUnit: "% YoY",
 *   thresholdDirection: "below",       // triggers when growth FALLS BELOW threshold
 *   checkFrequency: "weekly",
 *   label: "Big 4 Hyperscaler Capex"
 * }
 */

export interface EdgarCapexSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

/** EDGAR XBRL companyconcept entry */
interface XBRLEntry {
  start: string;     // "2025-01-01"
  end: string;       // "2025-03-31"
  val: number;       // value in USD
  form: string;      // "10-Q" | "10-K"
  filed: string;     // "2025-04-25"
  fp: string;        // "Q1" | "Q2" | "Q3" | "FY"
  frame?: string;    // "CY2025Q1" | "CY2025" | null
}

interface XBRLResponse {
  entityName: string;
  units: { USD?: XBRLEntry[] };
}

/** Calendar quarter identifier */
interface CalendarQuarter {
  year: number;
  quarter: number;  // 1-4
  key: string;      // "2025-Q1"
}

/** Per-company quarterly capex after parsing */
export interface QuarterlyCapex {
  company: string;
  quarter: CalendarQuarter;
  capexBn: number;    // billions USD
  form: string;
  filed: string;
}

/** Aggregated quarterly data */
export interface AggregateQuarter {
  quarter: CalendarQuarter;
  totalBn: number;
  companies: Array<{ company: string; capexBn: number }>;
  yoyGrowthPct?: number;
}

const USER_AGENT = 'TradeJournal-SignalCollector/1.0 (research@example.com)';

/** Big 4 hyperscaler EDGAR configuration */
const HYPERSCALERS = [
  {
    name: 'Alphabet',
    ticker: 'GOOG',
    cik: 'CIK0001652044',
    tag: 'PaymentsToAcquirePropertyPlantAndEquipment',
    fiscalYearEnd: 12,  // December (calendar year)
  },
  {
    name: 'Microsoft',
    ticker: 'MSFT',
    cik: 'CIK0000789019',
    tag: 'PaymentsToAcquirePropertyPlantAndEquipment',
    fiscalYearEnd: 6,   // June (fiscal year offset)
  },
  {
    name: 'Meta',
    ticker: 'META',
    cik: 'CIK0001326801',
    tag: 'PaymentsToAcquirePropertyPlantAndEquipment',
    fiscalYearEnd: 12,  // December (calendar year)
  },
  {
    name: 'Amazon',
    ticker: 'AMZN',
    cik: 'CIK0001018724',
    tag: 'PaymentsToAcquireProductiveAssets',  // Amazon uses different XBRL tag
    fiscalYearEnd: 12,  // December (calendar year)
  },
] as const;

/**
 * Determine which calendar quarter a period belongs to based on end date.
 */
function endDateToCalendarQuarter(endDate: string): CalendarQuarter {
  const d = new Date(endDate);
  const month = d.getUTCMonth() + 1; // 1-12
  const year = d.getUTCFullYear();
  const quarter = Math.ceil(month / 3);
  return { year, quarter, key: `${year}-Q${quarter}` };
}

/**
 * Calculate the period duration in days.
 */
function periodDays(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Enumerate all calendar quarters spanned by a date range.
 * E.g., Jan 1 - Sep 30 → [Q1, Q2, Q3]
 * E.g., Jul 1 - Jun 30 → [Q3, Q4, Q1, Q2] (for fiscal year offset companies)
 */
function enumerateCalendarQuarters(start: string, end: string): CalendarQuarter[] {
  const quarters: CalendarQuarter[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Start from the first quarter boundary at or after start date
  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth() + 1; // 1-12
  // Snap to next quarter end
  let quarter = Math.ceil(month / 3);
  // Build quarter end date
  let qEndMonth = quarter * 3;

  while (true) {
    const qEnd = new Date(Date.UTC(year, qEndMonth - 1, 28)); // ~end of quarter month
    if (qEnd > endDate) break;

    quarters.push({ year, quarter, key: `${year}-Q${quarter}` });

    // Advance to next quarter
    quarter++;
    if (quarter > 4) {
      quarter = 1;
      year++;
    }
    qEndMonth = quarter * 3;
  }

  return quarters;
}

/**
 * Fetch XBRL data for a single company and extract individual calendar-quarter capex values.
 *
 * The EDGAR API returns both individual quarter and cumulative (YTD) entries.
 * We identify individual quarters by their ~90-day duration (75-95 days to handle month variation).
 * Cumulative entries (6/9/12 month durations) are used to derive quarters by subtraction
 * when individual entries aren't available.
 */
async function fetchCompanyCapex(
  company: typeof HYPERSCALERS[number]
): Promise<QuarterlyCapex[]> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/${company.cik}/us-gaap/${company.tag}.json`;

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    console.warn(`  SEC EDGAR: ${company.name} failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const json = await res.json() as XBRLResponse;
  const entries = json.units?.USD || [];

  if (entries.length === 0) {
    console.warn(`  SEC EDGAR: ${company.name} — no USD entries`);
    return [];
  }

  // Step 1: Separate individual quarters from cumulative periods
  const individualQuarters = new Map<string, QuarterlyCapex>();
  const cumulativePeriods: Array<{ start: string; end: string; val: number; form: string; filed: string }> = [];

  for (const entry of entries) {
    if (!entry.start || !entry.end) continue;
    const days = periodDays(entry.start, entry.end);
    const quarter = endDateToCalendarQuarter(entry.end);

    if (days >= 75 && days <= 100) {
      // Individual quarter (~90 days)
      const existing = individualQuarters.get(quarter.key);
      // Keep the most recently filed version (restated data)
      if (!existing || entry.filed > existing.filed) {
        individualQuarters.set(quarter.key, {
          company: company.name,
          quarter,
          capexBn: entry.val / 1e9,
          form: entry.form,
          filed: entry.filed,
        });
      }
    } else if (days > 100) {
      // Cumulative period (6/9/12 month)
      cumulativePeriods.push({
        start: entry.start,
        end: entry.end,
        val: entry.val,
        form: entry.form,
        filed: entry.filed,
      });
    }
  }

  // Step 2: Derive missing quarters from cumulative data
  // Sort cumulative periods by duration (ascending) so we process shorter periods first
  cumulativePeriods.sort((a, b) => periodDays(a.start, a.end) - periodDays(b.start, b.end));

  // Keep only the most recently filed version per period
  const uniqueCumulative = new Map<string, typeof cumulativePeriods[0]>();
  for (const cp of cumulativePeriods) {
    const key = `${cp.start}:${cp.end}`;
    const existing = uniqueCumulative.get(key);
    if (!existing || cp.filed > existing.filed) {
      uniqueCumulative.set(key, cp);
    }
  }

  // For each cumulative period, derive the last quarter by subtracting
  // all earlier quarters that fall within the period.
  // Process multiple passes (shorter periods first) so derived quarters
  // become available for deriving from longer periods.
  const sortedCumulative = Array.from(uniqueCumulative.values())
    .sort((a, b) => periodDays(a.start, a.end) - periodDays(b.start, b.end));

  for (let pass = 0; pass < 3; pass++) {
    for (const cp of sortedCumulative) {
      const targetQuarter = endDateToCalendarQuarter(cp.end);
      if (individualQuarters.has(targetQuarter.key)) continue;

      // Enumerate all calendar quarters spanned by this cumulative period
      const spannedQuarters = enumerateCalendarQuarters(cp.start, cp.end);
      if (spannedQuarters.length < 2) continue;

      // The last quarter in the span is what we want to derive
      const priorQuarters = spannedQuarters.slice(0, -1);

      // Check if we have all prior quarters
      const priorValues: number[] = [];
      let allFound = true;
      for (const pq of priorQuarters) {
        const existing = individualQuarters.get(pq.key);
        if (existing) {
          priorValues.push(existing.capexBn);
        } else {
          allFound = false;
          break;
        }
      }

      if (allFound) {
        const priorSum = priorValues.reduce((s, v) => s + v, 0);
        const derived = (cp.val / 1e9) - priorSum;
        if (derived > 0) {
          individualQuarters.set(targetQuarter.key, {
            company: company.name,
            quarter: targetQuarter,
            capexBn: derived,
            form: cp.form,
            filed: cp.filed,
          });
        }
      }
    }
  }

  return Array.from(individualQuarters.values())
    .filter(q => q.capexBn > 0) // Filter out negative values from bad derivations
    .sort((a, b) => a.quarter.key.localeCompare(b.quarter.key));
}

/**
 * Aggregate quarterly capex across companies and calculate YoY growth.
 */
function aggregateQuarters(allCompanyData: QuarterlyCapex[]): AggregateQuarter[] {
  // Group by calendar quarter
  const byQuarter = new Map<string, QuarterlyCapex[]>();
  for (const d of allCompanyData) {
    const existing = byQuarter.get(d.quarter.key) || [];
    existing.push(d);
    byQuarter.set(d.quarter.key, existing);
  }

  // Build aggregate quarters (require at least 3 of 4 companies for validity)
  const aggregates: AggregateQuarter[] = [];
  for (const [key, entries] of Array.from(byQuarter.entries()).sort()) {
    if (entries.length < 3) continue;

    const totalBn = entries.reduce((s, e) => s + e.capexBn, 0);
    const [year, qStr] = key.split('-Q');

    aggregates.push({
      quarter: { year: parseInt(year), quarter: parseInt(qStr), key },
      totalBn: Math.round(totalBn * 10) / 10,
      companies: entries.map(e => ({ company: e.company, capexBn: Math.round(e.capexBn * 10) / 10 })),
    });
  }

  // Calculate YoY growth for quarters that have a prior year match
  for (const agg of aggregates) {
    const priorKey = `${agg.quarter.year - 1}-Q${agg.quarter.quarter}`;
    const prior = aggregates.find(a => a.quarter.key === priorKey);
    if (prior && prior.totalBn > 0) {
      agg.yoyGrowthPct = ((agg.totalBn - prior.totalBn) / prior.totalBn) * 100;
    }
  }

  return aggregates;
}

/**
 * Main collector: fetches capex for all 4 hyperscalers, aggregates, and returns snapshot.
 */
export async function collectSecEdgarCapex(
  explicitDetails: Record<string, unknown>
): Promise<EdgarCapexSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const label = (explicitDetails.label as string) || 'Big 4 Hyperscaler Capex';
  const direction = (explicitDetails.thresholdDirection as string) || 'below';

  // Fetch all companies with rate limiting (SEC: 10 req/sec)
  const allData: QuarterlyCapex[] = [];
  for (const company of HYPERSCALERS) {
    try {
      const data = await fetchCompanyCapex(company);
      allData.push(...data);
      // 200ms delay between requests (SEC fair-access)
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.warn(`  SEC EDGAR: ${company.name} error: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (allData.length === 0) {
    console.warn('  SEC EDGAR Capex: no data returned');
    return null;
  }

  const aggregates = aggregateQuarters(allData);

  // Find the most recent quarter with YoY growth available
  const withYoY = aggregates.filter(a => a.yoyGrowthPct !== undefined);
  if (withYoY.length === 0) {
    console.warn('  SEC EDGAR Capex: no quarters with YoY comparison');
    return null;
  }

  const latest = withYoY[withYoY.length - 1];
  const observedValue = Math.round(latest.yoyGrowthPct! * 10) / 10;

  // Build evidence summary
  const summaryParts: string[] = [label];
  summaryParts.push(
    `${latest.quarter.key}: $${latest.totalBn.toFixed(0)}B aggregate (${observedValue >= 0 ? '+' : ''}${observedValue.toFixed(1)}% YoY)`
  );

  // Per-company breakdown
  const breakdown = latest.companies
    .sort((a, b) => b.capexBn - a.capexBn)
    .map(c => `${c.company}: $${c.capexBn.toFixed(1)}B`)
    .join(', ');
  summaryParts.push(breakdown);

  // Recent trend (last 4 quarters with YoY)
  const recentWithYoY = withYoY.slice(-4);
  if (recentWithYoY.length >= 2) {
    const trend = recentWithYoY
      .map(q => `${q.quarter.key}: ${q.yoyGrowthPct! >= 0 ? '+' : ''}${q.yoyGrowthPct!.toFixed(0)}%`)
      .join(' → ');
    summaryParts.push(`Trend: ${trend}`);
  }

  // Calculate pctToThreshold
  let pct: number;
  if (direction === 'below') {
    // Triggers when observed FALLS TO threshold from above
    if (threshold === 0) {
      // Map: 60%+ → ~0%, 20% → ~67%, 5% → ~83%, 0% → 100%, negative → >100%
      if (observedValue <= 0) {
        pct = 100 + Math.abs(observedValue);
      } else {
        pct = Math.max(0, 100 - (observedValue / 0.6));
      }
    } else if (observedValue > 0 && threshold > 0) {
      pct = (threshold / observedValue) * 100;
    } else {
      pct = observedValue <= threshold ? 100 : 0;
    }
  } else {
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  return {
    observedValue,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: '% YoY',
    evidenceSummary: summaryParts.join(' | '),
  };
}

/**
 * Fetch full historical quarterly capex for backfill.
 * Returns all aggregate quarters from all available EDGAR data.
 */
export async function fetchEdgarCapexHistorical(): Promise<AggregateQuarter[]> {
  const allData: QuarterlyCapex[] = [];

  for (const company of HYPERSCALERS) {
    console.log(`  Fetching ${company.name} (${company.ticker})...`);
    try {
      const data = await fetchCompanyCapex(company);
      console.log(`    ${data.length} quarters found (${data[0]?.quarter.key || '?'} to ${data[data.length - 1]?.quarter.key || '?'})`);
      allData.push(...data);
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.warn(`  ${company.name} error: ${err instanceof Error ? err.message : err}`);
    }
  }

  return aggregateQuarters(allData);
}
