/**
 * Live-pricing overlay (W6 / D14).
 *
 * Fetches the freshest available spot per underlying at VIEW time:
 * Yahoo (live regularMarketPrice) → IBKR Client Portal Gateway (if running).
 * Results live in a 15-minute in-process TTL cache and are NEVER written back
 * to positions — the overlay is computed at API/display time so snapshot
 * history stays clean (docs/v2/03-v2-spec.md §5.5).
 *
 * Quotes are returned in the listing currency; the client applies them as a
 * RATIO against the position's stored spot (newMV = oldMV × live/spot), which
 * sidesteps multiplier/FX/sign assumptions entirely.
 */

export type LiveQuoteKind = 'STK' | 'CRYPTO';

export interface LiveQuote {
  key: string; // `${kind}:${ticker}`, e.g. 'STK:AAPL', 'CRYPTO:BTC'
  ticker: string;
  kind: LiveQuoteKind;
  price: number;
  currency: string | null;
  /** quote timestamp from the source (ms epoch) */
  asOfMs: number;
  source: 'yahoo' | 'ibkr';
}

const TTL_MS = 15 * 60_000;
/** failed lookups are also cached so a dead symbol isn't re-fetched per view */
const NEGATIVE_TTL_MS = 15 * 60_000;
const FETCH_TIMEOUT_MS = 4_000;
const CONCURRENCY = 6;

/**
 * Reject quotes older than this — guards against Yahoo symbol collisions
 * resolving to dead listings (observed: HYPE-USD → a 2024-abandoned token).
 * Crypto trades 24/7, so a genuine quote is minutes old; equities get slack
 * for weekends/holidays.
 */
const MAX_QUOTE_AGE_MS: Record<LiveQuoteKind, number> = {
  STK: 4 * 86_400_000,
  CRYPTO: 6 * 60 * 60_000,
};

const cache = new Map<string, { quote: LiveQuote | null; fetchedAt: number }>();

function quoteKey(kind: LiveQuoteKind, ticker: string): string {
  return `${kind}:${ticker.toUpperCase()}`;
}

/** Yahoo symbol mapping: class shares use dashes (BRK.B → BRK-B); crypto pairs are X-USD. */
function yahooSymbol(kind: LiveQuoteKind, ticker: string): string {
  if (kind === 'CRYPTO') return `${ticker.toUpperCase()}-USD`;
  return ticker.toUpperCase().replace(/\./g, '-');
}

interface YahooLiveResult {
  price: number;
  currency: string | null;
  asOfMs: number;
}

async function fetchYahooLive(symbol: string): Promise<YahooLiveResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeJournal/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = typeof meta?.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;
    if (price === null || price <= 0) return null;

    return {
      price,
      currency: typeof meta.currency === 'string' ? meta.currency : null,
      asOfMs:
        typeof meta.regularMarketTime === 'number'
          ? meta.regularMarketTime * 1000
          : Date.now(),
    };
  } catch {
    return null; // timeouts, network errors, malformed payloads → treated as a miss
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** IBKR gateway fallback for equities Yahoo missed. Best-effort: any failure → []. */
async function fetchIbkrFallback(tickers: string[]): Promise<Map<string, YahooLiveResult>> {
  const out = new Map<string, YahooLiveResult>();
  if (tickers.length === 0) return out;
  try {
    const { verifyGateway } = await import('./ibkr/client');
    if (!(await verifyGateway())) return out;
    const { getConidsBatch } = await import('./ibkr/contracts');
    const { getSnapshot, extractSpot } = await import('./ibkr/marketdata');

    const conids = await getConidsBatch(tickers);
    const conidToTicker = new Map<number, string>();
    for (const [ticker, conid] of conids.entries()) {
      if (typeof conid === 'number') conidToTicker.set(conid, ticker);
    }
    if (conidToTicker.size === 0) return out;

    const snapshots = await getSnapshot([...conidToTicker.keys()]);
    for (const snap of snapshots) {
      const ticker = conidToTicker.get(snap.conid);
      const spot = extractSpot(snap);
      if (ticker && spot !== null) {
        out.set(ticker, { price: spot, currency: null, asOfMs: Date.now() });
      }
    }
  } catch (error) {
    console.warn('IBKR live-price fallback unavailable:', error);
  }
  return out;
}

export interface LiveQuoteRequest {
  stk?: string[];
  crypto?: string[];
}

/**
 * Resolve live quotes for the requested tickers. Served from the TTL cache
 * where possible; misses fetched from Yahoo (concurrency-limited), then IBKR
 * for equities Yahoo couldn't price. Unresolvable tickers are absent from the
 * result (and negative-cached).
 */
export async function getLiveQuotes(request: LiveQuoteRequest): Promise<Map<string, LiveQuote>> {
  const wanted: Array<{ kind: LiveQuoteKind; ticker: string; key: string }> = [
    ...(request.stk ?? []).map((t) => ({ kind: 'STK' as const, ticker: t.toUpperCase(), key: quoteKey('STK', t) })),
    ...(request.crypto ?? []).map((t) => ({ kind: 'CRYPTO' as const, ticker: t.toUpperCase(), key: quoteKey('CRYPTO', t) })),
  ];

  const result = new Map<string, LiveQuote>();
  const misses: typeof wanted = [];
  const now = Date.now();

  for (const item of wanted) {
    const cached = cache.get(item.key);
    if (cached) {
      const ttl = cached.quote === null ? NEGATIVE_TTL_MS : TTL_MS;
      if (now - cached.fetchedAt < ttl) {
        if (cached.quote) result.set(item.key, cached.quote);
        continue;
      }
    }
    misses.push(item);
  }

  if (misses.length === 0) return result;

  const yahooResults = await mapWithConcurrency(misses, CONCURRENCY, (item) =>
    fetchYahooLive(yahooSymbol(item.kind, item.ticker))
  );

  const stillMissingStk: string[] = [];
  misses.forEach((item, i) => {
    let hit = yahooResults[i];
    if (hit && now - hit.asOfMs > MAX_QUOTE_AGE_MS[item.kind]) hit = null;
    if (hit) {
      const quote: LiveQuote = { ...item, price: hit.price, currency: hit.currency, asOfMs: hit.asOfMs, source: 'yahoo' };
      cache.set(item.key, { quote, fetchedAt: now });
      result.set(item.key, quote);
    } else if (item.kind === 'STK') {
      stillMissingStk.push(item.ticker);
    } else {
      cache.set(item.key, { quote: null, fetchedAt: now });
    }
  });

  const ibkrResults = await fetchIbkrFallback(stillMissingStk);
  for (const ticker of stillMissingStk) {
    const key = quoteKey('STK', ticker);
    const hit = ibkrResults.get(ticker);
    if (hit) {
      const quote: LiveQuote = {
        key,
        ticker,
        kind: 'STK',
        price: hit.price,
        currency: hit.currency,
        asOfMs: hit.asOfMs,
        source: 'ibkr',
      };
      cache.set(key, { quote, fetchedAt: now });
      result.set(key, quote);
    } else {
      cache.set(key, { quote: null, fetchedAt: now });
    }
  }

  return result;
}
