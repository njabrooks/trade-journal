/**
 * D14 live-pricing overlay — client-side application (pure).
 *
 * Patches stored position snapshots with live quotes at DISPLAY time:
 * newMarketValue = storedMarketValue × (livePrice / storedSpot). The ratio
 * form needs no multiplier/FX/sign assumptions — it scales whatever the
 * ingestion pipeline already computed. Nothing is written back; snapshots
 * stay clean.
 *
 * Only STK and CRYPTO positions are overlaid. Options/futures/perps keep
 * their snapshot marks (EOD/exchange) with as-of labels per the spec.
 */

import type { LiveQuote } from '@/lib/services/livePrices';
import type {
  PortfolioPositionsData,
  PortfolioPositionRow,
  PortfolioStrategyRow,
} from '@/db/queries/portfolio';

export interface OverlaidPositionRow extends PortfolioPositionRow {
  /** set when this row's valuation was scaled by a live quote */
  livePriced?: boolean;
  liveSource?: 'yahoo' | 'ibkr';
  liveAsOfMs?: number;
}

export interface LiveOverlayStatus {
  /** distinct underlyings that received a live price */
  liveUnderlyings: number;
  /** distinct STK/CRYPTO underlyings that could have received one */
  overlayableUnderlyings: number;
  livePositionCount: number;
  /** most recent quote timestamp across applied quotes (ms) */
  latestAsOfMs: number | null;
}

export interface LiveOverlayResult {
  data: PortfolioPositionsData;
  status: LiveOverlayStatus;
}

/**
 * Reject a live price that deviates implausibly from the stored spot — the
 * stored value is at most ~1 trading day (STK) / ~4h (CRYPTO) old, so a huge
 * gap means a symbol collision (e.g. a same-ticker dead token on Yahoo), not
 * a market move.
 */
const MAX_DEVIATION: Record<'STK' | 'CRYPTO', number> = {
  STK: 0.5,
  CRYPTO: 0.35,
};

function overlayKind(assetClass: string | null): 'STK' | 'CRYPTO' | null {
  if (assetClass === 'STK') return 'STK';
  if (assetClass === 'CRYPTO') return 'CRYPTO';
  return null;
}

export function collectOverlayTickers(data: PortfolioPositionsData): {
  stk: string[];
  crypto: string[];
} {
  const stk = new Set<string>();
  const crypto = new Set<string>();
  const allPositions = [
    ...data.strategies.flatMap((s) => s.positions),
    ...data.unlinkedPositions,
  ];
  for (const p of allPositions) {
    const kind = overlayKind(p.assetClass);
    const ticker = p.underlyingTicker ?? p.symbol;
    if (!kind || !ticker) continue;
    (kind === 'STK' ? stk : crypto).add(ticker.toUpperCase());
  }
  return { stk: [...stk], crypto: [...crypto] };
}

export function applyLiveOverlay(
  data: PortfolioPositionsData,
  quotes: Record<string, LiveQuote>
): LiveOverlayResult {
  const liveTickers = new Set<string>();
  const overlayableTickers = new Set<string>();
  let livePositionCount = 0;
  let latestAsOfMs: number | null = null;

  function patchPosition(p: PortfolioPositionRow): OverlaidPositionRow {
    const kind = overlayKind(p.assetClass);
    const ticker = (p.underlyingTicker ?? p.symbol)?.toUpperCase();
    if (!kind || !ticker) return p;
    overlayableTickers.add(`${kind}:${ticker}`);

    const quote = quotes[`${kind}:${ticker}`];
    if (!quote) return p;
    if (p.spot === null || p.spot <= 0) return p;
    // listing-currency mismatch would corrupt the ratio (e.g. GBp vs USD)
    if (quote.currency && p.currency && quote.currency !== p.currency) return p;
    const ratio = quote.price / p.spot;
    if (Math.abs(ratio - 1) > MAX_DEVIATION[kind]) return p;

    liveTickers.add(`${kind}:${ticker}`);
    livePositionCount += 1;
    if (latestAsOfMs === null || quote.asOfMs > latestAsOfMs) latestAsOfMs = quote.asOfMs;

    const mv = p.marketValueUsd;
    const newMv = mv !== null ? mv * ratio : null;
    return {
      ...p,
      spot: quote.price,
      marketValueUsd: newMv,
      unrealizedPnl:
        p.unrealizedPnl !== null && mv !== null && newMv !== null
          ? p.unrealizedPnl + (newMv - mv)
          : p.unrealizedPnl,
      livePriced: true,
      liveSource: quote.source,
      liveAsOfMs: quote.asOfMs,
    };
  }

  const strategies: PortfolioStrategyRow[] = data.strategies.map((s) => ({
    ...s,
    positions: s.positions.map(patchPosition),
  }));
  const unlinkedPositions = data.unlinkedPositions.map(patchPosition);

  return {
    data: { ...data, strategies, unlinkedPositions },
    status: {
      liveUnderlyings: liveTickers.size,
      overlayableUnderlyings: overlayableTickers.size,
      livePositionCount,
      latestAsOfMs,
    },
  };
}
