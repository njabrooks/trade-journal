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
  const year = parsed.getFullYear().toString().slice(-2);
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
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

