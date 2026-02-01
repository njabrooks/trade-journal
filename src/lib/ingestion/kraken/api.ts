/**
 * Kraken API client.
 * HMAC-SHA512 authenticated requests for trades, balances, and positions.
 *
 * Auth: 2 headers per request:
 *   API-Key, API-Sign
 *
 * Signature = Base64(HMAC-SHA512(Base64Decode(secret), urlPath + SHA256(nonce + postData)))
 * All private endpoints are POST with application/x-www-form-urlencoded body.
 * Nonce is monotonically increasing (Date.now() milliseconds).
 */

import { createHmac, createHash } from 'crypto';

const KRAKEN_BASE_URL = 'https://api.kraken.com';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Rate limit: TradesHistory costs 2, others cost 1. Max 20, decay 1/sec.
const TRADES_PAGE_DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  const apiKey = process.env.KRAKEN_API_KEY;
  const apiSecret = process.env.KRAKEN_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      'Missing Kraken env vars. Required: KRAKEN_API_KEY, KRAKEN_API_SECRET'
    );
  }

  return { apiKey, apiSecret };
}

/**
 * Sign a request with HMAC-SHA512.
 * Returns the API-Sign header value.
 *
 * Signature = Base64(HMAC-SHA512(Base64Decode(secret), urlPath + SHA256(nonce + postData)))
 */
function signRequest(
  urlPath: string,
  nonce: string,
  postData: string,
  apiSecret: string
): string {
  // SHA256(nonce + postData) — nonce is prepended to the URL-encoded body
  const sha256Hash = createHash('sha256')
    .update(nonce + postData)
    .digest();

  const message = Buffer.concat([
    Buffer.from(urlPath),
    sha256Hash,
  ]);

  const secretBuffer = Buffer.from(apiSecret, 'base64');
  return createHmac('sha512', secretBuffer)
    .update(message)
    .digest('base64');
}

/**
 * Authenticated POST with retry + rate limit backoff.
 */
async function krakenPost<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const { apiKey, apiSecret } = getConfig();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const nonce = Date.now().toString();
      const bodyParams = new URLSearchParams({ nonce, ...params });
      const postData = bodyParams.toString();
      const signature = signRequest(path, nonce, postData, apiSecret);

      const response = await fetch(`${KRAKEN_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'API-Key': apiKey,
          'API-Sign': signature,
        },
        body: postData,
      });

      if (response.status === 429) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Kraken] Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Kraken API HTTP error ${response.status}: ${text}`);
      }

      const json = await response.json() as { error: string[]; result: T };

      if (json.error && json.error.length > 0) {
        const errorMsg = json.error.join(', ');
        // Rate limit errors are retryable
        if (errorMsg.includes('EAPI:Rate limit')) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[Kraken] API rate limit, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw new Error(`Kraken API error: ${errorMsg}`);
      }

      return json.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Kraken] Request failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Kraken API request failed after retries');
}

// ── Response Types ──────────────────────────────────────────────

export interface KrakenTrade {
  ordertxid: string;
  postxid: string;
  pair: string;
  time: number;
  type: string;
  ordertype: string;
  price: string;
  cost: string;
  fee: string;
  vol: string;
  margin: string;
  misc: string;
  trade_id: number;
}

interface KrakenTradesResult {
  trades: Record<string, KrakenTrade>;
  count: number;
}

export interface KrakenOpenPosition {
  ordertxid: string;
  posstatus: string;
  pair: string;
  time: number;
  type: string;
  ordertype: string;
  cost: string;
  fee: string;
  vol: string;
  vol_closed: string;
  margin: string;
  value: string;
  net: string;
}

interface KrakenTickerInfo {
  c: [string, string]; // [price, lot volume] - last trade closed
  // Other fields exist but we only need 'c' for last price
}

// ── API Functions ───────────────────────────────────────────────

/**
 * Fetch trades history with offset pagination.
 * Returns up to 50 trades per call. Rate cost: 2.
 */
export async function fetchTradesHistory(
  ofs?: number,
  start?: number
): Promise<{ trades: Record<string, KrakenTrade>; count: number }> {
  const params: Record<string, string> = {};
  if (ofs !== undefined) params.ofs = ofs.toString();
  if (start !== undefined) params.start = start.toString();

  return krakenPost<KrakenTradesResult>('/0/private/TradesHistory', params);
}

/**
 * Fetch all trades from a given start timestamp, paginating through all pages.
 * Returns all trades plus the latest timestamp for cursor storage.
 */
export async function fetchAllTrades(
  startTimestamp?: number
): Promise<{ trades: Array<{ id: string; trade: KrakenTrade }>; latestTimestamp: number | null }> {
  const allTrades: Array<{ id: string; trade: KrakenTrade }> = [];
  let offset = 0;
  let latestTimestamp: number | null = null;

  while (true) {
    const response = await fetchTradesHistory(offset, startTimestamp);
    const tradeEntries = Object.entries(response.trades);

    if (tradeEntries.length === 0) break;

    for (const [id, trade] of tradeEntries) {
      allTrades.push({ id, trade });
      if (latestTimestamp === null || trade.time > latestTimestamp) {
        latestTimestamp = trade.time;
      }
    }

    // Kraken returns 50 per page
    if (tradeEntries.length < 50) break;

    offset += tradeEntries.length;

    // Safety limit
    if (allTrades.length >= 10000) {
      console.warn('[Kraken] Hit 10K trade safety limit, stopping pagination');
      break;
    }

    // Rate limit delay (TradesHistory costs 2)
    await sleep(TRADES_PAGE_DELAY_MS);
  }

  return { trades: allTrades, latestTimestamp };
}

/**
 * Fetch account balances (single call, no pagination).
 * Returns asset → balance amount mapping.
 */
export async function fetchBalance(): Promise<Record<string, string>> {
  return krakenPost<Record<string, string>>('/0/private/Balance');
}

/**
 * Fetch open margin positions (single call).
 * Uses docalcs=true to include value and net PnL.
 */
export async function fetchOpenPositions(): Promise<Record<string, KrakenOpenPosition>> {
  return krakenPost<Record<string, KrakenOpenPosition>>(
    '/0/private/OpenPositions',
    { docalcs: 'true' }
  );
}

/**
 * Fetch current ticker prices for given pairs (public endpoint, no auth).
 * Used to compute absNotional for spot positions.
 */
export async function fetchTickerPrices(
  pairs: string[]
): Promise<Record<string, string>> {
  if (pairs.length === 0) return {};

  const url = `${KRAKEN_BASE_URL}/0/public/Ticker?pair=${pairs.join(',')}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kraken Ticker API error ${response.status}: ${text}`);
  }

  const json = await response.json() as { error: string[]; result: Record<string, KrakenTickerInfo> };

  if (json.error && json.error.length > 0) {
    throw new Error(`Kraken Ticker API error: ${json.error.join(', ')}`);
  }

  const prices: Record<string, string> = {};
  for (const [pair, info] of Object.entries(json.result)) {
    prices[pair] = info.c[0]; // Last trade price
  }
  return prices;
}
