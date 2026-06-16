/**
 * HyperLiquid Info API client.
 * All read endpoints use POST to https://api.hyperliquid.xyz/info with a `type` discriminator.
 * No authentication needed for reads — user is identified by wallet address.
 */

const HL_API_URL = 'https://api.hyperliquid.xyz/info';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Post to the HyperLiquid info endpoint with retry logic.
 */
async function hlPost<T>(body: Record<string, unknown>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(HL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        // Rate limited — exponential backoff
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[HL] Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HyperLiquid API error ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[HL] Request failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('HyperLiquid API request failed after retries');
}

// ── API Response Types ─────────────────────────────────────────────

export interface HLFill {
  tid: number;
  coin: string;
  side: string;       // "B" (buy) or "A" (ask/sell)
  px: string;
  sz: string;
  fee: string;
  feeToken: string;
  time: number;        // Unix ms
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  dir?: string;        // "Open Long", "Close Short", etc.
  cloid?: string;
  builderFee?: string;
}

export interface HLPerpPosition {
  coin: string;
  szi: string;         // Signed size (negative = short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  marginUsed: string;
  liquidationPx: string | null;
  leverage: { type: string; value: number };
  returnOnEquity: string;
  maxLeverage: number;
  cumFunding: {
    allTime: string;
    sinceChange: string;
    sinceOpen: string;
  };
}

export interface HLClearinghouseState {
  assetPositions: Array<{
    position: HLPerpPosition;
    type: string;
  }>;
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalMarginUsed: string;
  };
  withdrawable: string;
  time: number;
}

export interface HLSpotBalance {
  coin: string;
  total: string;
  hold: string;
  entryNtl: string;
  token: number;
}

export interface HLSpotClearinghouseState {
  balances: HLSpotBalance[];
}

export interface HLSpotMetaResponse {
  universe: Array<{
    tokens: number[];
    name: string;       // e.g., "PURR/USDC"
    index: number;
    isCanonical: boolean;
  }>;
  tokens: Array<{
    name: string;       // e.g., "USDC", "PURR", "HFUN"
    index: number;
    szDecimals: number;
    weiDecimals: number;
    tokenId: string;
    isCanonical: boolean;
  }>;
}

// ── API Functions ──────────────────────────────────────────────────

/**
 * Fetch user fills by time range. Max 500 per call.
 */
export async function fetchFillsByTime(
  user: string,
  startTime: number,
  endTime?: number
): Promise<HLFill[]> {
  const body: Record<string, unknown> = {
    type: 'userFillsByTime',
    user,
    startTime,
  };
  if (endTime !== undefined) {
    body.endTime = endTime;
  }
  return hlPost<HLFill[]>(body);
}

/**
 * Fetch all fills for a user (recent, max 2000, optionally filtered by coin).
 */
export async function fetchUserFills(
  user: string,
  coin?: string
): Promise<HLFill[]> {
  const body: Record<string, unknown> = {
    type: 'userFills',
    user,
  };
  // The aggregateByTime variant returns all fills without coin filter
  return hlPost<HLFill[]>(body);
}

/**
 * Fetch perpetual positions (clearinghouse state).
 */
export async function fetchClearinghouseState(
  user: string
): Promise<HLClearinghouseState> {
  return hlPost<HLClearinghouseState>({
    type: 'clearinghouseState',
    user,
  });
}

/**
 * Fetch spot balances (spot clearinghouse state).
 */
export async function fetchSpotClearinghouseState(
  user: string
): Promise<HLSpotClearinghouseState> {
  return hlPost<HLSpotClearinghouseState>({
    type: 'spotClearinghouseState',
    user,
  });
}

// ── Staking / Delegation ───────────────────────────────────────────

export interface HLDelegation {
  validator: string;
  amount: string;
  lockedUntilTimestamp: number;
}

export interface HLDelegatorSummary {
  delegated: string;
  undelegated: string;
  totalPendingWithdrawal: string;
  nPendingWithdrawals: number;
}

/**
 * Fetch delegations (staked HYPE) for a user.
 * Returns per-validator delegation amounts.
 */
export async function fetchDelegations(user: string): Promise<HLDelegation[]> {
  return hlPost<HLDelegation[]>({
    type: 'delegations',
    user,
  });
}

/**
 * Fetch delegator summary (total staked/undelegated/pending).
 */
export async function fetchDelegatorSummary(user: string): Promise<HLDelegatorSummary> {
  return hlPost<HLDelegatorSummary>({
    type: 'delegatorSummary',
    user,
  });
}

/**
 * Fetch mid prices for all listed assets.
 * Returns a map of coin → mid price string.
 */
export async function fetchAllMids(): Promise<Record<string, string>> {
  return hlPost<Record<string, string>>({
    type: 'allMids',
  });
}

/**
 * Fetch spot metadata (token index → name mapping).
 */
export async function fetchSpotMeta(): Promise<HLSpotMetaResponse> {
  return hlPost<HLSpotMetaResponse>({
    type: 'spotMeta',
  });
}

/**
 * Build a token index → coin name map from spot metadata.
 * Maps "@{index}" → "TOKEN_NAME" for normalizing spot positions/fills.
 *
 * The spotMeta response has:
 * - `tokens[]`: token definitions with name and index
 * - `universe[]`: trading pairs referencing token indices
 *
 * We map token index → token name for resolving "@1", "@2" etc.
 */
export function buildSpotMetaMap(spotMeta: HLSpotMetaResponse): Map<string, string> {
  const map = new Map<string, string>();
  for (const token of spotMeta.tokens) {
    map.set(`@${token.index}`, token.name.toUpperCase());
  }
  return map;
}

// ── Portfolio (authoritative account value) ─────────────────────────

export interface HLPortfolioPeriod {
  accountValueHistory: Array<[number, string]>; // [unixMs, valueUsd]
  pnlHistory: Array<[number, string]>;
  vlm: string;
}

/**
 * Fetch the portfolio summary — HyperLiquid's own account-value history.
 * Returns periods as [["day", {...}], ["week", {...}], ["month", {...}],
 * ["allTime", {...}], ["perpDay", {...}], ...]. The NON-perp periods carry the
 * COMBINED account value (spot incl. unified perp equity + staking) — i.e. the
 * "Account Value" the HyperLiquid UI shows. The "perp*" periods are perp-only.
 */
export async function fetchPortfolio(
  user: string
): Promise<Array<[string, HLPortfolioPeriod]>> {
  return hlPost<Array<[string, HLPortfolioPeriod]>>({
    type: 'portfolio',
    user,
  });
}

// Combined (whole-account) periods — excludes the perp-only "perp*" series.
const HL_COMBINED_PERIODS = new Set(['day', 'week', 'month', 'allTime']);

/**
 * Extract the latest authoritative account value (USD) from a portfolio response.
 * Scans only the combined (non-perp) periods and returns the most-recent point.
 * Returns 0 if unavailable (caller should fall back rather than write a zero NAV).
 */
export function latestAccountValue(
  portfolio: Array<[string, HLPortfolioPeriod]>
): number {
  let best: [number, string] | null = null;
  for (const [key, period] of portfolio) {
    if (!HL_COMBINED_PERIODS.has(key)) continue;
    const history = period?.accountValueHistory ?? [];
    const last = history[history.length - 1];
    if (last && (!best || last[0] > best[0])) best = last;
  }
  return best ? parseFloat(best[1]) : 0;
}

/**
 * Build a date (YYYY-MM-DD, UTC) → account value map from a portfolio response,
 * for historical backfill. Merges all combined (non-perp) series so coverage is
 * daily for ~the last 30 days ("month"/"week"/"day") and ~weekly before ("allTime").
 * Series are merged coarse→fine so the denser recent series win on shared days, and
 * within a day the latest point wins (end-of-day value).
 */
export function accountValueByDate(
  portfolio: Array<[string, HLPortfolioPeriod]>
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const key of ['allTime', 'month', 'week', 'day']) {
    const period = portfolio.find(([k]) => k === key)?.[1];
    for (const [ts, val] of period?.accountValueHistory ?? []) {
      const day = new Date(ts).toISOString().slice(0, 10);
      byDate.set(day, parseFloat(val));
    }
  }
  return byDate;
}
