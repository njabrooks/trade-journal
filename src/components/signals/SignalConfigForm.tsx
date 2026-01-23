'use client';

import { useState, useMemo } from 'react';
import { X, AlertTriangle, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Signal } from '@/db/schema';

// Data source definitions
const DATA_SOURCES = [
  {
    id: 'fred' as const,
    label: 'FRED Economic Data',
    icon: '📊',
    description: 'Federal Reserve Economic Data - 34 macro series',
    status: 'available' as const,
  },
  {
    id: 'iv_data' as const,
    label: 'IV Data (Massive.com)',
    icon: '📈',
    description: 'Implied volatility metrics for underlyings',
    status: 'available' as const,
  },
  {
    id: 'price_feed' as const,
    label: 'Price Feed',
    icon: '💹',
    description: 'Spot prices and price-derived metrics',
    status: 'partial' as const,
  },
];

// FRED series catalog (subset of commonly used series)
const FRED_SERIES = [
  { id: 'GDP', name: 'Real GDP Growth Rate', unit: '%', category: 'Output' },
  { id: 'UNRATE', name: 'Unemployment Rate', unit: '%', category: 'Labor' },
  { id: 'PAYEMS', name: 'Total Nonfarm Payrolls', unit: 'thousands', category: 'Labor' },
  { id: 'ICSA', name: 'Initial Claims', unit: 'thousands', category: 'Labor' },
  { id: 'CPIAUCSL', name: 'CPI (All Urban)', unit: '%', category: 'Prices' },
  { id: 'PCEPI', name: 'PCE Price Index', unit: '%', category: 'Prices' },
  { id: 'FEDFUNDS', name: 'Federal Funds Rate', unit: '%', category: 'Interest Rates' },
  { id: 'DGS10', name: '10-Year Treasury', unit: '%', category: 'Interest Rates' },
  { id: 'DGS2', name: '2-Year Treasury', unit: '%', category: 'Interest Rates' },
  { id: 'T10Y2Y', name: '10Y-2Y Spread', unit: 'bps', category: 'Interest Rates' },
  { id: 'BAMLH0A0HYM2', name: 'High Yield Spread', unit: 'bps', category: 'Credit' },
  { id: 'VIXCLS', name: 'VIX Index', unit: 'index', category: 'Volatility' },
  { id: 'DTWEXBGS', name: 'Trade-Weighted USD', unit: 'index', category: 'FX' },
  { id: 'DCOILWTICO', name: 'WTI Crude Oil', unit: '$/bbl', category: 'Commodities' },
  { id: 'GOLDAMGBD228NLBM', name: 'Gold Price', unit: '$/oz', category: 'Commodities' },
  { id: 'HOUST', name: 'Housing Starts', unit: 'thousands', category: 'Housing' },
  { id: 'PERMIT', name: 'Building Permits', unit: 'thousands', category: 'Housing' },
  { id: 'RSAFS', name: 'Retail Sales', unit: '%', category: 'Consumer' },
  { id: 'UMCSENT', name: 'Consumer Sentiment', unit: 'index', category: 'Consumer' },
  { id: 'INDPRO', name: 'Industrial Production', unit: '%', category: 'Manufacturing' },
  { id: 'NAPM', name: 'ISM Manufacturing PMI', unit: 'index', category: 'Manufacturing' },
  { id: 'NAPMNOI', name: 'ISM Manufacturing New Orders', unit: 'index', category: 'Manufacturing' },
  { id: 'NAPMEI', name: 'ISM Manufacturing Employment', unit: 'index', category: 'Manufacturing' },
];

// IV Data metrics
const IV_METRICS = [
  { id: 'iv30', name: 'IV30 (30-day IV)', unit: '%' },
  { id: 'iv_rank', name: 'IV Rank (52-week)', unit: '%' },
  { id: 'iv_percentile', name: 'IV Percentile (52-week)', unit: '%' },
  { id: 'rv20', name: 'RV20 (20-day Realized Vol)', unit: '%' },
  { id: 'iv_rv_spread', name: 'IV-RV Spread', unit: '%' },
];

// Price metrics
const PRICE_METRICS = [
  { id: 'spot', name: 'Spot Price', unit: '$' },
  { id: 'spot_change_pct', name: 'Price Change %', unit: '%' },
  { id: 'atr20', name: 'ATR20 (Avg True Range)', unit: '$' },
  { id: 'distance_from_high', name: 'Distance from 52w High', unit: '%' },
  { id: 'distance_from_low', name: 'Distance from 52w Low', unit: '%' },
];

// Operators
const OPERATORS = [
  { id: 'gt', label: 'Greater than', symbol: '>' },
  { id: 'gte', label: 'Greater than or equal', symbol: '≥' },
  { id: 'lt', label: 'Less than', symbol: '<' },
  { id: 'lte', label: 'Less than or equal', symbol: '≤' },
  { id: 'eq', label: 'Equal to', symbol: '=' },
  { id: 'crosses_above', label: 'Crosses above', symbol: '↗' },
  { id: 'crosses_below', label: 'Crosses below', symbol: '↘' },
  { id: 'on_release', label: 'On new data release', symbol: '📅', description: 'Triggers when new data point is published (ideal for monthly economic data)' },
];

// Duration periods
const DURATION_PERIODS = [
  { id: 'readings', label: 'consecutive readings' },
  { id: 'days', label: 'consecutive days' },
  { id: 'weeks', label: 'consecutive weeks' },
  { id: 'months', label: 'consecutive months' },
  { id: 'quarters', label: 'consecutive quarters' },
];

// Check frequency - always daily (removed UI options for simplicity)
// The field is kept for backwards compatibility with existing configs

export interface ExplicitDetails {
  dataSource: 'fred' | 'iv_data' | 'price_feed';
  metric: string;
  metricName?: string;
  operator: string;
  threshold?: number; // Optional for 'on_release' operator
  thresholdUnit?: string;
  duration?: {
    count: number;
    period: string;
  };
  checkFrequency: 'daily' | 'weekly' | 'monthly';
  ticker?: string; // For IV/Price data
  // For on_release operator: stores last observed data date to detect new releases
  lastObservedDate?: string;
}

interface SignalConfigFormProps {
  signal?: Signal;
  existingConfig?: ExplicitDetails;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (config: ExplicitDetails) => Promise<void>;
  mode?: 'create' | 'edit' | 'upgrade'; // 'upgrade' = converting judgment to explicit
}

// Styled native select component
function NativeSelect({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`flex h-10 w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </select>
  );
}

export function SignalConfigForm({
  signal,
  existingConfig,
  isOpen,
  onClose,
  onSubmit,
  mode = 'create',
}: SignalConfigFormProps) {
  // Form state
  const [dataSource, setDataSource] = useState<'fred' | 'iv_data' | 'price_feed'>(
    existingConfig?.dataSource || 'fred'
  );
  const [metric, setMetric] = useState(existingConfig?.metric || '');
  const [operator, setOperator] = useState(existingConfig?.operator || 'gt');
  const [threshold, setThreshold] = useState<string>(
    existingConfig?.threshold?.toString() || ''
  );
  const [durationCount, setDurationCount] = useState<string>(
    existingConfig?.duration?.count?.toString() || '1'
  );
  const [durationPeriod, setDurationPeriod] = useState(
    existingConfig?.duration?.period || 'readings'
  );
  const [checkFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    existingConfig?.checkFrequency || 'daily'
  );
  const [ticker, setTicker] = useState(existingConfig?.ticker || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get metrics based on selected data source
  const availableMetrics = useMemo(() => {
    switch (dataSource) {
      case 'fred':
        return FRED_SERIES.map((s) => ({ id: s.id, name: s.name, unit: s.unit }));
      case 'iv_data':
        return IV_METRICS;
      case 'price_feed':
        return PRICE_METRICS;
      default:
        return [];
    }
  }, [dataSource]);

  // Get selected metric details
  const selectedMetric = useMemo(() => {
    return availableMetrics.find((m) => m.id === metric);
  }, [availableMetrics, metric]);

  // Build preview string
  const previewCondition = useMemo(() => {
    // For on_release, only need metric selected
    if (!metric) return null;
    if (operator !== 'on_release' && !threshold) return null;

    const metricLabel = selectedMetric?.name || metric;
    const op = OPERATORS.find((o) => o.id === operator);
    const unit = selectedMetric?.unit || '';
    const tickerPrefix = dataSource !== 'fred' && ticker ? `${ticker} ` : '';

    let condition: string;
    if (operator === 'on_release') {
      condition = `Trigger when ${tickerPrefix}${metricLabel} releases new data`;
    } else {
      condition = `${tickerPrefix}${metricLabel} ${op?.symbol || operator} ${threshold}${unit}`;

      if (parseInt(durationCount) > 1) {
        condition += ` for ${durationCount} ${DURATION_PERIODS.find((p) => p.id === durationPeriod)?.label}`;
      }
    }

    return condition;
  }, [metric, threshold, operator, selectedMetric, durationCount, durationPeriod, dataSource, ticker]);

  // Group FRED series by category for optgroups (must be before early return)
  const fredSeriesByCategory = useMemo(() => {
    return FRED_SERIES.reduce(
      (acc, series) => {
        if (!acc[series.category]) acc[series.category] = [];
        acc[series.category].push(series);
        return acc;
      },
      {} as Record<string, typeof FRED_SERIES>
    );
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!metric) {
      alert('Please select a metric');
      return;
    }

    // Threshold only required for non on_release operators
    if (operator !== 'on_release' && !threshold) {
      alert('Please enter a threshold value');
      return;
    }

    if ((dataSource === 'iv_data' || dataSource === 'price_feed') && !ticker) {
      alert('Please enter a ticker symbol');
      return;
    }

    setIsSubmitting(true);

    try {
      const config: ExplicitDetails = {
        dataSource,
        metric,
        metricName: selectedMetric?.name,
        operator,
        thresholdUnit: selectedMetric?.unit,
        checkFrequency,
      };

      // Only include threshold for non on_release operators
      if (operator !== 'on_release' && threshold) {
        config.threshold = parseFloat(threshold);
      }

      if (parseInt(durationCount) > 1) {
        config.duration = {
          count: parseInt(durationCount),
          period: durationPeriod,
        };
      }

      if (dataSource !== 'fred' && ticker) {
        config.ticker = ticker.toUpperCase();
      }

      await onSubmit(config);
      onClose();
    } catch (error) {
      console.error('Error saving signal config:', error);
      alert('Failed to save configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getModeTitle = () => {
    switch (mode) {
      case 'upgrade':
        return 'Upgrade to Explicit Signal';
      case 'edit':
        return 'Edit Signal Configuration';
      default:
        return 'Configure Explicit Signal';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{getModeTitle()}</h2>
            {signal && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{signal.statement}</p>
            )}
            {mode === 'upgrade' && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Converting judgment-based signal to data-driven trigger
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Data Source Selection */}
          <div className="space-y-2">
            <Label>Data Source *</Label>
            <div className="grid grid-cols-3 gap-3">
              {DATA_SOURCES.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => {
                    setDataSource(source.id);
                    setMetric(''); // Reset metric when source changes
                  }}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors text-left relative ${
                    dataSource === source.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                      : 'border bg-card text-foreground hover:border-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{source.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{source.label}</div>
                      {source.status === 'partial' && (
                        <span className="text-xs text-amber-600">Limited</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Ticker Input (for IV and Price data) */}
          {(dataSource === 'iv_data' || dataSource === 'price_feed') && (
            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker Symbol *</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL, SPY, NVDA"
                className="uppercase"
              />
            </div>
          )}

          {/* Metric Selection */}
          <div className="space-y-2">
            <Label>Metric *</Label>
            {dataSource === 'fred' ? (
              <NativeSelect value={metric} onChange={setMetric}>
                <option value="">Select a metric...</option>
                {Object.entries(fredSeriesByCategory).map(([category, series]) => (
                  <optgroup key={category} label={category}>
                    {series.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} - {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            ) : (
              <NativeSelect value={metric} onChange={setMetric}>
                <option value="">Select a metric...</option>
                {availableMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>

          {/* Criteria Builder */}
          <div className="space-y-2">
            <Label>Trigger Condition *</Label>
            <div className={`grid ${operator === 'on_release' ? 'grid-cols-1' : 'grid-cols-[1fr_auto_1fr]'} gap-3 items-center`}>
              {/* Operator */}
              <NativeSelect value={operator} onChange={setOperator}>
                {OPERATORS.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.symbol} {op.label}
                  </option>
                ))}
              </NativeSelect>

              {/* Threshold - hidden for on_release operator */}
              {operator !== 'on_release' && (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="any"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      placeholder="Value"
                      className="w-24"
                    />
                    {selectedMetric?.unit && (
                      <span className="text-sm text-muted-foreground">{selectedMetric.unit}</span>
                    )}
                  </div>

                  {/* Visual indicator */}
                  <div className="flex items-center justify-end">
                    {operator.includes('above') || operator === 'gt' || operator === 'gte' ? (
                      <TrendingUp className="w-5 h-5 text-emerald-500" />
                    ) : operator.includes('below') || operator === 'lt' || operator === 'lte' ? (
                      <TrendingDown className="w-5 h-5 text-red-500" />
                    ) : (
                      <Activity className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Explanation for on_release */}
            {operator === 'on_release' && (
              <p className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mt-2">
                📅 Triggers when new data is released (e.g., monthly PMI update), regardless of value.
                Ideal for economic indicators with infrequent releases.
              </p>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration (Optional)</Label>
            <p className="text-xs text-muted-foreground">
              Require condition to persist for multiple periods before triggering
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="12"
                value={durationCount}
                onChange={(e) => setDurationCount(e.target.value)}
                className="w-20"
              />
              <NativeSelect value={durationPeriod} onChange={setDurationPeriod} className="w-48">
                {DURATION_PERIODS.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {/* Preview */}
          {previewCondition && (
            <div className="bg-muted rounded-lg p-4 border border-border">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Trigger Preview
              </Label>
              <p className="mt-2 text-sm font-medium text-foreground">{previewCondition}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Checked daily at 08:00 UTC
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : mode === 'upgrade'
                ? 'Upgrade Signal'
                : existingConfig
                  ? 'Update Configuration'
                  : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </div>
  );
}
