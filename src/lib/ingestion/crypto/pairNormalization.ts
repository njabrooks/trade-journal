/**
 * Exchange-specific pair/ticker normalization.
 * Converts exchange-specific identifiers to canonical tickers
 * used in the underlyings table (e.g., "BTC", "ETH", "SOL").
 */

// Kraken uses X/Z prefix convention for legacy reasons
const KRAKEN_ASSET_MAP: Record<string, string> = {
  XXBT: 'BTC',
  XBT: 'BTC',
  XETH: 'ETH',
  XXRP: 'XRP',
  XLTC: 'LTC',
  XXLM: 'XLM',
  XDOT: 'DOT',
  XXDG: 'DOGE',
  XDG: 'DOGE',
  XZEC: 'ZEC',
  XXMR: 'XMR',
  XREP: 'REP',
  XETC: 'ETC',
  XMLN: 'MLN',
};

// Quote currencies to strip from Kraken pairs
const KRAKEN_QUOTE_SUFFIXES = ['ZUSD', 'ZEUR', 'ZGBP', 'ZCAD', 'ZJPY', 'USD', 'EUR', 'GBP', 'CAD', 'JPY', 'USDT', 'USDC'];

/**
 * Normalize HyperLiquid coin names.
 * Perps: already clean ("BTC", "ETH").
 * Spot: indexed format ("@1", "@2") requires spotMeta lookup.
 */
export function normalizeHyperliquidCoin(
  coin: string,
  spotMeta?: Map<string, string>
): string {
  if (coin.startsWith('@') && spotMeta) {
    return spotMeta.get(coin)?.toUpperCase() ?? coin;
  }
  return coin.toUpperCase();
}

/**
 * Normalize Coinbase Prime product_id to canonical ticker.
 * "BTC-USD" → "BTC", "ETH-USDC" → "ETH"
 */
export function normalizeCoinbasePrimePair(productId: string): string {
  return productId.split('-')[0].toUpperCase();
}

/**
 * Extract quote currency from Coinbase Prime product_id.
 * "BTC-USD" → "USD", "ETH-USDC" → "USDC"
 */
export function extractCoinbasePrimeQuoteCurrency(productId: string): string {
  return productId.split('-')[1]?.toUpperCase() ?? 'USD';
}

/**
 * Extract quote currency from Kraken pair name.
 * "XXBTZUSD" → "USD", "XETHZEUR" → "EUR", "SOLUSD" → "USD"
 */
export function extractKrakenQuoteCurrency(pair: string): string {
  for (const suffix of KRAKEN_QUOTE_SUFFIXES.sort((a, b) => b.length - a.length)) {
    if (pair.endsWith(suffix)) {
      return suffix.startsWith('Z') ? suffix.slice(1) : suffix;
    }
  }
  return 'USD';
}

/**
 * Normalize Kraken pair names to canonical ticker.
 * "XXBTZUSD" → "BTC", "XETHZEUR" → "ETH", "SOLUSD" → "SOL"
 */
export function normalizeKrakenPair(pair: string): string {
  // Strip quote currency suffix (try longest match first)
  let base = pair;
  for (const suffix of KRAKEN_QUOTE_SUFFIXES.sort((a, b) => b.length - a.length)) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }

  // Check known mappings
  if (KRAKEN_ASSET_MAP[base]) {
    return KRAKEN_ASSET_MAP[base];
  }

  // Strip leading X if result is > 3 chars (legacy Kraken convention)
  if (base.startsWith('X') && base.length > 3) {
    base = base.slice(1);
  }

  return base.toUpperCase();
}
