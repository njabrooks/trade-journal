/**
 * HyperLiquid position normalization.
 * Converts perp and spot positions to CryptoPositionInput for the positions table.
 */

import type { HLClearinghouseState, HLSpotBalance, HLDelegatorSummary } from './api';
import type { CryptoPositionInput } from '../crypto/types';
import type { CashBalanceInput } from '../crypto/cashBalances';
import { normalizeHyperliquidCoin } from '../crypto/pairNormalization';

/**
 * Normalize HyperLiquid perp positions from clearinghouse state.
 */
export function normalizeHLPerpPositions(
  state: HLClearinghouseState,
  accountId: string,
  markPrices: Map<string, number>,
  snapshotDate: string
): CryptoPositionInput[] {
  const results: CryptoPositionInput[] = [];

  for (const { position: pos } of state.assetPositions) {
    const szi = parseFloat(pos.szi);
    if (szi === 0) continue; // Skip flat positions

    const side = szi >= 0 ? 'LONG' as const : 'SHORT' as const;
    const absQty = Math.abs(szi);
    const spot = markPrices.get(pos.coin);
    const entryPx = parseFloat(pos.entryPx);
    const costBasis = entryPx * absQty;

    results.push({
      accountId,
      underlyingId: null, // Resolved later via ensureUnderlyingId
      assetClass: 'PERP',
      symbol: pos.coin.toUpperCase(),
      multiplier: '1',
      side,
      quantity: szi.toString(), // Signed
      avgPrice: pos.entryPx,
      costBasisMoney: costBasis.toFixed(6),
      positionType: side === 'LONG' ? 'perp_long' : 'perp_short',
      isOpen: true,
      spot: spot?.toString() ?? null,
      absNotional: pos.positionValue,
      marketValueUsd: pos.positionValue,
      unrealizedPnl: pos.unrealizedPnl,
      snapshotDate,
    });
  }

  return results;
}

/**
 * Normalize HyperLiquid spot balances from spot clearinghouse state.
 */
export function normalizeHLSpotPositions(
  balances: HLSpotBalance[],
  accountId: string,
  markPrices: Map<string, number>,
  spotMeta: Map<string, string>,
  snapshotDate: string
): CryptoPositionInput[] {
  const results: CryptoPositionInput[] = [];

  for (const balance of balances) {
    const total = parseFloat(balance.total);
    if (total === 0) continue;

    const symbol = normalizeHyperliquidCoin(balance.coin, spotMeta);

    // Skip stablecoins (settlement currencies, not positions)
    if (symbol === 'USDC' || symbol === 'USDT' || symbol === 'USD') continue;

    const spot = markPrices.get(symbol) ?? markPrices.get(balance.coin);
    const entryNtl = parseFloat(balance.entryNtl);
    const avgPrice = total !== 0 ? entryNtl / total : 0;
    const currentValue = spot ? total * spot : null;
    const unrealizedPnl = currentValue !== null ? currentValue - entryNtl : null;

    results.push({
      accountId,
      underlyingId: null,
      assetClass: 'CRYPTO',
      symbol,
      multiplier: '1',
      side: total > 0 ? 'LONG' : 'SHORT',
      quantity: total.toString(),
      avgPrice: avgPrice.toFixed(6),
      costBasisMoney: balance.entryNtl,
      positionType: total > 0 ? 'crypto_long' : 'crypto_short',
      isOpen: true,
      spot: spot?.toString() ?? null,
      absNotional: currentValue?.toFixed(6) ?? null,
      marketValueUsd: currentValue?.toFixed(6) ?? null,
      unrealizedPnl: unrealizedPnl?.toFixed(6) ?? null,
      snapshotDate,
    });
  }

  return results;
}

/**
 * Extract stablecoin balances from HyperLiquid spot state as cash.
 */
export function extractHLCashBalances(
  balances: HLSpotBalance[],
  withdrawable: string,
  accountId: string,
  spotMeta: Map<string, string>,
  snapshotDate: string
): CashBalanceInput[] {
  const results: CashBalanceInput[] = [];

  // Withdrawable margin cash (USD-denominated)
  const withdrawableAmount = parseFloat(withdrawable);
  if (withdrawableAmount > 0) {
    results.push({
      accountId,
      snapshotDate,
      currency: 'USD',
      balance: withdrawableAmount.toString(),
      balanceUsd: withdrawableAmount.toString(),
      source: 'hyperliquid',
    });
  }

  // Stablecoin spot balances
  for (const balance of balances) {
    const total = parseFloat(balance.total);
    if (total === 0) continue;

    const symbol = normalizeHyperliquidCoin(balance.coin, spotMeta);
    if (symbol !== 'USDC' && symbol !== 'USDT') continue;

    results.push({
      accountId,
      snapshotDate,
      currency: symbol,
      balance: total.toString(),
      balanceUsd: total.toString(),
      source: 'hyperliquid',
    });
  }

  return results;
}

/**
 * Normalize staked HYPE (delegations) into a CRYPTO position.
 * Uses delegatorSummary for total staked amount since individual validator
 * delegation details aren't needed for position tracking.
 */
export function normalizeHLStakedPosition(
  summary: HLDelegatorSummary,
  accountId: string,
  markPrices: Map<string, number>,
  snapshotDate: string
): CryptoPositionInput | null {
  const delegated = parseFloat(summary.delegated);
  if (delegated === 0) return null;

  const spot = markPrices.get('HYPE');
  const currentValue = spot ? delegated * spot : null;

  return {
    accountId,
    underlyingId: null,
    assetClass: 'CRYPTO',
    symbol: 'HYPE',
    multiplier: '1',
    side: 'LONG',
    quantity: delegated.toString(),
    avgPrice: null, // No entry price available from staking API
    costBasisMoney: null,
    positionType: 'crypto_staked',
    isOpen: true,
    spot: spot?.toString() ?? null,
    absNotional: currentValue?.toFixed(6) ?? null,
    marketValueUsd: currentValue?.toFixed(6) ?? null,
    unrealizedPnl: null, // Cannot compute without cost basis
    snapshotDate,
  };
}
