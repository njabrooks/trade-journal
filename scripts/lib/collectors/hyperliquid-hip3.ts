/**
 * Hyperliquid HIP-3 share collector for signal tracking.
 *
 * Fetches volume data from Hyperliquid API to calculate HIP-3 (TradFi perps)
 * share of total Hyperliquid volume. This metric tracks whether perpetual
 * futures are expanding beyond crypto into traditional finance assets.
 *
 * API: POST https://api.hyperliquid.xyz/info
 * Free, no auth, real-time data.
 *
 * explicit_details shape:
 * {
 *   dataSource: "hyperliquid_hip3",
 *   metric: "hip3_share_pct" | "hip3_volume" | "total_volume",
 *   threshold: 20,              // e.g., 20% HIP-3 share
 *   thresholdUnit: "%",
 *   thresholdDirection: "below", // invalidation: triggers if share falls below threshold
 *   checkFrequency: "daily"
 * }
 */

export interface HyperliquidHip3Snapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface AssetCtx {
  dayNtlVlm: string;
  openInterest: string;
  coin?: string;
}

interface PerpDex {
  name: string;
  deployer: string;
}

const API_URL = 'https://api.hyperliquid.xyz/info';

async function fetchJson(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'TradeJournal-SignalCollector/1.0',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API failed: ${res.status}`);
  return res.json();
}

function sumDayVolume(ctxs: AssetCtx[]): number {
  return ctxs.reduce((sum, c) => sum + parseFloat(c.dayNtlVlm || '0'), 0);
}

function sumOpenInterest(ctxs: AssetCtx[]): number {
  return ctxs.reduce((sum, c) => sum + parseFloat(c.openInterest || '0'), 0);
}

export async function collectHyperliquidHip3(
  explicitDetails: Record<string, unknown>
): Promise<HyperliquidHip3Snapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const metric = (explicitDetails.metric as string) || 'hip3_share_pct';
  const direction = (explicitDetails.thresholdDirection as string) || 'below';

  // Step 1: Get list of HIP-3 deployers
  const dexes = await fetchJson({ type: 'perpDexs' }) as (PerpDex | null)[];
  const hip3Dexes = dexes.filter((d): d is PerpDex => d !== null);

  // Step 2: Get main dex volume (crypto perps)
  const mainData = await fetchJson({ type: 'metaAndAssetCtxs' }) as [unknown, AssetCtx[]];
  const mainVolume = sumDayVolume(mainData[1]);
  const mainOI = sumOpenInterest(mainData[1]);

  // Step 3: Get each HIP-3 deployer's volume
  let hip3Volume = 0;
  let hip3OI = 0;
  const deployers: Array<{ name: string; volume: number; oi: number }> = [];

  for (const dex of hip3Dexes) {
    try {
      const data = await fetchJson({ type: 'metaAndAssetCtxs', dex: dex.name }) as [unknown, AssetCtx[]];
      const vol = sumDayVolume(data[1]);
      const oi = sumOpenInterest(data[1]);
      hip3Volume += vol;
      hip3OI += oi;
      if (vol > 0) {
        deployers.push({ name: dex.name, volume: vol, oi });
      }
    } catch {
      // Skip failed deployer queries
    }
  }

  const totalVolume = mainVolume + hip3Volume;
  const hip3SharePct = totalVolume > 0 ? (hip3Volume / totalVolume) * 100 : 0;

  // Select observed value based on metric
  let observedValue: number;
  let unit: string;
  switch (metric) {
    case 'hip3_volume':
      observedValue = hip3Volume;
      unit = (explicitDetails.thresholdUnit as string) || 'USD';
      break;
    case 'total_volume':
      observedValue = totalVolume;
      unit = (explicitDetails.thresholdUnit as string) || 'USD';
      break;
    case 'hip3_share_pct':
    default:
      observedValue = hip3SharePct;
      unit = (explicitDetails.thresholdUnit as string) || '%';
      break;
  }

  // Calculate pctToThreshold
  let pct: number;
  if (direction === 'below') {
    pct = observedValue > 0 ? (threshold / observedValue) * 100 : 0;
  } else {
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  // Build evidence summary
  const topDeployers = deployers
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map(d => `${d.name}: $${(d.volume / 1e9).toFixed(2)}B`)
    .join(', ');

  const summaryParts = [
    `HIP-3 share: ${hip3SharePct.toFixed(1)}% of total Hyperliquid volume`,
    `HIP-3 24h: $${(hip3Volume / 1e9).toFixed(2)}B | Crypto perps: $${(mainVolume / 1e9).toFixed(2)}B | Total: $${(totalVolume / 1e9).toFixed(2)}B`,
    `HIP-3 OI: $${(hip3OI / 1e9).toFixed(2)}B | ${hip3Dexes.length} deployers (${deployers.length} active)`,
    topDeployers ? `Top deployers: ${topDeployers}` : null,
  ].filter(Boolean);

  return {
    observedValue: Math.round(observedValue * 100) / 100,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit,
    evidenceSummary: summaryParts.join(' | '),
  };
}
