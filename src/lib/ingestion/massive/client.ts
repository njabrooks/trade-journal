/**
 * Shared Massive.com API client
 *
 * Handles authentication, URL building, and fetch with fallback auth strategies.
 * Used by all Massive ingestion modules (spot, optionsChain, iv30).
 */

const MASSIVE_BASE_URL = process.env.MASSIVE_API_BASE_URL || 'https://api.massive.com';

function requireApiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) {
    throw new Error('MASSIVE_API_KEY environment variable not set');
  }
  return key;
}

/**
 * Build a Massive API URL with the given path and query parameters.
 * apiKey is appended automatically; override by passing { apiKey: false } in opts.
 */
export function buildMassiveUrl(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  opts: { apiKey?: boolean } = {}
): string {
  const apiKey = requireApiKey();
  const url = new URL(path.startsWith('http') ? path : `${MASSIVE_BASE_URL}${path}`);
  if (opts.apiKey !== false) {
    url.searchParams.set('apiKey', apiKey);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Fetch from Massive with apiKey-in-URL first, falling back to Authorization header.
 * Throws descriptive errors for common status codes.
 */
export async function fetchMassive<T = unknown>(url: string): Promise<T> {
  let response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status === 404 || response.status === 401) {
    const apiKey = requireApiKey();
    const urlWithoutKey = url.replace(/[?&]apiKey=[^&]*/, '');
    response = await fetch(urlWithoutKey, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new Error('Massive API key invalid or expired');
    }
    if (response.status === 403) {
      throw new Error(
        `Massive API access denied (403) — endpoint may require paid tier. URL: ${url.replace(/apiKey=[^&]*/, 'apiKey=***')}`
      );
    }
    throw new Error(
      `Massive API error: ${response.status} ${response.statusText} — ${body.substring(0, 200)}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Calculate days-to-expiry from ISO date strings.
 */
export function calculateDte(expirationDate: string, currentDate: string): number | null {
  try {
    const expiry = new Date(expirationDate + 'T00:00:00Z');
    const current = new Date(currentDate + 'T00:00:00Z');
    const diffMs = expiry.getTime() - current.getTime();
    const dte = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return dte >= 0 ? dte : null;
  } catch {
    return null;
  }
}

/**
 * Determine the current trading day for snapshot labelling.
 *
 * Rules:
 * - Weekday, between 13:00 UTC (≈ 30 min before US open) and 23:59 UTC:
 *   today is the live trading day. Use it whether the user runs the scanner
 *   intraday OR after the 21:30 UTC nightly close.
 * - Weekday, before 13:00 UTC: market hasn't opened yet, use previous trading day.
 * - Saturday / Sunday: roll back to Friday.
 * - Does NOT handle NYSE holidays; specify date manually for holiday runs.
 *
 * Note: Massive's chain endpoint returns live intraday snapshots during market
 * hours, so labelling those rows with today's date is semantically correct.
 */
export function getLastTradingDay(now: Date = new Date()): string {
  const utcHour = now.getUTCHours();
  const day = new Date(now);
  const dow = day.getUTCDay();

  if (dow === 0) {
    // Sunday → Friday (two days back)
    day.setUTCDate(day.getUTCDate() - 2);
  } else if (dow === 6) {
    // Saturday → Friday
    day.setUTCDate(day.getUTCDate() - 1);
  } else if (utcHour < 13) {
    // Weekday but before market open — use previous trading day
    day.setUTCDate(day.getUTCDate() - 1);
    const prevDow = day.getUTCDay();
    if (prevDow === 0) day.setUTCDate(day.getUTCDate() - 2);
    else if (prevDow === 6) day.setUTCDate(day.getUTCDate() - 1);
  }
  return day.toISOString().split('T')[0]!;
}

/**
 * Shape of a single option contract in the Massive v3 options chain snapshot.
 * Subset of the actual response; additional fields accessible via `[key: string]: any`.
 */
export interface MassiveOptionContract {
  break_even_price?: number;
  day?: {
    change?: number;
    change_percent?: number;
    close?: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
    previous_close?: number;
    vwap?: number;
    last_updated?: number;
    [key: string]: unknown;
  };
  details?: {
    contract_type?: 'call' | 'put';
    strike_price?: number;
    expiration_date?: string;
    ticker?: string;
    shares_per_contract?: number;
    exercise_style?: string;
    [key: string]: unknown;
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    [key: string]: unknown;
  };
  implied_volatility?: number;
  last_quote?: {
    bid?: number;
    ask?: number;
    bid_size?: number;
    ask_size?: number;
    midpoint?: number;
    last_updated?: number;
    [key: string]: unknown;
  };
  last_trade?: {
    price?: number;
    size?: number;
    sip_timestamp?: number;
    [key: string]: unknown;
  };
  open_interest?: number;
  underlying_asset?: {
    price?: number;
    ticker?: string;
    [key: string]: unknown;
  };
  fmv?: number;
  [key: string]: unknown;
}

export interface MassiveOptionsChainResponse {
  status: string;
  request_id?: string;
  next_url?: string;
  results?: MassiveOptionContract[];
}

export interface MassiveDailyGroupedResponse {
  status: string;
  resultsCount?: number;
  results?: Array<{
    T: string;
    c?: number;
    o?: number;
    h?: number;
    l?: number;
    v?: number;
    [key: string]: unknown;
  }>;
}
