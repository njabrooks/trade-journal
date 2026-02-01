"use client";

import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  valueClass?: string;
}

function MetricCard({ label, value, subtitle, valueClass }: MetricCardProps) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold", valueClass ?? "text-foreground")}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

interface PortfolioMetricsRowProps {
  nav: number | null;
  totalMarketValue: number;
  totalCostBasis: number;
  totalUnrealizedPnl: number;
  snapshotDate: string | null;
}

export function PortfolioMetricsRow({
  nav,
  totalMarketValue,
  totalCostBasis,
  totalUnrealizedPnl,
  snapshotDate,
}: PortfolioMetricsRowProps) {
  const pnlReturn = totalCostBasis > 0
    ? ((totalUnrealizedPnl / totalCostBasis) * 100).toFixed(1) + '%'
    : undefined;

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="NAV"
        value={formatCurrency(nav)}
        subtitle={snapshotDate ? `As of ${snapshotDate}` : undefined}
      />
      <MetricCard
        label="Market Value"
        value={formatCurrency(totalMarketValue)}
      />
      <MetricCard
        label="Cost Basis"
        value={formatCurrency(totalCostBasis)}
      />
      <MetricCard
        label="Unrealized P&L"
        value={formatCurrency(totalUnrealizedPnl)}
        subtitle={pnlReturn ? `${pnlReturn} return` : undefined}
        valueClass={totalUnrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
      />
    </section>
  );
}
