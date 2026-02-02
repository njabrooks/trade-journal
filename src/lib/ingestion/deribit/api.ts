/**
 * Deribit API client.
 * OAuth client credentials authentication with Bearer token.
 *
 * Auth flow:
 *   POST /public/auth with client_id + client_secret → access_token
 *   Then: Authorization: Bearer <access_token> for private endpoints
 *
 * Token is cached and auto-refreshed before expiry.
 */

const DERIBIT_BASE_URL = 'https://www.deribit.com/api/v2';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Rate limit delay between paginated requests
const PAGE_DELAY_MS = 500;

// Supported currencies to iterate over
const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'SOL', 'USDC'];

// Max trades per fetch (safety limit, consistent with other exchanges)
const MAX_TRADES_TOTAL = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  const clientId = process.env.DERIBIT_CLIENT_ID?.trim();
  const clientSecret = process.env.DERIBIT_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Deribit env vars. Required: DERIBIT_CLIENT_ID, DERIBIT_CLIENT_SECRET'
    );
  }

  return { clientId, clientSecret };
}

// ── Token Cache ─────────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Authenticate via client credentials grant.
 * Caches the token and refreshes when within 60s of expiry.
 */
async function authenticate(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch(`${DERIBIT_BASE_URL}/public/auth?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deribit auth failed ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    result: { access_token: string; expires_in: number };
  };

  cachedToken = {
    accessToken: data.result.access_token,
    expiresAt: Date.now() + data.result.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

/**
 * Authenticated GET with Bearer token, retry + 429 backoff.
 * Auto-refreshes token on 401.
 */
async function deribitGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const token = await authenticate();
      const queryString = params
        ? '?' + new URLSearchParams(params).toString()
        : '';
      const url = `${DERIBIT_BASE_URL}${path}${queryString}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 429) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Deribit] Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (response.status === 401) {
        // Token expired, force re-auth
        cachedToken = null;
        const delay = BASE_DELAY_MS;
        console.warn(`[Deribit] Unauthorized (401), re-authenticating...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Deribit API error ${response.status}: ${text}`);
      }

      const json = (await response.json()) as { result: T };
      return json.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Deribit] Request failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Deribit API request failed after retries');
}

/**
 * Unauthenticated GET for public endpoints.
 */
async function deribitPublicGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const queryString = params
        ? '?' + new URLSearchParams(params).toString()
        : '';
      const url = `${DERIBIT_BASE_URL}${path}${queryString}`;

      const response = await fetch(url, { method: 'GET' });

      if (response.status === 429) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Deribit] Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Deribit public API error ${response.status}: ${text}`);
      }

      const json = (await response.json()) as { result: T };
      return json.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Deribit] Public request failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Deribit public API request failed after retries');
}

// ── Response Types ──────────────────────────────────────────────

export interface DeribitTrade {
  trade_id: string;
  order_id: string;
  instrument_name: string; // "BTC_USDC" for spot, "BTC-PERPETUAL" for perps, "BTC-25JAN26-100000-C" for options
  direction: string;       // "buy" | "sell"
  amount: number;          // Size in base currency
  price: number;           // Price
  index_price: number;     // Index price at time of trade
  fee: number;             // Fee amount
  fee_currency: string;    // Fee currency
  timestamp: number;       // Unix milliseconds
  state: string;           // "filled" etc.
  trade_seq: number;
  tick_direction: number;
}

interface DeribitTradesResponse {
  trades: DeribitTrade[];
  has_more: boolean;
}

export interface DeribitAccountSummary {
  currency: string;
  equity: number;
  balance: number;
  available_withdrawal_funds: number;
  available_funds: number;
  margin_balance: number;
  maintenance_margin: number;
  initial_margin: number;
}

interface DeribitIndexPriceResponse {
  index_price: number;
  estimated_delivery_price?: number;
}

// ── API Functions ───────────────────────────────────────────────

/**
 * Fetch user trades by currency, paginated.
 * Uses start_timestamp for incremental fetching.
 */
export async function fetchUserTradesByCurrency(
  currency: string,
  startTimestamp?: number,
  count: number = 1000
): Promise<DeribitTradesResponse> {
  const params: Record<string, string> = {
    currency,
    count: count.toString(),
    include_old: 'true',
    sorting: 'asc',
  };
  if (startTimestamp !== undefined) {
    params.start_timestamp = startTimestamp.toString();
  }

  return deribitGet<DeribitTradesResponse>(
    '/private/get_user_trades_by_currency',
    params
  );
}

/**
 * Fetch all trades across supported currencies from a start timestamp.
 * Paginates each currency, merges all trades, sorts by timestamp.
 */
export async function fetchAllTrades(
  startTimestamp?: number
): Promise<{ trades: DeribitTrade[]; latestTimestamp: number | null }> {
  const allTrades: DeribitTrade[] = [];
  let latestTimestamp: number | null = null;

  for (const currency of SUPPORTED_CURRENCIES) {
    let currencyStart = startTimestamp;
    let tradeCount = 0;

    while (tradeCount < MAX_TRADES_TOTAL) {
      const response = await fetchUserTradesByCurrency(currency, currencyStart);

      if (response.trades.length === 0) break;

      allTrades.push(...response.trades);
      tradeCount += response.trades.length;

      // Track latest timestamp across all currencies
      for (const trade of response.trades) {
        if (latestTimestamp === null || trade.timestamp > latestTimestamp) {
          latestTimestamp = trade.timestamp;
        }
      }

      if (!response.has_more) break;

      // Next page starts after the latest trade in this batch
      const maxTs = Math.max(...response.trades.map((t) => t.timestamp));
      currencyStart = maxTs + 1;

      await sleep(PAGE_DELAY_MS);
    }
  }

  // Sort all trades by timestamp
  allTrades.sort((a, b) => a.timestamp - b.timestamp);

  return { trades: allTrades, latestTimestamp };
}

/**
 * Fetch account summary (balance info) for a single currency.
 */
export async function fetchAccountSummary(
  currency: string
): Promise<DeribitAccountSummary> {
  return deribitGet<DeribitAccountSummary>('/private/get_account_summary', {
    currency,
  });
}

/**
 * Fetch account summaries across all supported currencies.
 * Skips currencies that return errors (not all accounts have all currencies).
 */
export async function fetchAllAccountSummaries(): Promise<DeribitAccountSummary[]> {
  const summaries: DeribitAccountSummary[] = [];

  for (const currency of SUPPORTED_CURRENCIES) {
    try {
      const summary = await fetchAccountSummary(currency);
      summaries.push(summary);
    } catch (error) {
      // Some currencies may not be enabled on the account
      console.warn(`[Deribit] Could not fetch account summary for ${currency}: ${error}`);
    }
  }

  return summaries;
}

/**
 * Fetch index price for a currency (public, no auth).
 * Index names: "btc_usd", "eth_usd", "sol_usd", etc.
 */
export async function fetchIndexPrice(
  indexName: string
): Promise<number> {
  const result = await deribitPublicGet<DeribitIndexPriceResponse>(
    '/public/get_index_price',
    { index_name: indexName }
  );
  return result.index_price;
}

/**
 * Fetch index prices for all supported currencies.
 * Returns a map of currency → USD price.
 */
export async function fetchAllIndexPrices(): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  // Index name format: {currency}_usd (lowercase)
  const indexNames: Record<string, string> = {
    BTC: 'btc_usd',
    ETH: 'eth_usd',
    SOL: 'sol_usd',
  };

  for (const [currency, indexName] of Object.entries(indexNames)) {
    try {
      const price = await fetchIndexPrice(indexName);
      prices.set(currency, price);
    } catch (error) {
      console.warn(`[Deribit] Could not fetch index price for ${currency}: ${error}`);
    }
  }

  return prices;
}
