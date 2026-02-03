"use client";

import { LineChart } from "@/components/charts/LineChart";
import { StackedBar } from "@/components/charts/StackedBar";
import { PieChart } from "@/components/charts/PieChart";
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

// Owner colors for pie chart - consistent colors for each owner
const OWNER_COLORS: Record<string, string> = {
  TTC: "oklch(0.63 0.2 250)",      // Blue
  Nick: "oklch(0.7 0.24 30)",      // Orange
  Maisy: "oklch(0.7 0.18 150)",    // Green
  Alex: "oklch(0.65 0.22 310)",    // Purple
  Lily: "oklch(0.75 0.2 340)",     // Pink
  Leo: "oklch(0.7 0.2 60)",        // Yellow
  Unknown: "oklch(0.6 0.1 240)",   // Gray
};

// Group Kids owners together for display
function groupOwnersForDisplay(owners: OwnerBreakdownRow[]): OwnerBreakdownRow[] {
  const kidsOwners = ["Alex", "Lily", "Leo"];
  const grouped: OwnerBreakdownRow[] = [];
  let kidsTotal = 0;
  let kidsAccountCount = 0;

  for (const owner of owners) {
    if (kidsOwners.includes(owner.owner)) {
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

export function PortfolioCharts({ dashboardData, exposureBreakdown }: PortfolioChartsProps) {
  const mvChartData = dashboardData.accountSnapshots.map((point) => ({
    label: formatDateLabel(point.date),
    value: point.totalAbsNotional,
  }));

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
    color: owner.owner === "Kids" ? "oklch(0.68 0.2 280)" : (OWNER_COLORS[owner.owner] ?? OWNER_COLORS.Unknown),
  }));

  return (
    <section className="grid gap-4 lg:grid-cols-4">
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
            const color = owner.owner === "Kids" ? "oklch(0.68 0.2 280)" : (OWNER_COLORS[owner.owner] ?? OWNER_COLORS.Unknown);
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
