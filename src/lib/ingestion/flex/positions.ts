import { NewPosition } from '@/db/schema';
import { ensureUnderlyingId } from './underlyings';

export interface FlexPositionRow {
  [key: string]: string | undefined;
}

const FIELD_VARIANTS = {
  reportDate: ['ReportDate', 'reportDate', 'SnapshotDate'],
  clientAccountId: ['ClientAccountID', 'Client Account ID', 'clientAccountID'],
  symbol: ['Symbol', 'symbol'],
  underlyingSymbol: ['UnderlyingSymbol', 'Underlying Symbol', 'underlyingSymbol'],
  assetClass: ['AssetClass', 'Asset Class', 'assetClass'],
  conid: ['Conid', 'conid'],
  expiry: ['Expiry', 'expiry'],
  strike: ['Strike', 'strike'],
  optionRight: ['Put/Call', 'PutCall', 'putCall', 'OptionRight'],
  multiplier: ['Multiplier', 'multiplier'],
  quantity: ['Quantity', 'quantity', 'Position'],
  side: ['Side', 'side'],
  costBasisPrice: ['CostBasisPrice', 'Cost Basis Price', 'costBasisPrice'],
  openPrice: ['OpenPrice', 'Open Price', 'openPrice'],
  markPrice: ['MarkPrice', 'Mark Price', 'markPrice'],
  positionValue: ['PositionValue', 'Position Value', 'positionValue'],
  fifoUnrealized: ['FifoPnlUnrealized', 'FifoPnLUnrealized', 'fifoPnlUnrealized'],
  openDateTime: ['OpenDateTime', 'Open Date Time', 'openDateTime'],
  currencyPrimary: ['CurrencyPrimary', 'Currency Primary', 'currencyPrimary'],
  description: ['Description', 'description'],
};

const DATE_YYYYMMDD = /^\d{8}$/;

function getValue(row: FlexPositionRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      const trimmed = value.trim();
      if (trimmed !== '') {
        return trimmed;
      }
    }
  }
  return undefined;
}

function parseNumeric(value?: string): string | null {
  if (value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed.toString();
}

function parseBigInt(value?: string): number | null {
  if (value === undefined) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseReportDate(value?: string): string {
  if (!value) {
    throw new Error('ReportDate is required');
  }

  const trimmed = value.trim();
  if (DATE_YYYYMMDD.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse ReportDate: ${value}`);
  }

  return parsed.toISOString().split('T')[0]!;
}

function parseDateField(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (DATE_YYYYMMDD.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().split('T')[0]!;
}

function parseTimestamp(value?: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (DATE_YYYYMMDD.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function deriveSide(sideField: string | undefined, quantity: number): 'LONG' | 'SHORT' | null {
  if (sideField) {
    const normalized = sideField.trim().toUpperCase();
    if (normalized.startsWith('LONG')) return 'LONG';
    if (normalized.startsWith('SHORT')) return 'SHORT';
  }

  if (quantity > 0) return 'LONG';
  if (quantity < 0) return 'SHORT';
  return null;
}

function derivePositionType(assetClass: string | null, side: 'LONG' | 'SHORT' | null): string | null {
  if (!assetClass) return null;
  const normalized = assetClass.toUpperCase();

  if (normalized === 'STK') {
    if (side === 'LONG') return 'stock_long';
    if (side === 'SHORT') return 'stock_short';
    return 'stock';
  }

  if (normalized === 'OPT') {
    if (side === 'LONG') return 'option_long';
    if (side === 'SHORT') return 'option_short';
    return 'option';
  }

  return 'other';
}

export async function normalizeFlexPositionRow(
  row: FlexPositionRow,
  accountId: string
): Promise<Omit<NewPosition, 'id' | 'createdAt' | 'updatedAt'>> {
  const snapshotDate = parseReportDate(getValue(row, FIELD_VARIANTS.reportDate));
  const symbol = getValue(row, FIELD_VARIANTS.symbol);
  if (!symbol) {
    throw new Error('Symbol is required');
  }

  const quantityRaw = getValue(row, FIELD_VARIANTS.quantity);
  if (!quantityRaw) {
    throw new Error('Quantity is required');
  }
  const quantityNum = parseFloat(quantityRaw);
  if (Number.isNaN(quantityNum)) {
    throw new Error('Quantity must be numeric');
  }

  const side = deriveSide(getValue(row, FIELD_VARIANTS.side), quantityNum);
  const assetClass = getValue(row, FIELD_VARIANTS.assetClass) ?? null;

  const avgPrice =
    parseNumeric(getValue(row, FIELD_VARIANTS.costBasisPrice)) ??
    parseNumeric(getValue(row, FIELD_VARIANTS.openPrice));

  const optionRightRaw = getValue(row, FIELD_VARIANTS.optionRight);
  const optionRight = optionRightRaw ? optionRightRaw.trim().charAt(0).toUpperCase() : null;
  const normalizedOptionRight =
    optionRight === 'P' || optionRight === 'C' ? optionRight : null;

  const markPrice = parseNumeric(getValue(row, FIELD_VARIANTS.markPrice));
  const positionValue = parseNumeric(getValue(row, FIELD_VARIANTS.positionValue));
  const unrealized = parseNumeric(getValue(row, FIELD_VARIANTS.fifoUnrealized));

  // Resolve underlying ID from UnderlyingSymbol (or fallback to Symbol for stocks)
  const underlyingSymbolRaw = getValue(row, FIELD_VARIANTS.underlyingSymbol);
  const underlyingTicker = underlyingSymbolRaw && underlyingSymbolRaw.trim() !== '' 
    ? underlyingSymbolRaw.trim() 
    : (assetClass === 'STK' ? symbol : null);
  
  // Extract additional underlying metadata
  const currencyPrimary = getValue(row, FIELD_VARIANTS.currencyPrimary) ?? null;
  const description = getValue(row, FIELD_VARIANTS.description) ?? null;
  
  const underlyingId = await ensureUnderlyingId(
    underlyingTicker,
    assetClass,
    currencyPrimary,
    description
  );

  return {
    accountId,
    strategyId: null,
    underlyingId,
    assetClass,
    symbol,
    conid: parseBigInt(getValue(row, FIELD_VARIANTS.conid)),
    expiry: parseDateField(getValue(row, FIELD_VARIANTS.expiry)),
    strike: parseNumeric(getValue(row, FIELD_VARIANTS.strike)),
    optionRight: normalizedOptionRight,
    multiplier: parseNumeric(getValue(row, FIELD_VARIANTS.multiplier)),
    side,
    quantity: quantityNum.toString(),
    avgPrice,
    openDate: parseTimestamp(getValue(row, FIELD_VARIANTS.openDateTime)),
    closeDate: null,
    positionType: derivePositionType(assetClass, side),
    isOpen: quantityNum !== 0,
    spot: markPrice,
    intrinsic: null,
    extrinsic: null,
    absNotional: positionValue,
    unrealizedPnl: unrealized,
    snapshotDate,
  };
}

export function validateFlexPositionRow(row: FlexPositionRow): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!getValue(row, FIELD_VARIANTS.clientAccountId)) {
    errors.push('ClientAccountID is required');
  }

  if (!getValue(row, FIELD_VARIANTS.symbol)) {
    errors.push('Symbol is required');
  }

  if (!getValue(row, FIELD_VARIANTS.quantity)) {
    errors.push('Quantity is required');
  }

  if (!getValue(row, FIELD_VARIANTS.reportDate)) {
    errors.push('ReportDate is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

