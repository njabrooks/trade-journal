"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/formatters";
import type { NavTimeSeriesPoint } from "@/db/queries/accounting";

type TimeRange = "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";

const TIME_RANGES: TimeRange[] = ["1M", "3M", "6M", "1Y", "YTD", "ALL"];

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDateDMY(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mmm = SHORT_MONTHS[parsed.getMonth()];
  const yy = String(parsed.getFullYear()).slice(-2);
  return `${dd} ${mmm} ${yy}`;
}

function formatCompactCurrency(value: number, currency = "USD"): string {
  const symbol = currency === "GBP" ? "\u00a3" : "$";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

const chartConfig: ChartConfig = {
  totalMarketValue: {
    label: "NAV",
    color: "oklch(0.63 0.2 250)",
  },
};

interface AccountingNavChartProps {
  data: NavTimeSeriesPoint[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  currency?: string;
}

export function AccountingNavChart({
  data,
  timeRange,
  onTimeRangeChange,
  currency = "USD",
}: AccountingNavChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      totalMarketValue: d.totalMarketValue,
    }));
  }, [data]);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">
          Portfolio Value
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
      <div className="mt-2">
        {chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="oklch(0.63 0.2 250)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="oklch(0.63 0.2 250)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatDateDMY(value)}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={52}
                tickFormatter={(v) => formatCompactCurrency(v, currency)}
              />
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const mv = payload[0]?.value as number;
                  return (
                    <div className="border-border/50 bg-background grid min-w-[10rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">
                        {formatDateDMY(label)}
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">NAV</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatCurrency(mv, currency)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                dataKey="totalMarketValue"
                type="monotone"
                fill="url(#navFill)"
                stroke="oklch(0.63 0.2 250)"
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
  );
}

export type { TimeRange };
