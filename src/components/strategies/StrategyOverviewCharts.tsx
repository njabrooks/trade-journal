"use client";

import { useState, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency, formatDateLabel, formatPercent } from "@/lib/formatters";

interface MetricsTimelinePoint {
  snapshotDate: string;
  totalAbsNotional: number | null;
  totalUnrealizedPnl: number | null;
  pctNavAbsNotional: number | null;
  numOpenPositions: number | null;
  minDte: number | null;
  maxDte: number | null;
}

interface LiveMetrics {
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  pctNav: number | null;
  minDte: number | null;
  openPositionsCount: number;
}

interface StrategyOverviewChartsProps {
  metricsTimeline: MetricsTimelinePoint[];
  liveMetrics: LiveMetrics;
}

type ChartMetric = "pnl" | "marketValue";

const METRIC_OPTIONS: { key: ChartMetric; label: string }[] = [
  { key: "marketValue", label: "Mkt Value" },
  { key: "pnl", label: "PnL" },
];

const METRIC_COLORS: Record<ChartMetric, string> = {
  pnl: "oklch(0.63 0.2 250)",
  marketValue: "oklch(0.55 0.2 250)",
};

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold ${valueClass ?? "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function StrategyOverviewCharts({
  metricsTimeline,
  liveMetrics,
}: StrategyOverviewChartsProps) {
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>("marketValue");

  const pnlValue = liveMetrics.totalUnrealizedPnl;
  const pnlClass = pnlValue >= 0 ? "text-emerald-600" : "text-rose-600";

  // Build chart data directly from positions-based timeline
  const chartData = useMemo(() => {
    return metricsTimeline.map((point) => ({
      date: point.snapshotDate,
      pnl: point.totalUnrealizedPnl,
      marketValue: point.totalAbsNotional,
    }));
  }, [metricsTimeline]);

  const chartConfig: ChartConfig = {
    [selectedMetric]: {
      label: METRIC_OPTIONS.find((m) => m.key === selectedMetric)!.label,
      color: METRIC_COLORS[selectedMetric],
    },
  };

  const color = METRIC_COLORS[selectedMetric];

  return (
    <>
      {/* Metric Cards — sourced from live positions, not pre-computed snapshots */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Mkt Value"
          value={formatCurrency(liveMetrics.totalMarketValue)}
        />
        <MetricCard
          label="Unrealized PnL"
          value={formatCurrency(pnlValue)}
          valueClass={pnlClass}
        />
        <MetricCard
          label="% NAV"
          value={formatPercent(liveMetrics.pctNav)}
        />
        <MetricCard
          label="Min DTE"
          value={
            liveMetrics.minDte !== null
              ? liveMetrics.minDte.toString()
              : "\u2014"
          }
        />
        <MetricCard
          label="Positions"
          value={liveMetrics.openPositionsCount.toString()}
        />
      </section>

      {/* Area Chart with Metric Toggle */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">
            Performance
          </p>
          <div className="flex items-center gap-1">
            {METRIC_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => setSelectedMetric(option.key)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  selectedMetric === option.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {chartData.length > 0 ? (
            <ChartContainer
              config={chartConfig}
              className="h-[240px] w-full"
            >
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="strategyAreaFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => formatDateLabel(value)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  width={52}
                  tickFormatter={formatCompactCurrency}
                />
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const val = payload[0]?.value as number;
                    return (
                      <div className="border-border/50 bg-background grid min-w-[10rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium">
                          {formatDateLabel(label)}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-muted-foreground">
                              {
                                METRIC_OPTIONS.find(
                                  (m) => m.key === selectedMetric
                                )!.label
                              }
                            </span>
                          </div>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrency(val)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  dataKey={selectedMetric}
                  type="monotone"
                  fill="url(#strategyAreaFill)"
                  stroke={color}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center text-xs text-muted-foreground h-[240px]">
              No data
            </div>
          )}
        </div>
      </div>
    </>
  );
}
