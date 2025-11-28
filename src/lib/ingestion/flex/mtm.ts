import { NewMtmSnapshot } from '@/db/schema';

export interface FlexMtmRow {
  [key: string]: string | undefined;
}

const FIELD_VARIANTS = {
  reportDate: ['ReportDate', 'reportDate', 'SnapshotDate'],
  clientAccountId: ['ClientAccountID', 'Client Account ID', 'clientAccountID'],
  symbol: ['Symbol', 'symbol'],
  assetClass: ['AssetClass', 'Asset Class', 'assetClass'],
  currency: ['CurrencyPrimary', 'Currency', 'currency'],
  quantity: ['Quantity', 'quantity'],
  markPrice: ['MarkPrice', 'Mark Price', 'markPrice'],
  marketValue: ['MarketValue', 'Market Value', 'marketValue'],
  unrealized: ['UnrealizedPnL', 'Unrealized PnL', 'unrealizedPnL', 'MTMPnL', 'MtmPnL'],
  realized: ['RealizedPnL', 'Realized PnL', 'realizedPnL'],
  transaction: ['TransactionMtmPnL', 'Transaction MTM PnL', 'transactionMtmPnL'],
  priorOpen: ['PriorOpenMtmPnL', 'Prior Open MTM PnL', 'priorOpenMtmPnL'],
  commissions: ['Commissions', 'commissions'],
  total: ['Total', 'total', 'Pnl', 'MTMPnLTotal'],
};

const DATE_YYYYMMDD = /^\d{8}$/;

function getValue(row: FlexMtmRow, keys: string[]): string | undefined {
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

export function normalizeFlexMtmRow(
  row: FlexMtmRow,
  accountId: string
): Omit<NewMtmSnapshot, 'id' | 'createdAt'> {
  const snapshotDate = parseReportDate(getValue(row, FIELD_VARIANTS.reportDate));
  const symbol = getValue(row, FIELD_VARIANTS.symbol);
  if (!symbol) {
    throw new Error('Symbol is required');
  }

  const rawRow = row as Record<string, unknown>;

  return {
    snapshotDate,
    accountId,
    positionId: null,
    symbol,
    assetClass: getValue(row, FIELD_VARIANTS.assetClass) ?? null,
    currency: getValue(row, FIELD_VARIANTS.currency) ?? null,
    quantity: parseNumeric(getValue(row, FIELD_VARIANTS.quantity)),
    markPrice: parseNumeric(getValue(row, FIELD_VARIANTS.markPrice)),
    marketValue: parseNumeric(getValue(row, FIELD_VARIANTS.marketValue)),
    unrealizedPnl: parseNumeric(getValue(row, FIELD_VARIANTS.unrealized)),
    realizedPnl: parseNumeric(getValue(row, FIELD_VARIANTS.realized)),
    transactionMtmPnl: parseNumeric(getValue(row, FIELD_VARIANTS.transaction)),
    priorOpenMtmPnl: parseNumeric(getValue(row, FIELD_VARIANTS.priorOpen)),
    commissions: parseNumeric(getValue(row, FIELD_VARIANTS.commissions)),
    total: parseNumeric(getValue(row, FIELD_VARIANTS.total)),
    rawRow: Object.keys(rawRow).length > 0 ? rawRow : null,
  };
}

export function validateFlexMtmRow(row: FlexMtmRow): {
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

  if (!getValue(row, FIELD_VARIANTS.reportDate)) {
    errors.push('ReportDate is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
