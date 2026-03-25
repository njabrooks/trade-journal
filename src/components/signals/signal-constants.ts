/**
 * Shared constants, colors, and formatting for signal components.
 * Centralises duplicated config from SignalDetailClient, SignalsBrowser,
 * SignalProgressCard, SignalSnapshotChart, SignalTrendIndicator,
 * AssessmentTimeline, and SignalLog.
 */

// ---------------------------------------------------------------------------
// Explicit details extension types (stored in JSONB explicit_details)
// ---------------------------------------------------------------------------

export type SignalDirection = 'up_to_threshold' | 'down_to_threshold';
export type SignalDisplayType = 'time_series' | 'milestone' | 'status' | 'ratio';

export interface ExplicitDetailsExtension {
  direction?: SignalDirection;
  display_type?: SignalDisplayType;
}

// ---------------------------------------------------------------------------
// Signal type config (confirmation / invalidation / completion)
// ---------------------------------------------------------------------------

export interface SignalTypeConfig {
  label: string;
  cls: string;           // badge color classes
  lineColor: string;     // chart line (oklch)
  fillColor: string;     // chart area fill
}

export const SIGNAL_TYPE_COLORS: Record<string, SignalTypeConfig> = {
  confirmation: {
    label: 'Confirmation',
    cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    lineColor: 'oklch(0.63 0.2 250)',   // blue
    fillColor: 'oklch(0.63 0.2 250)',
  },
  invalidation: {
    label: 'Invalidation',
    cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    lineColor: 'oklch(0.65 0.2 25)',    // red-orange
    fillColor: 'oklch(0.65 0.2 25)',
  },
  warning: {
    label: 'Invalidation',
    cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    lineColor: 'oklch(0.65 0.2 25)',
    fillColor: 'oklch(0.65 0.2 25)',
  },
  completion: {
    label: 'Completion',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    lineColor: 'oklch(0.55 0.2 260)',   // indigo-blue
    fillColor: 'oklch(0.55 0.2 260)',
  },
};

// ---------------------------------------------------------------------------
// Assessment levels (qualitative snapshots)
// ---------------------------------------------------------------------------

export interface AssessmentConfig {
  label: string;
  rank: number;
  /** Badge classes */
  cls: string;
  /** Dot / indicator color */
  dotColor: string;
  /** Card background */
  bgColor: string;
  /** Card border */
  borderColor: string;
  /** Text color for inline use */
  textColor: string;
}

export const ASSESSMENT_LEVELS: Record<string, AssessmentConfig> = {
  neutral: {
    label: 'Neutral',
    rank: 0,
    cls: 'bg-muted text-muted-foreground',
    dotColor: 'bg-zinc-400 dark:bg-zinc-500',
    bgColor: 'bg-zinc-50 dark:bg-zinc-900',
    borderColor: 'border-zinc-300 dark:border-zinc-700',
    textColor: 'text-muted-foreground',
  },
  strengthening: {
    label: 'Strengthening',
    rank: 1,
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    dotColor: 'bg-blue-400 dark:bg-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  confirmed: {
    label: 'Confirmed',
    rank: 2,
    cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    dotColor: 'bg-emerald-600 dark:bg-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  weakening: {
    label: 'Weakening',
    rank: -1,
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    dotColor: 'bg-amber-500 dark:bg-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  invalidated: {
    label: 'Invalidated',
    rank: -2,
    cls: 'bg-destructive/15 text-destructive',
    dotColor: 'bg-red-500 dark:bg-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-300 dark:border-red-700',
    textColor: 'text-red-600 dark:text-red-400',
  },
};

// ---------------------------------------------------------------------------
// Data source labels
// ---------------------------------------------------------------------------

export const SOURCE_LABELS: Record<string, string> = {
  defillama: 'DefiLlama',
  hypeflows: 'HypeFlows',
  coingecko: 'CoinGecko',
  tradingview_cdp: 'TradingView',
  internal_db: 'Internal',
  thesis_monitor: 'Thesis Monitor',
  derived: 'Derived',
  strategy_price: 'Price',
  daily_synthesis: 'Daily Rollup',
  world_monitor: 'World Monitor',
  qualitative: 'Research',
  research_routing: 'Research',
  intelligence_routing: 'Intel Route',
  economic_calendar: 'Econ. Calendar',
  hormuz_strait: 'Hormuz Strait',
};

// ---------------------------------------------------------------------------
// Importance config
// ---------------------------------------------------------------------------

export const IMPORTANCE_CONFIG: Record<string, string> = {
  critical:    'bg-destructive/15 text-destructive',
  significant: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  supporting:  'bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  complete: 'bg-muted text-muted-foreground',
  draft:    'bg-muted text-muted-foreground',
  rejected: 'bg-destructive/15 text-destructive',
};

// ---------------------------------------------------------------------------
// Shared formatting utilities
// ---------------------------------------------------------------------------

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

export function formatDateFull(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format a numeric value with appropriate unit display. */
export function formatNumericValue(value: number, unit: string): string {
  if (unit === 'USD') {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(2)}`;
  }
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'BTC_RATIO') return value.toPrecision(4);
  if (unit === 'correlation') return value.toFixed(3);
  if (unit === 'status') return value === 0 ? 'Active' : 'Triggered';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  if (value < 0.01 && value > 0) return value.toFixed(6);
  return value.toFixed(2);
}

/**
 * Format a value from a string (as returned by Postgres numeric) with unit.
 * Returns '—' for null/invalid.
 */
export function formatSnapshotValue(value: string | null, unit: string | null): string {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return formatNumericValue(num, unit || '');
}
