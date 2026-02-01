/**
 * Kraken position normalization.
 * Combines spot balances and margin open positions into CryptoPositionInput.
 *
 * Spot positions: No cost basis (deferred to #ENH-051).
 *   Spot prices fetched from Kraken public Ticker endpoint.
 * Margin positions: Cost basis and unrealized PnL from Kraken API (docalcs=true).
 */

import type { KrakenOpenPosition } from './api';
import type { CryptoPositionInput } from '../crypto/types';
import { normalizeKrakenPair } from '../crypto/pairNormalization';

// Kraken balance keys to skip (fiat currencies and stablecoins)
const SKIP_ASSETS = new Set([
  'ZUSD', 'ZEUR', 'ZGBP', 'ZCAD', 'ZJPY',
  'USD', 'EUR', 'GBP', 'CAD', 'JPY',
  'USDC', 'USDT', 'DAI', 'PYUSD',
]);

// Map Kraken balance asset keys to canonical tickers
const BALANCE_ASSET_MAP: Record<string, string> = {
  XXBT: 'BTC',
  XBT: 'BTC',
  XETH: 'ETH',
  XXRP: 'XRP',
  XLTC: 'LTC',
  XXLM: 'XLM',
  XDOT: 'DOT',
  XXDG: 'DOGE',
  XZEC: 'ZEC',
  XXMR: 'XMR',
  XREP: 'REP',
  XETC: 'ETC',
  XMLN: 'MLN',
};

// Map canonical tickers to Kraken pair names for Ticker API lookups
const TICKER_PAIR_MAP: Record<string, string> = {
  BTC: 'XXBTZUSD',
  ETH: 'XETHZUSD',
  XRP: 'XXRPZUSD',
  LTC: 'XLTCZUSD',
  XLM: 'XXLMZUSD',
  DOT: 'DOTUSD',
  DOGE: 'XDGUSD',
  ZEC: 'XZECZUSD',
  XMR: 'XXMRZUSD',
  ETC: 'XETCZUSD',
  SOL: 'SOLUSD',
  ADA: 'ADAUSD',
  AVAX: 'AVAXUSD',
  LINK: 'LINKUSD',
  MATIC: 'MATICUSD',
  ATOM: 'ATOMUSD',
  UNI: 'UNIUSD',
  AAVE: 'AAVEUSD',
};

function normalizeBalanceKey(key: string): string {
  if (BALANCE_ASSET_MAP[key]) return BALANCE_ASSET_MAP[key];
  // Strip leading X if > 3 chars (legacy Kraken convention)
  if (key.startsWith('X') && key.length > 3) return key.slice(1).toUpperCase();
  return key.toUpperCase();
}

/**
 * Get Kraken pair name for Ticker API lookup.
 * Falls back to {symbol}USD for unknown assets.
 */
export function getTickerPair(symbol: string): string {
  return TICKER_PAIR_MAP[symbol] ?? `${symbol}USD`;
}

/**
 * Normalize Kraken balances into position inputs.
 * Skips fiat and stablecoins (settlement currencies, not positions).
 */
export function normalizeKrakenBalances(
  balances: Record<string, string>,
  tickerPrices: Record<string, string>,
  accountId: string,
  snapshotDate: string
): CryptoPositionInput[] {
  const results: CryptoPositionInput[] = [];

  for (const [key, amountStr] of Object.entries(balances)) {
    const amount = parseFloat(amountStr);
    if (amount === 0) continue;
    if (SKIP_ASSETS.has(key)) continue;

    const symbol = normalizeBalanceKey(key);
    if (SKIP_ASSETS.has(symbol)) continue;

    // Look up spot price from ticker data
    const pairKey = getTickerPair(symbol);
    // Ticker response keys may differ from request keys, check both
    let spotPrice: number | null = null;
    for (const [tickerKey, price] of Object.entries(tickerPrices)) {
      if (tickerKey === pairKey || tickerKey.includes(symbol)) {
        spotPrice = parseFloat(price);
        break;
      }
    }

    const absNotional = spotPrice ? Math.abs(amount) * spotPrice : null;

    results.push({
      accountId,
      underlyingId: null,
      assetClass: 'CRYPTO',
      symbol,
      multiplier: '1',
      side: amount > 0 ? 'LONG' : 'SHORT',
      quantity: Math.abs(amount).toString(),
      avgPrice: null,
      costBasisMoney: null,
      positionType: amount > 0 ? 'crypto_long' : 'crypto_short',
      isOpen: true,
      spot: spotPrice?.toFixed(6) ?? null,
      absNotional: absNotional?.toFixed(6) ?? null,
      unrealizedPnl: null,
      snapshotDate,
    });
  }

  return results;
}

/**
 * Normalize Kraken open margin positions into position inputs.
 * Uses Kraken's calculated fields (value, net) from docalcs=true.
 */
export function normalizeKrakenOpenPositions(
  openPositions: Record<string, KrakenOpenPosition>,
  accountId: string,
  snapshotDate: string
): CryptoPositionInput[] {
  const results: CryptoPositionInput[] = [];

  for (const [_posId, pos] of Object.entries(openPositions)) {
    if (pos.posstatus !== 'open') continue;

    const symbol = normalizeKrakenPair(pos.pair);
    const totalVol = parseFloat(pos.vol);
    const closedVol = parseFloat(pos.vol_closed);
    const remainingVol = totalVol - closedVol;

    if (remainingVol <= 0) continue;

    const value = parseFloat(pos.value) || null;
    const cost = parseFloat(pos.cost) || null;
    const net = parseFloat(pos.net) || null;
    const spotPrice = value && remainingVol > 0 ? value / remainingVol : null;
    const avgPrice = cost && totalVol > 0 ? cost / totalVol : null;

    const side = pos.type === 'buy' ? 'LONG' : 'SHORT';

    results.push({
      accountId,
      underlyingId: null,
      assetClass: 'CRYPTO',
      symbol,
      multiplier: '1',
      side: side as 'LONG' | 'SHORT',
      quantity: remainingVol.toString(),
      avgPrice: avgPrice?.toFixed(6) ?? null,
      costBasisMoney: cost?.toFixed(6) ?? null,
      positionType: side === 'LONG' ? 'crypto_long' : 'crypto_short',
      isOpen: true,
      spot: spotPrice?.toFixed(6) ?? null,
      absNotional: value?.toFixed(6) ?? null,
      unrealizedPnl: net?.toFixed(6) ?? null,
      snapshotDate,
    });
  }

  return results;
}
