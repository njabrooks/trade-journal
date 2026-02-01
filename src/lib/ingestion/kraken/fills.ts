/**
 * Kraken trade normalization.
 * Converts Kraken trade history entries to CryptoTradeInput for insertion into trades table.
 */

import type { KrakenTrade } from './api';
import type { CryptoTradeInput } from '../crypto/types';
import { normalizeKrakenPair, extractKrakenQuoteCurrency } from '../crypto/pairNormalization';

/**
 * Normalize a Kraken trade into the common crypto trade shape.
 */
export function normalizeKrakenTrade(
  tradeId: string,
  trade: KrakenTrade,
  accountId: string
): CryptoTradeInput {
  const side = trade.type.toUpperCase() as 'BUY' | 'SELL';
  const grossAmount = trade.cost;
  const fee = parseFloat(trade.fee) || 0;
  const netAmount = side === 'BUY'
    ? (parseFloat(grossAmount) + fee).toFixed(6)
    : (parseFloat(grossAmount) - fee).toFixed(6);

  return {
    accountId,
    brokerTransactionId: `kraken-${tradeId}`,
    brokerExecId: trade.ordertxid,
    assetClass: 'CRYPTO',
    symbol: normalizeKrakenPair(trade.pair),
    currency: extractKrakenQuoteCurrency(trade.pair),
    tradeDate: new Date(trade.time * 1000),
    side,
    quantity: trade.vol,
    price: trade.price,
    grossAmount,
    netAmount,
    fees: fee > 0 ? fee.toFixed(6) : '0',
    orderType: trade.ordertype,
    exchange: 'kraken',
    rawRow: trade as unknown as Record<string, unknown>,
  };
}
