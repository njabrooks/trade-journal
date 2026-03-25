/**
 * SEC EDGAR XBRL Company Facts collector for signal tracking.
 *
 * Fetches structured financial data from SEC EDGAR's XBRL API.
 * Tracks specific financial metrics (revenue, net income, etc.) for US-listed companies.
 * Data updates when companies file 10-Q (~38 days after quarter) or 10-K (~58 days).
 *
 * explicit_details shape:
 * {
 *   dataSource: "sec_edgar",
 *   cik: "0001801368",           // SEC CIK number (with leading zeros)
 *   companyName: "MP Materials",  // For evidence summary
 *   metric: "Revenues" | "NetIncomeLoss" | "CashAndCashEquivalentsAtCarryingValue" | ...,
 *   taxonomy: "us-gaap",         // usually "us-gaap"
 *   threshold: 50000000,         // threshold value (e.g., $50M quarterly revenue)
 *   thresholdUnit: "USD",
 *   operator: "gte",             // "gte" = observed >= threshold triggers
 *   periodFilter: "quarterly",   // "quarterly" | "annual" | "latest"
 *   checkFrequency: "weekly"
 * }
 *
 * Note: SEC EDGAR requires a User-Agent header with contact info.
 */

export interface SecEdgarSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface XbrlFact {
  val: number;
  end: string;    // period end date (YYYY-MM-DD)
  accn: string;   // accession number
  fy: number;     // fiscal year
  fp: string;     // fiscal period: Q1, Q2, Q3, FY
  form: string;   // 10-K, 10-Q
  filed: string;  // filing date
  frame?: string; // e.g., CY2025Q3I
}

interface CompanyFactsResponse {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, { label: string; description: string; units: Record<string, XbrlFact[]> }>;
    dei?: Record<string, { label: string; description: string; units: Record<string, XbrlFact[]> }>;
  };
}

const BASE_URL = 'https://data.sec.gov/api/xbrl/companyfacts';
const USER_AGENT = 'TradeJournal-SignalCollector/1.0 (research@homehub.local)';

export async function collectSecEdgar(
  explicitDetails: Record<string, unknown>
): Promise<SecEdgarSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const cik = explicitDetails.cik as string;
  if (!cik) {
    console.warn('  SEC EDGAR: no CIK provided');
    return null;
  }

  const metric = (explicitDetails.metric as string) || 'Revenues';
  const taxonomy = (explicitDetails.taxonomy as string) || 'us-gaap';
  const periodFilter = (explicitDetails.periodFilter as string) || 'quarterly';
  const companyName = (explicitDetails.companyName as string) || 'Unknown';

  // Pad CIK to 10 digits
  const paddedCik = `CIK${cik.replace(/^CIK/, '').padStart(10, '0')}`;
  const url = `${BASE_URL}/${paddedCik}.json`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    console.warn(`  SEC EDGAR API failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json() as CompanyFactsResponse;

  // Navigate to the specific metric
  const taxonomyData = json.facts[taxonomy as keyof typeof json.facts];
  if (!taxonomyData || !taxonomyData[metric]) {
    console.warn(`  SEC EDGAR: metric ${taxonomy}:${metric} not found for ${companyName}`);
    return null;
  }

  const metricData = taxonomyData[metric];
  const usdFacts = metricData.units['USD'];
  if (!usdFacts || usdFacts.length === 0) {
    console.warn(`  SEC EDGAR: no USD data for ${metric}`);
    return null;
  }

  // Filter and sort based on period preference, deduplicating by period end date
  // (XBRL can have multiple entries per period from amendments or restated values)
  let relevantFacts: XbrlFact[];

  switch (periodFilter) {
    case 'quarterly':
      // Get quarterly filings (10-Q) — fp in Q1, Q2, Q3
      relevantFacts = deduplicateByPeriod(
        usdFacts.filter(f => ['Q1', 'Q2', 'Q3'].includes(f.fp) && f.form === '10-Q')
      );
      break;
    case 'annual':
      // Get annual filings (10-K) — fp = FY
      relevantFacts = deduplicateByPeriod(
        usdFacts.filter(f => f.fp === 'FY' && f.form === '10-K')
      );
      break;
    case 'latest':
    default:
      // Get the most recent filing regardless of type
      relevantFacts = deduplicateByPeriod(usdFacts);
      break;
  }

  if (relevantFacts.length === 0) {
    console.warn(`  SEC EDGAR: no ${periodFilter} data for ${metric}`);
    return null;
  }

  const latest = relevantFacts[0];
  const observedValue = latest.val;
  const pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;

  // Build evidence summary with trend
  const prior = relevantFacts.length > 1 ? relevantFacts[1] : null;
  const priorYear = relevantFacts.length > 4 ? relevantFacts[4] : null;

  const summaryParts = [
    `${companyName} ${metricData.label}: $${formatLargeNumber(observedValue)}`,
    `Period: ${latest.fp} ${latest.fy} (ended ${latest.end}, filed ${latest.filed})`,
  ];

  if (prior) {
    const qoqChange = ((observedValue - prior.val) / Math.abs(prior.val)) * 100;
    summaryParts.push(`QoQ: ${qoqChange >= 0 ? '+' : ''}${qoqChange.toFixed(1)}%`);
  }

  if (priorYear) {
    const yoyChange = ((observedValue - priorYear.val) / Math.abs(priorYear.val)) * 100;
    summaryParts.push(`YoY: ${yoyChange >= 0 ? '+' : ''}${yoyChange.toFixed(1)}%`);
  }

  // Add last 4 quarters as sparkline
  const last4 = relevantFacts.slice(0, 4).reverse();
  if (last4.length >= 2) {
    const sparkline = last4.map(f => `${f.fp}${f.fy % 100}: $${formatLargeNumber(f.val)}`).join(' → ');
    summaryParts.push(`Trend: ${sparkline}`);
  }

  return {
    observedValue,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || 'USD',
    evidenceSummary: summaryParts.join(' | '),
  };
}

/**
 * Deduplicate XBRL facts by period end date, keeping the most recently filed entry.
 */
function deduplicateByPeriod(facts: XbrlFact[]): XbrlFact[] {
  const byPeriod = new Map<string, XbrlFact>();
  for (const f of facts) {
    const key = `${f.end}-${f.fp}`;
    const existing = byPeriod.get(key);
    if (!existing || f.filed > existing.filed) {
      byPeriod.set(key, f);
    }
  }
  return Array.from(byPeriod.values()).sort((a, b) => b.end.localeCompare(a.end));
}

function formatLargeNumber(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toFixed(0);
}
