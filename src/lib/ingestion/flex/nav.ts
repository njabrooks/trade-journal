import { NewNavSnapshot } from '@/db/schema';

export interface FlexNavRow {
  [key: string]: string | undefined;
}

const FIELD_VARIANTS = {
  reportDate: ['ReportDate', 'reportDate'],
  clientAccountId: ['ClientAccountID', 'Client Account ID', 'clientAccountID'],
  currency: ['BaseCurrency', 'CurrencyPrimary', 'currency'],
  total: ['NetLiquidation', 'Total', 'total'],
  totalLong: ['TotalLong', 'Total Long', 'StockMarketValue', 'Stock Market Value'],
  totalShort: ['TotalShort', 'Total Short', 'ShortMarketValue', 'Short Market Value'],
  cash: ['Cash', 'CashBalance', 'TotalCash', 'Money Market Value'],
};

const DATE_YYYYMMDD = /^\d{8}$/;

function getValue(row: FlexNavRow, keys: string[]): string | undefined {
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

export function normalizeFlexNavRow(
  row: FlexNavRow,
  accountId: string
): Omit<NewNavSnapshot, 'id' | 'createdAt'> {
  const reportDate = parseReportDate(getValue(row, FIELD_VARIANTS.reportDate));
  const total = parseNumeric(getValue(row, FIELD_VARIANTS.total));
  if (total === null) {
    throw new Error('Total NAV is required');
  }

  const currency = getValue(row, FIELD_VARIANTS.currency) ?? 'USD';

  return {
    accountId,
    reportDate,
    currency,
    total,
    totalLong: parseNumeric(getValue(row, FIELD_VARIANTS.totalLong)),
    totalShort: parseNumeric(getValue(row, FIELD_VARIANTS.totalShort)),
    cash: parseNumeric(getValue(row, FIELD_VARIANTS.cash)),
  };
}

export function validateFlexNavRow(row: FlexNavRow): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!getValue(row, FIELD_VARIANTS.clientAccountId)) {
    errors.push('ClientAccountID is required');
  }

  if (!getValue(row, FIELD_VARIANTS.reportDate)) {
    errors.push('ReportDate is required');
  }

  if (!getValue(row, FIELD_VARIANTS.total)) {
    errors.push('NetLiquidation (Total) is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
