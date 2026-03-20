"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency, formatDateLabel } from "@/lib/formatters";
import type { NavComparisonPoint } from "@/db/queries/reconciliation";

export type TimeRange = "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";

const TIME_RANGES: TimeRange[] = ["1M", "3M", "6M", "1Y", "YTD", "ALL"];

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const chartConfig: ChartConfig = {
  snapshotNav: {
    label: "Snapshot NAV",
    color: "oklch(0.63 0.2 250)",
  },
  eventSourcedNav: {
    label: "Event-Sourced NAV",
    color: "oklch(0.7 0.18 150)",
  },
};

interface ReconciliationNavChartProps {
  data: NavComparisonPoint[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function ReconciliationNavChart({
  data,
  timeRange,
  onTimeRangeChange,
}: ReconciliationNavChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      snapshotNav: d.snapshotNav,
      eventSourcedNav: d.eventSourcedNav,
    }));
  }, [data]);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">
          NAV Comparison
        </p>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                timeRange === range
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 mb-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "oklch(0.63 0.2 250)" }}
          />
          <span className="text-muted-foreground">Snapshot</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "oklch(0.7 0.18 150)" }}
          />
          <span className="text-muted-foreground">Event-Sourced</span>
        </div>
      </div>
      <div className="mt-2">
        {chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="snapshotFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="oklch(0.63 0.2 250)"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor="oklch(0.63 0.2 250)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient
                  id="eventSourcedFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="oklch(0.7 0.18 150)"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor="oklch(0.7 0.18 150)"
                    stopOpacity={0.02}
                  />
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
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                width={52}
                tickFormatter={formatCompactCurrency}
              />
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const snap = payload.find(
                    (p) => p.dataKey === "snapshotNav"
                  )?.value as number | undefined;
                  const es = payload.find(
                    (p) => p.dataKey === "eventSourcedNav"
                  )?.value as number | undefined;
                  return (
                    <div className="border-border/50 bg-background grid min-w-[14rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">
                        {formatDateLabel(label)}
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Snapshot</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {snap != null ? formatCurrency(snap) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          Event-Sourced
                        </span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {es != null ? formatCurrency(es) : "—"}
                        </span>
                      </div>
                      {snap != null && es != null && (
                        <div className="flex items-center justify-between gap-4 border-t pt-1">
                          <span className="text-muted-foreground">Delta</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrency(snap - es)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                dataKey="snapshotNav"
                type="monotone"
                fill="url(#snapshotFill)"
                stroke="oklch(0.63 0.2 250)"
                strokeWidth={2}
                connectNulls
              />
              <Area
                dataKey="eventSourcedNav"
                type="monotone"
                fill="url(#eventSourcedFill)"
                stroke="oklch(0.7 0.18 150)"
                strokeWidth={2}
                connectNulls
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
  );
}
