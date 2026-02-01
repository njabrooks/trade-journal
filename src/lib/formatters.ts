export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  maximumFractionDigits = 0
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits,
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
  }).format(value);
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(maximumFractionDigits)}%`;
}

export function formatDateLabel(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateShort(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const day = parsed.getDate();
  const month = parsed.toLocaleDateString('en-US', { month: 'short' });
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatDateFull(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const day = parsed.getDate();
  const month = parsed.toLocaleDateString('en-US', { month: 'short' });
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date);
  const day = parsed.getDate();
  const month = parsed.toLocaleDateString('en-US', { month: 'short' });
  const year = parsed.getFullYear();
  const hours = parsed.getHours();
  const minutes = parsed.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date);

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return formatDateShort(parsed.toISOString());
}

/**
 * Format a position symbol for display.
 * Options are formatted as "TSLA 260618 C350" (underlying YYMMDD right+strike).
 * Stocks show their raw symbol.
 */
export function formatSymbol(position: {
  assetClass: string | null;
  symbol: string;
  underlyingTicker: string | null;
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
}): string {
  if (position.assetClass === 'OPT' && position.underlyingTicker) {
    const expiry = position.expiry ? position.expiry.replace(/-/g, '').slice(2) : '';
    const strike = position.strike ? Math.round(position.strike).toString() : '';
    const right = position.optionRight || '';
    return `${position.underlyingTicker} ${expiry} ${right}${strike}`;
  }
  return position.symbol;
}

/**
 * Calculate days to expiration from expiry date and a reference snapshot date.
 * Returns null for non-options or expired positions.
 */
export function calculateDTE(expiry: string | null, snapshotDate: string): number | null {
  if (!expiry) return null;
  const expiryDate = new Date(expiry + 'T00:00:00Z');
  const snapshotDateObj = new Date(snapshotDate + 'T00:00:00Z');
  const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : null;
}

/**
 * Calculate cost basis money from position fields.
 * Returns |quantity * avgPrice * multiplier| or null if any field is missing.
 */
export function calculateCostBasis(position: {
  quantity: number;
  avgPrice: number | null;
  multiplier: number | null;
  costBasisMoney?: number | null;
}): number | null {
  if (position.costBasisMoney != null) return Math.abs(position.costBasisMoney);
  if (position.avgPrice != null && position.multiplier != null) {
    return Math.abs(position.quantity * position.avgPrice * position.multiplier);
  }
  return null;
}

export function formatPosition(
  assetClass: string | null,
  quantity: number,
  underlyingTicker: string | null,
  expiry: string | null,
  strike: number | null,
  optionRight: string | null
): string {
  const parts: string[] = [];
  
  // Asset Class
  if (assetClass) {
    parts.push(assetClass);
  }
  
  // Quantity (signed - positive for long, negative for short)
  parts.push(quantity > 0 ? `+${quantity}` : String(quantity));
  
  // Underlying Ticker (fallback to empty if not available)
  if (underlyingTicker) {
    parts.push(underlyingTicker);
  }
  
  // For options: Expiry, Strike, Put/Call
  if (assetClass === 'OPT') {
    if (expiry) {
      parts.push(expiry);
    }
    if (strike !== null) {
      parts.push(String(strike));
    }
    if (optionRight) {
      parts.push(optionRight);
    }
  }
  
  return parts.join(' ');
}

