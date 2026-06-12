'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency, formatDateLabel } from '@/lib/formatters';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ThesisPerformance } from '@/db/queries/thesisPerformance';

interface ThesisPerformanceChartProps {
  performance: ThesisPerformance;
  /** macro theses: full-credit exposure view — render the D8 disclosure */
  exposureView?: boolean;
}

type ChartView = 'stacked' | 'split';

const VIEW_OPTIONS: { key: ChartView; label: string }[] = [
  { key: 'stacked', label: 'By strategy' },
  { key: 'split', label: 'Realized / Unrealized' },
];

// Distinct hues for per-strategy series (cycled when strategies > palette)
const SERIES_COLORS = [
  'oklch(0.63 0.2 250)',
  'oklch(0.65 0.18 150)',
  'oklch(0.7 0.18 60)',
  'oklch(0.6 0.2 310)',
  'oklch(0.62 0.2 20)',
  'oklch(0.68 0.16 200)',
  'oklch(0.58 0.16 100)',
  'oklch(0.66 0.18 340)',
  'oklch(0.6 0.14 270)',
  'oklch(0.7 0.14 120)',
];

const REALIZED_COLOR = 'oklch(0.65 0.18 150)';
const UNREALIZED_COLOR = 'oklch(0.63 0.2 250)';

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function pnlClass(value: number): string {
  return value >= 0 ? 'text-emerald-600' : 'text-rose-600';
}

function MetricCard({
  label,
  value,
  valueClass,
  badge,
}: {
  label: string;
  value: string;
  valueClass?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {badge}
      </p>
      <p className={`mt-1 text-xl font-semibold ${valueClass ?? 'text-foreground'}`}>{value}</p>
    </div>
  );
}

export function ThesisPerformanceChart({
  performance,
  exposureView = false,
}: ThesisPerformanceChartProps) {
  const [view, setView] = useState<ChartView>('stacked');

  const { totals, strategies } = performance;

  // Pivot per-strategy series onto the union of snapshot dates. Cumulative
  // PnL persists after a strategy's last snapshot (a closed strategy keeps
  // its realized PnL), so values are forward-filled to the end; before a
  // strategy's first snapshot it contributes 0.
  const { stackedData, splitData } = useMemo(() => {
    const dates = [...new Set(strategies.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const dateIndex = new Map(dates.map((d, i) => [d, i]));

    const stackedRows = dates.map((date) => ({ date }) as Record<string, string | number>);
    const splitRows = dates.map((date) => ({ date, realized: 0, unrealized: 0 }));

    for (const s of strategies) {
      let cumulative = 0;
      let realized = 0;
      let unrealized = 0;
      let pointIdx = 0;
      for (let i = 0; i < dates.length; i++) {
        while (pointIdx < s.points.length && dateIndex.get(s.points[pointIdx].date)! <= i) {
          const p = s.points[pointIdx];
          cumulative = p.cumulative ?? cumulative;
          realized = p.realizedToDate ?? realized;
          unrealized = p.unrealized ?? 0;
          pointIdx++;
        }
        stackedRows[i][s.strategyId] = cumulative;
        splitRows[i].realized += realized;
        splitRows[i].unrealized += unrealized;
      }
      // A strategy past its last snapshot holds no open positions
      // (forward-filled unrealized already reflects its final mark).
    }
    return { stackedData: stackedRows, splitData: splitRows };
  }, [strategies]);

  const stackedConfig: ChartConfig = useMemo(
    () =>
      Object.fromEntries(
        strategies.map((s, i) => [
          s.strategyId,
          {
            label: s.strategyKey ?? s.strategyId.slice(0, 8),
            color: SERIES_COLORS[i % SERIES_COLORS.length],
          },
        ])
      ),
    [strategies]
  );

  const splitConfig: ChartConfig = {
    realized: { label: 'Realized', color: REALIZED_COLOR },
    unrealized: { label: 'Unrealized', color: UNREALIZED_COLOR },
  };

  if (strategies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No strategy snapshots yet — performance appears once a linked strategy has metrics
        history.
      </p>
    );
  }

  const config = view === 'stacked' ? stackedConfig : splitConfig;
  const seriesKeys = view === 'stacked' ? strategies.map((s) => s.strategyId) : ['realized', 'unrealized'];
  const data = view === 'stacked' ? stackedData : splitData;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Cumulative PnL"
          value={formatCurrency(totals.latestCumulative)}
          valueClass={pnlClass(totals.latestCumulative)}
          badge={<ConfidenceBadge confidence={totals.confidence} />}
        />
        <MetricCard
          label="Realized"
          value={formatCurrency(totals.latestRealized)}
          valueClass={pnlClass(totals.latestRealized)}
          badge={<ConfidenceBadge confidence={totals.confidence} />}
        />
        <MetricCard
          label="Unrealized"
          value={formatCurrency(totals.latestUnrealized)}
          valueClass={pnlClass(totals.latestUnrealized)}
        />
        <MetricCard label="Strategies" value={strategies.length.toString()} />
      </section>

      {exposureView && (
        <p className="text-xs text-muted-foreground">
          Exposure view — each linked asset thesis contributes its full P&amp;L to every macro
          thesis it supports, so totals can double-count across macro theses (D8).
        </p>
      )}

      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Cumulative PnL over time</p>
          <div className="flex items-center gap-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => setView(option.key)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  view === option.key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          <ChartContainer config={config} className="h-[260px] w-full">
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatDateLabel(value)}
                interval="preserveStartEnd"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                width={56}
                tickFormatter={formatCompactCurrency}
              />
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const rows = [...payload]
                    .filter((entry) => typeof entry.value === 'number')
                    .sort((a, b) => Math.abs(b.value as number) - Math.abs(a.value as number))
                    .slice(0, 8);
                  const total = payload.reduce(
                    (sum, entry) => sum + ((entry.value as number) || 0),
                    0
                  );
                  return (
                    <div className="border-border/50 bg-background grid min-w-[12rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">{formatDateLabel(label)}</div>
                      {rows.map((entry) => (
                        <div
                          key={entry.dataKey as string}
                          className="flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="max-w-[11rem] truncate text-muted-foreground">
                              {config[entry.dataKey as string]?.label ?? entry.dataKey}
                            </span>
                          </div>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrency(entry.value as number)}
                          </span>
                        </div>
                      ))}
                      <div className="mt-0.5 flex items-center justify-between gap-4 border-t border-border/50 pt-1">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatCurrency(total)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              {seriesKeys.map((key) => (
                <Area
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stackId="pnl"
                  fill={config[key]?.color}
                  fillOpacity={0.25}
                  stroke={config[key]?.color}
                  strokeWidth={1.5}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        </div>
        {view === 'stacked' && strategies.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {strategies.map((s, i) => (
              <span key={s.strategyId} className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                <span className="text-muted-foreground">{s.strategyKey ?? '—'}</span>
                <span className={`font-mono tabular-nums ${pnlClass(s.latest?.cumulative ?? 0)}`}>
                  {formatCompactCurrency(s.latest?.cumulative ?? 0)}
                </span>
                <ConfidenceBadge confidence={s.latest?.confidence} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
