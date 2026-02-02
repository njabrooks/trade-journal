/**
 * Coinbase Prime API client.
 * HMAC-SHA256 authenticated requests for fills and balances.
 *
 * Auth: 4 headers per request:
 *   X-CB-ACCESS-KEY, X-CB-ACCESS-PASSPHRASE,
 *   X-CB-ACCESS-TIMESTAMP, X-CB-ACCESS-SIGNATURE
 *
 * Signature = Base64(HMAC-SHA256(timestamp + method + pathOnly + body, signingKey))
 * Signing key is used as raw UTF-8 (not base64-decoded) for Prime API.
 * Query parameters are excluded from the signature message.
 */

import { createHmac } from 'crypto';

const CBP_BASE_URL = 'https://api.prime.coinbase.com';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  const accessKey = process.env.COINBASE_PRIME_ACCESS_KEY?.trim();
  const signingKey = process.env.COINBASE_PRIME_SIGNING_KEY?.trim();
  const passphrase = process.env.COINBASE_PRIME_PASSPHRASE?.trim();
  const portfolioId = process.env.COINBASE_PRIME_PORTFOLIO_ID?.trim();

  if (!accessKey || !signingKey || !passphrase || !portfolioId) {
    throw new Error(
      'Missing Coinbase Prime env vars. Required: COINBASE_PRIME_ACCESS_KEY, COINBASE_PRIME_SIGNING_KEY, COINBASE_PRIME_PASSPHRASE, COINBASE_PRIME_PORTFOLIO_ID'
    );
  }

  return { accessKey, signingKey, passphrase, portfolioId };
}

/**
 * Sign a request with HMAC-SHA256.
 * Returns the 4 auth headers.
 *
 * IMPORTANT: Only the URL path is signed (no query params, no base URL).
 * The signing key is used as raw UTF-8 string (not base64-decoded).
 */
function signRequest(
  method: string,
  fullPath: string,
  body: string = ''
): Record<string, string> {
  const { accessKey, signingKey, passphrase } = getConfig();

  // Strip query params — only path is signed
  const pathOnly = fullPath.split('?')[0];

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method.toUpperCase() + pathOnly + body;

  // Signing key used as raw UTF-8 for Prime API
  const signature = createHmac('sha256', signingKey)
    .update(message)
    .digest('base64');

  return {
    'X-CB-ACCESS-KEY': accessKey,
    'X-CB-ACCESS-PASSPHRASE': passphrase,
    'X-CB-ACCESS-TIMESTAMP': timestamp,
    'X-CB-ACCESS-SIGNATURE': signature,
  };
}

/**
 * Authenticated GET with retry + 429 backoff.
 */
async function cbpGet<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const authHeaders = signRequest('GET', path);
      const response = await fetch(`${CBP_BASE_URL}${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (response.status === 429) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[CBP] Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Coinbase Prime API error ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[CBP] Request failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Coinbase Prime API request failed after retries');
}

// ── Response Types ──────────────────────────────────────────────

export interface CBPFill {
  id: string;
  order_id: string;
  product_id: string;       // "BTC-USD"
  side: string;             // "BUY" | "SELL"
  filled_quantity: string;
  filled_value: string;
  price: string;
  commission: string;       // Trading commission
  venue: string;
  venue_fees: string;       // Additional venue fees
  time: string;             // ISO 8601 timestamp
}

interface CBPFillsResponse {
  fills: CBPFill[];
  pagination: {
    next_cursor: string;
    has_next: boolean;
    sort_direction: string;
  };
}

export interface CBPBalance {
  symbol: string;           // "BTC", "ETH" (already clean)
  amount: string;
  holds: string;
  fiat_amount: string;      // USD equivalent
  withdrawable_amount: string;
}

interface CBPBalancesResponse {
  balances: CBPBalance[];
}

// ── API Functions ───────────────────────────────────────────────

/**
 * Fetch fills for a portfolio with cursor pagination.
 * Sorts ascending by time so we can resume from cursor.
 */
export async function fetchFills(
  portfolioId: string,
  startDate?: string,
  cursor?: string
): Promise<CBPFillsResponse> {
  const params = new URLSearchParams({ sort_direction: 'ASC' });
  if (startDate) params.set('start_date', startDate);
  if (cursor) params.set('cursor', cursor);

  const path = `/v1/portfolios/${portfolioId}/fills?${params.toString()}`;
  return cbpGet<CBPFillsResponse>(path);
}

/**
 * Fetch all fills from a given start date, paginating through all pages.
 * Returns all fills plus the latest created_at timestamp for cursor storage.
 */
export async function fetchAllFills(
  portfolioId: string,
  startDate?: string
): Promise<{ fills: CBPFill[]; latestTimestamp: string | null }> {
  const allFills: CBPFill[] = [];
  let cursor: string | undefined;
  let latestTimestamp: string | null = null;

  while (true) {
    const response = await fetchFills(portfolioId, startDate, cursor);

    if (response.fills.length === 0) break;

    allFills.push(...response.fills);

    // Track latest timestamp
    for (const fill of response.fills) {
      if (!latestTimestamp || fill.time > latestTimestamp) {
        latestTimestamp = fill.time;
      }
    }

    if (!response.pagination.has_next) break;

    cursor = response.pagination.next_cursor;
  }

  return { fills: allFills, latestTimestamp };
}

/**
 * Fetch balances for a portfolio (single call, no pagination).
 */
export async function fetchBalances(portfolioId: string): Promise<CBPBalance[]> {
  const path = `/v1/portfolios/${portfolioId}/balances`;
  const response = await cbpGet<CBPBalancesResponse>(path);
  return response.balances;
}
