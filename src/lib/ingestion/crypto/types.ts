import type { NewTrade, NewPosition } from '@/db/schema';

/**
 * Common normalized trade shape for all crypto exchanges.
 * Maps directly to NewTrade from schema.ts.
 */
export interface CryptoTradeInput {
  accountId: string;
  brokerTransactionId: string;
  brokerExecId: string | null;
  assetClass: 'CRYPTO' | 'PERP';
  symbol: string;
  currency: string;
  tradeDate: Date;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  grossAmount: string | null;
  netAmount: string | null;
  fees: string | null;
  orderType: string | null;
  exchange: string;
  rawRow: Record<string, unknown>;
}

/**
 * Common normalized position shape for all crypto exchanges.
 * Maps directly to NewPosition from schema.ts.
 */
export interface CryptoPositionInput {
  accountId: string;
  underlyingId: string | null;
  assetClass: 'CRYPTO' | 'PERP' | 'OPT';
  symbol: string;
  multiplier: string;
  side: 'LONG' | 'SHORT';
  quantity: string;
  avgPrice: string | null;
  costBasisMoney: string | null;
  positionType: string;
  isOpen: boolean;
  spot: string | null;
  absNotional: string | null;
  marketValueUsd: string | null;
  unrealizedPnl: string | null;
  snapshotDate: string;
  // Options-specific fields (populated by Deribit options, null for other exchanges)
  expiry?: string | null;
  strike?: string | null;
  optionRight?: 'C' | 'P' | null;
}

/**
 * Convert CryptoTradeInput to the shape expected by schema's NewTrade.
 */
export function toNewTrade(input: CryptoTradeInput): Omit<NewTrade, 'id' | 'createdAt'> {
  return {
    accountId: input.accountId,
    strategyId: null,
    brokerTransactionId: input.brokerTransactionId,
    brokerExecId: input.brokerExecId,
    assetClass: input.assetClass,
    symbol: input.symbol,
    conid: null,
    currency: input.currency,
    fxRateToBase: null,
    tradeDate: input.tradeDate,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    grossAmount: input.grossAmount,
    netAmount: input.netAmount,
    fees: input.fees,
    orderType: input.orderType,
    exchange: input.exchange,
    rawRow: input.rawRow,
  };
}

/**
 * Convert CryptoPositionInput to the shape expected by schema's NewPosition.
 */
export function toNewPosition(input: CryptoPositionInput): Omit<NewPosition, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    accountId: input.accountId,
    strategyId: null,
    underlyingId: input.underlyingId,
    assetClass: input.assetClass,
    symbol: input.symbol,
    conid: null,
    expiry: input.expiry ?? null,
    strike: input.strike ?? null,
    optionRight: input.optionRight ?? null,
    multiplier: input.multiplier,
    side: input.side,
    quantity: input.quantity,
    avgPrice: input.avgPrice,
    costBasisMoney: input.costBasisMoney,
    openDate: null,
    closeDate: null,
    positionType: input.positionType,
    isOpen: input.isOpen,
    spot: input.spot,
    intrinsic: null,
    extrinsic: null,
    absNotional: input.absNotional,
    marketValueUsd: input.marketValueUsd,
    unrealizedPnl: input.unrealizedPnl,
    snapshotDate: input.snapshotDate,
  };
}
