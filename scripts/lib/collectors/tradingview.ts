/**
 * TradingView Scanner data collector for signal tracking.
 *
 * Uses TradingView's public scanner API (no auth required for basic data).
 * Supports stocks (NASDAQ:GLXY), indices (SP:SPX, NASDAQ:NDX), and crypto (COINBASE:BTCUSD).
 */

export interface TradingViewSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
}

interface ScannerResponse {
  totalCount: number;
  data: Array<{
    s: string; // symbol
    d: unknown[]; // column values in order requested
  }>;
}

// Map short ticker names to TradingView qualified symbols
const TICKER_MAP: Record<string, { symbol: string; exchange: 'america' | 'crypto' }> = {
  GLXY: { symbol: 'NASDAQ:GLXY', exchange: 'america' },
  SPX: { symbol: 'SP:SPX', exchange: 'america' },
  NDX: { symbol: 'NASDAQ:NDX', exchange: 'america' },
  BTCUSD: { symbol: 'COINBASE:BTCUSD', exchange: 'crypto' },
  BTC: { symbol: 'COINBASE:BTCUSD', exchange: 'crypto' },
};

/**
 * Fetch price/market cap data from TradingView scanner API.
 */
export async function collectTradingView(
  explicitDetails: Record<string, unknown>
): Promise<TradingViewSnapshot | null> {
  const ticker = explicitDetails.ticker as string | undefined;
  const metric = explicitDetails.metric as string | undefined;
  const threshold = explicitDetails.threshold as number | undefined;
  const operator = explicitDetails.operator as string | undefined;

  if (!ticker || threshold === undefined) return null;

  const mapping = TICKER_MAP[ticker] || TICKER_MAP[ticker.toUpperCase()];
  if (!mapping) {
    console.warn(`  TradingView: unknown ticker "${ticker}". Add to TICKER_MAP.`);
    return null;
  }

  // Determine which columns to fetch based on metric
  const columns = ['close', 'market_cap_calc'];

  const res = await fetch(`https://scanner.tradingview.com/${mapping.exchange}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: [mapping.symbol] },
      columns,
    }),
  });

  if (!res.ok) {
    console.warn(`  TradingView scanner failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json() as ScannerResponse;

  if (!data.data || data.data.length === 0) {
    console.warn(`  TradingView: no data for ${mapping.symbol}`);
    return null;
  }

  const row = data.data[0].d;
  const price = row[0] as number | null;
  const marketCap = row[1] as number | null;

  let value: number | null = null;

  // Extract the requested metric
  if (metric === 'spot' || metric === 'close' || metric === 'price') {
    value = price;
  } else if (metric === 'market_cap') {
    value = marketCap;
  } else {
    // Default to price
    value = price;
  }

  if (value === null) return null;

  const pct = threshold > 0 ? (value / threshold) * 100 : 0;

  return {
    observedValue: value,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (explicitDetails.thresholdUnit as string) || 'USD',
  };
}

/**
 * Batch fetch prices for multiple tickers. Used by the derived collector
 * for correlation calculations that need simultaneous price data.
 */
export async function fetchPrices(
  tickers: string[]
): Promise<Record<string, { price: number; marketCap: number | null }>> {
  const result: Record<string, { price: number; marketCap: number | null }> = {};

  // Group by exchange
  const byExchange: Record<string, Array<{ ticker: string; symbol: string }>> = {};
  for (const ticker of tickers) {
    const mapping = TICKER_MAP[ticker] || TICKER_MAP[ticker.toUpperCase()];
    if (!mapping) continue;
    if (!byExchange[mapping.exchange]) byExchange[mapping.exchange] = [];
    byExchange[mapping.exchange].push({ ticker, symbol: mapping.symbol });
  }

  // Fetch each exchange group
  for (const [exchange, symbols] of Object.entries(byExchange)) {
    const res = await fetch(`https://scanner.tradingview.com/${exchange}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: symbols.map(s => s.symbol) },
        columns: ['close', 'market_cap_calc'],
      }),
    });

    if (!res.ok) continue;
    const data = await res.json() as ScannerResponse;

    for (const item of data.data) {
      // Find the original ticker for this symbol
      const match = symbols.find(s => s.symbol === item.s);
      if (match) {
        result[match.ticker] = {
          price: item.d[0] as number,
          marketCap: item.d[1] as number | null,
        };
      }
    }
  }

  return result;
}
