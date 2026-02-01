"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { StackedBar } from "@/components/charts/StackedBar";
import { formatCurrency, formatDateLabel, formatPercent } from "@/lib/formatters";
import type { PortfolioDashboardData } from "@/db/queries/portfolio";

interface PortfolioChartsProps {
  dashboardData: PortfolioDashboardData;
}

export function PortfolioCharts({ dashboardData }: PortfolioChartsProps) {
  const latestNav = dashboardData.navTrend.at(-1)?.nav ?? null;
  const latestSnapshot = dashboardData.latestAccountSnapshot;
  const latestStockNotional = Math.abs(latestSnapshot?.absStockNotional ?? 0);
  const latestOptionNotional = Math.abs(latestSnapshot?.absOptionNotional ?? 0);

  const navSparklineData = dashboardData.navTrend.map((point) => ({
    label: formatDateLabel(point.date),
    value: point.nav,
  }));

  const pnlSparklineData = dashboardData.accountSnapshots.map((point) => ({
    label: formatDateLabel(point.date),
    value: point.totalUnrealizedPnl,
  }));

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {/* Sparklines */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2 space-y-6">
        {/* NAV Trend */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">NAV Trend</p>
              <p className="text-xl font-semibold text-foreground">{formatCurrency(latestNav)}</p>
            </div>
            <span className="text-xs text-muted-foreground">{navSparklineData.length} days</span>
          </div>
          <div className="mt-3 h-24">
            <Sparkline data={navSparklineData} stroke="#2563eb" showHighLow />
          </div>
        </div>

        {/* PnL Trend */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Unrealized P&L Trend</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(latestSnapshot?.totalUnrealizedPnl ?? null)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{pnlSparklineData.length} days</span>
          </div>
          <div className="mt-3 h-20">
            <Sparkline data={pnlSparklineData} stroke="#16a34a" showHighLow />
          </div>
        </div>
      </div>

      {/* Side panels */}
      <div className="space-y-4">
        {/* Exposure Mix */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Exposure Mix</p>
          <div className="mt-3">
            <StackedBar
              segments={[
                { label: "Stock", value: latestStockNotional, color: "oklch(0.63 0.2 250)" },
                { label: "Options", value: latestOptionNotional, color: "oklch(0.7 0.24 30)" },
              ]}
            />
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.63_0.2_250)]" />
                <span className="text-muted-foreground">Stock</span>
              </div>
              <span className="font-medium text-foreground">{formatCurrency(latestStockNotional)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.7_0.24_30)]" />
                <span className="text-muted-foreground">Options</span>
              </div>
              <span className="font-medium text-foreground">{formatCurrency(latestOptionNotional)}</span>
            </div>
          </dl>
        </div>

        {/* Leverage */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Leverage vs NAV</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {formatPercent(latestSnapshot?.pctNavAbsNotional ?? null, 1)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Abs notional as % of NAV</p>
        </div>
      </div>
    </section>
  );
}
