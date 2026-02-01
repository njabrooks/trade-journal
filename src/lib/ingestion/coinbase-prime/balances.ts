/**
 * Coinbase Prime balance normalization.
 * Converts CBP balances to CryptoPositionInput for the positions table.
 *
 * Note: No cost basis available from the balances endpoint.
 * avgPrice, costBasisMoney, and unrealizedPnl are null.
 * See #ENH-051 for future cost basis computation from fills.
 */

import type { CBPBalance } from './api';
import type { CryptoPositionInput } from '../crypto/types';

const STABLECOINS = new Set(['USD', 'USDC', 'USDT']);

/**
 * Normalize Coinbase Prime balances into position inputs.
 * Skips stablecoins (settlement currencies, not positions).
 */
export function normalizeCBPBalances(
  balances: CBPBalance[],
  accountId: string,
  snapshotDate: string
): CryptoPositionInput[] {
  const results: CryptoPositionInput[] = [];

  for (const balance of balances) {
    const amount = parseFloat(balance.amount);
    if (amount === 0) continue;

    const symbol = balance.symbol.toUpperCase();
    if (STABLECOINS.has(symbol)) continue;

    const fiatAmount = parseFloat(balance.fiat_amount);
    const spot = amount !== 0 && fiatAmount > 0 ? fiatAmount / amount : null;

    results.push({
      accountId,
      underlyingId: null, // Resolved later via ensureUnderlyingId
      assetClass: 'CRYPTO',
      symbol,
      multiplier: '1',
      side: amount > 0 ? 'LONG' : 'SHORT',
      quantity: amount.toString(),
      avgPrice: null,         // No cost basis — deferred to #ENH-051
      costBasisMoney: null,
      positionType: amount > 0 ? 'crypto_long' : 'crypto_short',
      isOpen: true,
      spot: spot?.toFixed(6) ?? null,
      absNotional: fiatAmount > 0 ? fiatAmount.toFixed(6) : null,
      unrealizedPnl: null,    // Cannot compute without cost basis
      snapshotDate,
    });
  }

  return results;
}
