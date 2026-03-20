"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { StackedBar } from "@/components/charts/StackedBar";
import { PieChart } from "@/components/charts/PieChart";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency, formatDateLabel, formatPercent } from "@/lib/formatters";
import type { PortfolioDashboardData, OwnerBreakdownRow } from "@/db/queries/portfolio";

export interface ExposureBreakdown {
  equities: number;
  options: number;
  cryptoSpot: number;
  perpetuals: number;
  cash: number;
}

interface PortfolioChartsProps {
  dashboardData: PortfolioDashboardData;
  exposureBreakdown: ExposureBreakdown;
}

// Owner colors — consistent across pie chart and area chart
const OWNER_COLORS: Record<string, string> = {
  TTC: "oklch(0.63 0.2 250)",      // Blue
  Nick: "oklch(0.7 0.24 30)",      // Orange
  Maisy: "oklch(0.7 0.18 150)",    // Green
  Kids: "oklch(0.68 0.2 280)",     // Purple (grouped)
  Alex: "oklch(0.65 0.22 310)",    // Purple
  Lily: "oklch(0.75 0.2 340)",     // Pink
  Leo: "oklch(0.7 0.2 60)",        // Yellow
  Unknown: "oklch(0.6 0.1 240)",   // Gray
};

const KIDS_OWNERS = new Set(["Alex", "Lily", "Leo"]);

// Group Kids owners together for display
function groupOwnersForDisplay(owners: OwnerBreakdownRow[]): OwnerBreakdownRow[] {
  const grouped: OwnerBreakdownRow[] = [];
  let kidsTotal = 0;
  let kidsAccountCount = 0;

  for (const owner of owners) {
    if (KIDS_OWNERS.has(owner.owner)) {
      kidsTotal += owner.nav;
      kidsAccountCount += owner.accountCount;
    } else {
      grouped.push(owner);
    }
  }

  if (kidsTotal > 0) {
    grouped.push({ owner: "Kids", nav: kidsTotal, accountCount: kidsAccountCount });
  }

  // Sort by NAV descending
  return grouped.sort((a, b) => b.nav - a.nav);
}

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

type TimePeriod = "7d" | "14d" | "1m" | "3m";
const TIME_PERIODS: { key: TimePeriod; label: string; days: number }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "14d", label: "14D", days: 14 },
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
];

export function PortfolioCharts({ dashboardData, exposureBreakdown }: PortfolioChartsProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("14d");

  // --- NAV by Owner stacked area chart data ---
  const { chartData, ownerKeys, chartConfig } = useMemo(() => {
    const series = dashboardData.ownerNavTimeSeries;
    if (series.length === 0) {
      return { chartData: [], ownerKeys: [] as string[], chartConfig: {} as ChartConfig };
    }

    // Pivot flat list into { date, [owner]: nav } with Kids grouping
    const dateMap = new Map<string, Record<string, number>>();
    const ownerSet = new Set<string>();

    for (const point of series) {
      const owner = KIDS_OWNERS.has(point.owner) ? "Kids" : point.owner;
      ownerSet.add(owner);

      let row = dateMap.get(point.date);
      if (!row) {
        row = {};
        dateMap.set(point.date, row);
      }
      row[owner] = (row[owner] ?? 0) + point.nav;
    }

    const keys = [...ownerSet].sort((a, b) => {
      // Sort by latest total NAV so largest owner is at bottom of stack
      const lastDate = [...dateMap.keys()].pop()!;
      const lastRow = dateMap.get(lastDate)!;
      return (lastRow[b] ?? 0) - (lastRow[a] ?? 0);
    });

    const data = [...dateMap.entries()].map(([date, row]) => ({
      date,
      ...Object.fromEntries(keys.map((k) => [k, row[k] ?? 0])),
    }));

    const config: ChartConfig = Object.fromEntries(
      keys.map((k) => [k, { label: k, color: OWNER_COLORS[k] ?? OWNER_COLORS.Unknown }])
    );

    return { chartData: data, ownerKeys: keys, chartConfig: config };
  }, [dashboardData.ownerNavTimeSeries]);

  // Filter chart data by selected time period
  const filteredChartData = useMemo(() => {
    if (chartData.length === 0) return [];
    const days = TIME_PERIODS.find((p) => p.key === timePeriod)!.days;
    return chartData.slice(-days);
  }, [chartData, timePeriod]);

  const exposureSegments = [
    { label: "Equities", value: exposureBreakdown.equities, color: "oklch(0.63 0.2 250)" },
    { label: "Options", value: exposureBreakdown.options, color: "oklch(0.7 0.24 30)" },
    { label: "Crypto Spot", value: exposureBreakdown.cryptoSpot, color: "oklch(0.7 0.18 150)" },
    { label: "Perpetuals", value: exposureBreakdown.perpetuals, color: "oklch(0.65 0.22 310)" },
    { label: "Cash", value: exposureBreakdown.cash, color: "oklch(0.75 0.1 90)" },
  ];

  // Group Kids owners together
  const groupedOwners = groupOwnersForDisplay(dashboardData.ownerBreakdown);
  const totalNav = groupedOwners.reduce((sum, o) => sum + o.nav, 0);

  const ownerSegments = groupedOwners.map((owner) => ({
    label: owner.owner,
    value: owner.nav,
    color: OWNER_COLORS[owner.owner] ?? OWNER_COLORS.Unknown,
  }));

  return (
    <section className="grid gap-4 lg:grid-cols-4">
      {/* NAV by Owner — stacked area chart */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">NAV by Owner</p>
          <div className="flex items-center gap-1">
            {TIME_PERIODS.map((period) => (
              <button
                key={period.key}
                onClick={() => setTimePeriod(period.key)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  timePeriod === period.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {filteredChartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <AreaChart
                accessibilityLayer
                data={filteredChartData}
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
                  width={48}
                  tickFormatter={formatCompactCurrency}
                />
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce((sum, p) => sum + (typeof p.value === "number" ? p.value : 0), 0);
                    return (
                      <div className="border-border/50 bg-background grid min-w-[10rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium">{formatDateLabel(label)}</div>
                        <div className="grid gap-1">
                          {payload
                            .filter((p) => p.type !== "none")
                            .map((p) => (
                            <div key={p.dataKey} className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: p.color }} />
                                <span className="text-muted-foreground">{chartConfig[p.dataKey as string]?.label ?? p.name}</span>
                              </div>
                              <span className="font-mono font-medium tabular-nums text-foreground">
                                {formatCurrency(p.value as number)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-1.5">
                          <span className="font-medium text-foreground">Total</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrency(total)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                {ownerKeys.map((owner) => (
                  <Area
                    key={owner}
                    dataKey={owner}
                    type="monotone"
                    fill={`var(--color-${owner})`}
                    fillOpacity={0.4}
                    stroke={`var(--color-${owner})`}
                    stackId="nav"
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center text-xs text-muted-foreground h-[200px]">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Exposure Mix — stacked bar */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">Exposure Mix</p>
        <div className="mt-3">
          <StackedBar segments={exposureSegments} />
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          {exposureSegments.map((seg) => (
            <div key={seg.label} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-muted-foreground">{seg.label}</span>
              </div>
              <span className="font-medium text-foreground">{formatCurrency(seg.value)}</span>
            </div>
          ))}
        </dl>
      </div>

      {/* Owner NAV Breakdown — pie chart */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">Owner Breakdown</p>
        <div className="mt-3 flex justify-center">
          <PieChart segments={ownerSegments} size={100} />
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          {groupedOwners.map((owner) => {
            const pct = totalNav > 0 ? (owner.nav / totalNav) * 100 : 0;
            const color = OWNER_COLORS[owner.owner] ?? OWNER_COLORS.Unknown;
            return (
              <div key={owner.owner} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-muted-foreground">{owner.owner}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatPercent(pct)}</span>
                  <span className="font-medium text-foreground">{formatCurrency(owner.nav)}</span>
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
