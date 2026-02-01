/**
 * Coinbase Prime fill normalization.
 * Converts CBP fill responses to CryptoTradeInput for insertion into trades table.
 */

import type { CBPFill } from './api';
import type { CryptoTradeInput } from '../crypto/types';
import { normalizeCoinbasePrimePair, extractCoinbasePrimeQuoteCurrency } from '../crypto/pairNormalization';

/**
 * Normalize a Coinbase Prime fill into the common crypto trade shape.
 */
export function normalizeCBPFill(
  fill: CBPFill,
  accountId: string
): CryptoTradeInput {
  const side = fill.side.toUpperCase() as 'BUY' | 'SELL';
  const grossAmount = fill.filled_value;
  const commission = parseFloat(fill.commission) || 0;
  const venueFees = parseFloat(fill.venue_fees) || 0;
  const totalFees = commission + venueFees;
  // Net = gross + fees for BUY (you pay more), gross - fees for SELL (you receive less)
  const netAmount = side === 'BUY'
    ? (parseFloat(grossAmount) + totalFees).toFixed(6)
    : (parseFloat(grossAmount) - totalFees).toFixed(6);

  return {
    accountId,
    brokerTransactionId: `cbp-${fill.id}`,
    brokerExecId: fill.order_id,
    assetClass: 'CRYPTO', // Coinbase Prime is spot only
    symbol: normalizeCoinbasePrimePair(fill.product_id),
    currency: extractCoinbasePrimeQuoteCurrency(fill.product_id),
    tradeDate: new Date(fill.time),
    side,
    quantity: fill.filled_quantity,
    price: fill.price,
    grossAmount,
    netAmount,
    fees: totalFees > 0 ? totalFees.toFixed(6) : '0',
    orderType: null,
    exchange: 'coinbase_prime',
    rawRow: fill as unknown as Record<string, unknown>,
  };
}
