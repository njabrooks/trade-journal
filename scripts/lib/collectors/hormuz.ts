/**
 * Strait of Hormuz ship transit collector for signal tracking.
 *
 * Fetches dashboard data from hormuzstraitmonitor.com API.
 * Primary metric: ships transiting in last 24 hours (rolling).
 * Normal baseline: ~60 ships/day.
 */

export interface HormuzSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface HormuzDashboard {
  success: boolean;
  data: {
    straitStatus: {
      status: string;    // e.g. "RESTRICTED", "CLOSED", "OPEN"
      since: string;
      description: string;
    };
    shipCount: {
      currentTransits: number;
      last24h: number;
      normalDaily: number;
      percentOfNormal: number;
    };
    oilPrice: {
      brentPrice: number;
      change24h: number;
      changePercent24h: number;
    };
    throughput: {
      todayDWT: number;
      averageDWT: number;
      percentOfNormal: number;
      last7Days: number[];
    };
    diplomacy: {
      status: string;
      headline: string;
      date: string;
    };
    insurance: {
      level: string;
      warRiskPercent: number;
      normalPercent: number;
      multiplier: number;
    };
  };
}

const API_URL = 'https://hormuzstraitmonitor.com/api/dashboard';

/**
 * Fetch Hormuz strait transit data and compute threshold proximity.
 *
 * explicit_details shape:
 * {
 *   dataSource: "hormuz_strait",
 *   metric: "ships_last_24h",
 *   threshold: 30,
 *   thresholdUnit: "ships/day",
 *   operator: "gte",
 *   checkFrequency: "4h",
 *   normalBaseline: 60
 * }
 */
export async function collectHormuz(
  explicitDetails: Record<string, unknown>
): Promise<HormuzSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const metric = (explicitDetails.metric as string) || 'ships_last_24h';

  const res = await fetch(API_URL, {
    headers: {
      'User-Agent': 'TradeJournal-SignalCollector/1.0',
    },
  });

  if (!res.ok) {
    console.warn(`  Hormuz API failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json() as HormuzDashboard;
  if (!json.success || !json.data) {
    console.warn('  Hormuz API: unexpected response shape');
    return null;
  }

  const { shipCount, throughput, straitStatus, oilPrice, diplomacy } = json.data;

  let value: number | null = null;

  switch (metric) {
    case 'ships_last_24h':
      value = shipCount.last24h;
      break;
    case 'ships_current':
      value = shipCount.currentTransits;
      break;
    case 'throughput_pct':
      value = throughput.percentOfNormal;
      break;
    case 'ships_pct_normal':
      value = shipCount.percentOfNormal;
      break;
    default:
      value = shipCount.last24h;
  }

  if (value === null) return null;

  const pct = threshold > 0 ? (value / threshold) * 100 : 0;

  // Build a rich evidence summary with context from the full dashboard
  const dwt7dAvg = throughput.last7Days.length > 0
    ? Math.round(throughput.last7Days.reduce((a, b) => a + b, 0) / throughput.last7Days.length)
    : null;

  const summaryParts = [
    `Strait status: ${straitStatus.status} (since ${straitStatus.since})`,
    `Ships now: ${shipCount.currentTransits} | 24h: ${shipCount.last24h} | Normal: ${shipCount.normalDaily}`,
    `Throughput: ${(throughput.todayDWT / 1_000_000).toFixed(2)}M DWT (${throughput.percentOfNormal.toFixed(1)}% of normal)`,
    dwt7dAvg ? `7d avg DWT: ${(dwt7dAvg / 1_000_000).toFixed(2)}M` : null,
    `Brent: $${oilPrice.brentPrice} (${oilPrice.changePercent24h >= 0 ? '+' : ''}${oilPrice.changePercent24h.toFixed(1)}%)`,
    `Diplomacy: ${diplomacy.status} — ${diplomacy.headline}`,
  ].filter(Boolean);

  return {
    observedValue: value,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || 'ships/day',
    evidenceSummary: summaryParts.join(' | '),
  };
}
