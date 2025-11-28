// Normalization functions for IBKR Flex Trades data
// Maps raw Flex CSV rows to normalized trades table inserts

import { NewTrade } from '@/db/schema';

export interface FlexTradeRow {
  [key: string]: string | undefined;
}

const CASH_ASSET_CLASS = 'CASH';

const VARIANTS = {
  transactionId: ['TransactionID', 'Transaction ID', 'transactionID'],
  execId: ['IBExecID', 'IB Exec ID', 'ibExecID'],
  assetClass: ['AssetClass', 'Asset Class', 'assetClass'],
  symbol: ['Symbol', 'symbol'],
  conid: ['Conid', 'conid'],
  currency: ['CurrencyPrimary', 'Currency Primary', 'currencyPrimary'],
  fxRate: ['FXRateToBase', 'FX Rate To Base', 'fxRateToBase'],
  dateTime: ['DateTime', 'Date Time', 'datetime'],
  tradeDate: ['TradeDate', 'Trade Date', 'tradeDate'],
  quantity: ['Quantity', 'quantity'],
  tradePrice: ['TradePrice', 'Trade Price', 'tradePrice'],
  proceeds: ['Proceeds', 'proceeds'],
  netCash: ['NetCash', 'Net Cash', 'netCash'],
  ibCommission: ['IBCommission', 'IB Commission', 'ibCommission'],
  orderType: ['OrderType', 'Order Type', 'orderType'],
  exchange: ['Exchange', 'exchange'],
  listingExchange: ['ListingExchange', 'Listing Exchange', 'listingExchange'],
  buySell: ['Buy/Sell', 'BuySell', 'buySell'],
  account: ['ClientAccountID', 'Client Account ID', 'clientAccountID'],
};

const DATE_ONLY_REGEX = /^\d{8}$/;
const DATE_TIME_REGEX = /^\d{8};\d{6}$/;

function getValue(row: FlexTradeRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && val.toString().trim() !== '') {
      return val.trim();
    }
  }
  return undefined;
}

function parseNumeric(value?: string): string | null {
  if (value === undefined) return null;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return parsed.toString();
}

function parseBigInt(value?: string): number | null {
  if (value === undefined) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  if (DATE_ONLY_REGEX.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return { year, month, day };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

function formatUtcDate(
  dateParts: { year: number; month: number; day: number },
  timeParts?: { hours: number; minutes: number; seconds: number }
): Date {
  const date = new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts?.hours ?? 0,
      timeParts?.minutes ?? 0,
      timeParts?.seconds ?? 0
    )
  );

  return date;
}

function parseDateTime(value: string): Date | null {
  const trimmed = value.trim();

  if (DATE_TIME_REGEX.test(trimmed)) {
    const [dateStr, timeStr] = trimmed.split(';');
    const dateParts = parseDateOnly(dateStr);
    if (!dateParts) return null;
    const hours = Number(timeStr.slice(0, 2));
    const minutes = Number(timeStr.slice(2, 4));
    const seconds = Number(timeStr.slice(4, 6));
    return formatUtcDate(dateParts, { hours, minutes, seconds });
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function resolveTradeDate(row: FlexTradeRow): Date {
  const dateTimeRaw = getValue(row, VARIANTS.dateTime);
  if (dateTimeRaw) {
    const iso = parseDateTime(dateTimeRaw);
    if (iso) return iso;
  }

  const tradeDateRaw = getValue(row, VARIANTS.tradeDate);
  if (!tradeDateRaw) {
    throw new Error('Missing DateTime/TradeDate');
  }

  const dateParts = parseDateOnly(tradeDateRaw);
  if (!dateParts) {
    throw new Error(`Unparseable TradeDate: ${tradeDateRaw}`);
  }

  return formatUtcDate(dateParts);
}

function resolveQuantity(row: FlexTradeRow): { quantity: string; side: 'BUY' | 'SELL' } {
  const quantityRaw = getValue(row, VARIANTS.quantity);
  if (!quantityRaw) {
    throw new Error('Quantity is required');
  }

  const quantityNum = parseFloat(quantityRaw);
  if (Number.isNaN(quantityNum) || quantityNum === 0) {
    throw new Error('Quantity must be non-zero numeric');
  }

  return {
    quantity: quantityNum.toString(),
    side: quantityNum > 0 ? 'BUY' : 'SELL',
  };
}

function resolvePrice(row: FlexTradeRow): string {
  const priceRaw = getValue(row, VARIANTS.tradePrice);
  if (!priceRaw) {
    throw new Error('TradePrice is required');
  }

  const price = parseNumeric(priceRaw);
  if (!price) {
    throw new Error('TradePrice must be numeric');
  }
  return price;
}

export function normalizeFlexTradeRow(
  row: FlexTradeRow,
  accountId: string
): Omit<NewTrade, 'id' | 'createdAt'> {
  const assetClass = getValue(row, VARIANTS.assetClass) ?? null;
  const symbol = getValue(row, VARIANTS.symbol);
  
  // Skip CASH rows that don't have a symbol (pure cash movements, not trades)
  // But allow CASH rows with symbols (e.g., FX trades like USD.HKD)
  if (assetClass?.toUpperCase() === CASH_ASSET_CLASS && !symbol) {
    throw new Error('AssetClass CASH rows without symbol are ignored');
  }

  if (!symbol) {
    throw new Error('Symbol is required');
  }

  const { quantity, side } = resolveQuantity(row);
  const price = resolvePrice(row);
  const tradeDate = resolveTradeDate(row);

  const brokerTransactionId = getValue(row, VARIANTS.transactionId) ?? null;
  const fxRate = parseNumeric(getValue(row, VARIANTS.fxRate));
  const proceeds = parseNumeric(getValue(row, VARIANTS.proceeds));
  const netCash = parseNumeric(getValue(row, VARIANTS.netCash));
  const fees = parseNumeric(getValue(row, VARIANTS.ibCommission));
  const rawRow = row as Record<string, unknown>;

  return {
    accountId,
    strategyId: null,
    brokerTransactionId,
    brokerExecId: getValue(row, VARIANTS.execId) ?? null,
    assetClass,
    symbol,
    conid: parseBigInt(getValue(row, VARIANTS.conid)),
    currency: getValue(row, VARIANTS.currency) ?? null,
    fxRateToBase: fxRate,
    tradeDate,
    side,
    quantity,
    price,
    grossAmount: proceeds,
    netAmount: netCash,
    fees,
    orderType: getValue(row, VARIANTS.orderType) ?? null,
    exchange: getValue(row, VARIANTS.exchange) ?? getValue(row, VARIANTS.listingExchange) ?? null,
    rawRow: Object.keys(rawRow).length > 0 ? rawRow : null,
  };
}

/**
 * Validates that a row has minimum required fields
 */
export function validateFlexTradeRow(row: FlexTradeRow): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!getValue(row, VARIANTS.symbol)) {
    errors.push('Symbol is required');
  }
  if (!getValue(row, VARIANTS.dateTime) && !getValue(row, VARIANTS.tradeDate)) {
    errors.push('DateTime or TradeDate is required');
  }
  if (!getValue(row, VARIANTS.quantity)) {
    errors.push('Quantity is required');
  }
  if (!getValue(row, VARIANTS.tradePrice)) {
    errors.push('TradePrice is required');
  }
  if (!getValue(row, VARIANTS.account)) {
    errors.push('ClientAccountID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

