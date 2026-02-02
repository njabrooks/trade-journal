"use client";

import { LineChart } from "@/components/charts/LineChart";
import { StackedBar } from "@/components/charts/StackedBar";
import { formatCurrency, formatDateLabel } from "@/lib/formatters";
import type { PortfolioDashboardData } from "@/db/queries/portfolio";

export interface ExposureBreakdown {
  equities: number;
  options: number;
  cryptoSpot: number;
  perpetuals: number;
}

interface PortfolioChartsProps {
  dashboardData: PortfolioDashboardData;
  exposureBreakdown: ExposureBreakdown;
}

export function PortfolioCharts({ dashboardData, exposureBreakdown }: PortfolioChartsProps) {
  const mvChartData = dashboardData.accountSnapshots.map((point) => ({
    label: formatDateLabel(point.date),
    value: point.totalAbsNotional,
  }));

  const segments = [
    { label: "Equities", value: exposureBreakdown.equities, color: "oklch(0.63 0.2 250)" },
    { label: "Options", value: exposureBreakdown.options, color: "oklch(0.7 0.24 30)" },
    { label: "Crypto Spot", value: exposureBreakdown.cryptoSpot, color: "oklch(0.7 0.18 150)" },
    { label: "Perpetuals", value: exposureBreakdown.perpetuals, color: "oklch(0.65 0.22 310)" },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {/* Market Value Trend — line chart */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">Market Value Trend</p>
          <span className="text-xs text-muted-foreground">{mvChartData.length} days</span>
        </div>
        <div className="mt-2">
          <LineChart data={mvChartData} stroke="#2563eb" height={200} />
        </div>
      </div>

      {/* Exposure Mix — 4-segment bar */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">Exposure Mix</p>
        <div className="mt-3">
          <StackedBar segments={segments} />
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          {segments.map((seg) => (
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
    </section>
  );
}
