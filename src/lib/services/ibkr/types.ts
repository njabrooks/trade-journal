/**
 * IBKR API Type Definitions
 */

/**
 * Market data snapshot response from IBKR API
 * Fields are returned as string keys (e.g., "31", "84", "7283")
 */
export interface MarketDataSnapshot {
  conid: number;
  conidEx?: string;
  _updated?: number;
  server_id?: string;
  [fieldId: string]: string | number | undefined; // Field values keyed by field ID
}

/**
 * Market data snapshot API response
 */
export interface MarketDataSnapshotResponse extends Array<MarketDataSnapshot> {}

/**
 * Contract search result
 */
export interface ContractSearchResult {
  conid: string;
  symbol: string;
  companyName?: string;
  description?: string;
  exchange?: string;
  secType?: string;
  strike?: number | null;
  right?: string | null;
  expiry?: string | null;
  sections?: Array<{
    secType: string;
    months?: string;
    exchange?: string;
    conid?: string;
  }>;
}

/**
 * Contract search API response
 */
export interface ContractSearchResponse extends Array<ContractSearchResult> {}

/**
 * Historical data bar
 */
export interface HistoricalBar {
  o: number; // Open
  c: number; // Close
  h: number; // High
  l: number; // Low
  v: number; // Volume
  t: number; // Timestamp (ms)
}

/**
 * Historical data response
 */
export interface HistoricalDataResponse {
  symbol: string;
  text: string;
  data: HistoricalBar[];
  serverId?: string;
  priceFactor?: number;
  startTime?: string;
  timePeriod?: string;
  barLength?: number;
}

/**
 * Authentication status
 */
export interface AuthStatus {
  authenticated: boolean;
  connected: boolean;
  competing: boolean;
  message: string;
  MAC?: string;
  serverInfo?: {
    serverName: string;
    serverVersion: string;
  };
  fail?: string;
}

/**
 * IV snapshot compatible with existing ingestion system
 */
export interface IvSnapshot {
  date: string; // 'YYYY-MM-DD'
  ticker: string;
  spot: number | null;
  iv30: number | null; // decimal (0.477 for 47.7%)
  source: 'ibkr';
}

/**
 * Market data field constants
 */
export const MARKET_DATA_FIELDS = {
  LAST: '31',        // Last price (spot)
  BID: '84',         // Bid price
  ASK: '86',         // Ask price
  IV30: '7283',      // Option Implied Vol % (30-day forward) - for underlying
  IV_STRIKE: '7633', // Implied Vol % for specific option strike
  DELTA: '7308',     // Delta
  GAMMA: '7309',     // Gamma
  THETA: '7310',     // Theta
  VEGA: '7311',      // Vega
} as const;

