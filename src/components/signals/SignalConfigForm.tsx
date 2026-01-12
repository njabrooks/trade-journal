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
];

// Duration periods
const DURATION_PERIODS = [
  { id: 'readings', label: 'consecutive readings' },
  { id: 'days', label: 'consecutive days' },
  { id: 'weeks', label: 'consecutive weeks' },
  { id: 'months', label: 'consecutive months' },
  { id: 'quarters', label: 'consecutive quarters' },
];

// Check frequencies
const CHECK_FREQUENCIES = [
  { id: 'daily', label: 'Daily', description: 'Check every day' },
  { id: 'weekly', label: 'Weekly', description: 'Check every week' },
  { id: 'monthly', label: 'Monthly', description: 'Check once a month' },
];

export interface ExplicitDetails {
  dataSource: 'fred' | 'iv_data' | 'price_feed';
  metric: string;
  metricName?: string;
  operator: string;
  threshold: number;
  thresholdUnit?: string;
  duration?: {
    count: number;
    period: string;
  };
  checkFrequency: 'daily' | 'weekly' | 'monthly';
  ticker?: string; // For IV/Price data
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
      className={`flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
  const [checkFrequency, setCheckFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    existingConfig?.checkFrequency || 'weekly'
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
    if (!metric || !threshold) return null;

    const metricLabel = selectedMetric?.name || metric;
    const op = OPERATORS.find((o) => o.id === operator);
    const unit = selectedMetric?.unit || '';
    const tickerPrefix = dataSource !== 'fred' && ticker ? `${ticker} ` : '';

    let condition = `${tickerPrefix}${metricLabel} ${op?.symbol || operator} ${threshold}${unit}`;

    if (parseInt(durationCount) > 1) {
      condition += ` for ${durationCount} ${DURATION_PERIODS.find((p) => p.id === durationPeriod)?.label}`;
    }

    return condition;
  }, [metric, threshold, operator, selectedMetric, durationCount, durationPeriod, dataSource, ticker]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!metric) {
      alert('Please select a metric');
      return;
    }

    if (!threshold) {
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
        threshold: parseFloat(threshold),
        thresholdUnit: selectedMetric?.unit,
        checkFrequency,
      };

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

  // Group FRED series by category for optgroups
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{getModeTitle()}</h2>
            {signal && (
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{signal.statement}</p>
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
            className="text-slate-400 hover:text-slate-600 transition-colors"
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
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
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
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
              {/* Operator */}
              <NativeSelect value={operator} onChange={setOperator}>
                {OPERATORS.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.symbol} {op.label}
                  </option>
                ))}
              </NativeSelect>

              {/* Threshold */}
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
                  <span className="text-sm text-slate-500">{selectedMetric.unit}</span>
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
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration (Optional)</Label>
            <p className="text-xs text-slate-500">
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

          {/* Check Frequency */}
          <div className="space-y-2">
            <Label>Check Frequency *</Label>
            <div className="grid grid-cols-3 gap-3">
              {CHECK_FREQUENCIES.map((freq) => (
                <button
                  key={freq.id}
                  type="button"
                  onClick={() => setCheckFrequency(freq.id as 'daily' | 'weekly' | 'monthly')}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    checkFrequency === freq.id
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-medium">{freq.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{freq.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewCondition && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <Label className="text-xs text-slate-500 uppercase tracking-wider">
                Trigger Preview
              </Label>
              <p className="mt-2 text-sm font-medium text-slate-800">{previewCondition}</p>
              <p className="mt-1 text-xs text-slate-500">
                Checked {checkFrequency === 'daily' ? 'every day' : checkFrequency === 'weekly' ? 'every week' : 'monthly'}
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
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
