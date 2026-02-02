/**
 * Deribit fill normalization.
 * Converts Deribit trade responses to CryptoTradeInput for insertion into trades table.
 * Currently handles spot trades only. Options/futures deferred.
 */

import type { DeribitTrade } from './api';
import type { CryptoTradeInput } from '../crypto/types';
import { normalizeDeribitCurrency } from '../crypto/pairNormalization';

/**
 * Extract base currency from Deribit instrument name.
 * Spot: "BTC_USDC" → "BTC"
 * Perps: "BTC-PERPETUAL" → "BTC"
 * Options: "BTC-25JAN26-100000-C" → "BTC"
 */
function extractBaseCurrency(instrumentName: string): string {
  // Spot instruments use underscore: "BTC_USDC"
  if (instrumentName.includes('_')) {
    return instrumentName.split('_')[0].toUpperCase();
  }
  // Perps and options use dash: "BTC-PERPETUAL", "BTC-25JAN26-100000-C"
  return instrumentName.split('-')[0].toUpperCase();
}

/**
 * Normalize a Deribit trade into the common crypto trade shape.
 * Spot trades only for now — asset class is always 'CRYPTO'.
 */
export function normalizeDeribitTrade(
  trade: DeribitTrade,
  accountId: string
): CryptoTradeInput {
  const side = trade.direction === 'buy' ? 'BUY' : 'SELL';
  const symbol = extractBaseCurrency(trade.instrument_name);
  const currency = normalizeDeribitCurrency(trade.fee_currency);

  const grossAmount = (trade.price * trade.amount).toFixed(6);
  const feeAbs = Math.abs(trade.fee);
  // Net = gross + fees for BUY (you pay more), gross - fees for SELL (you receive less)
  const netAmount = side === 'BUY'
    ? (parseFloat(grossAmount) + feeAbs).toFixed(6)
    : (parseFloat(grossAmount) - feeAbs).toFixed(6);

  return {
    accountId,
    brokerTransactionId: `deribit-${trade.trade_id}`,
    brokerExecId: trade.order_id,
    assetClass: 'CRYPTO', // Spot only for now
    symbol,
    currency,
    tradeDate: new Date(trade.timestamp),
    side: side as 'BUY' | 'SELL',
    quantity: trade.amount.toString(),
    price: trade.price.toString(),
    grossAmount,
    netAmount,
    fees: feeAbs > 0 ? feeAbs.toFixed(6) : '0',
    orderType: null,
    exchange: 'deribit',
    rawRow: trade as unknown as Record<string, unknown>,
  };
}
