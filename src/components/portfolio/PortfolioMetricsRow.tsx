"use client";

import { formatCurrency } from "@/lib/formatters";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
}

function MetricCard({ label, value, subtitle }: MetricCardProps) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

interface PortfolioMetricsRowProps {
  totalMarketValue: number;
  positionCount: number;
  underlyingCount: number;
  snapshotDate: string | null;
}

export function PortfolioMetricsRow({
  totalMarketValue,
  positionCount,
  underlyingCount,
  snapshotDate,
}: PortfolioMetricsRowProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        label="Market Value"
        value={formatCurrency(totalMarketValue)}
        subtitle={snapshotDate ? `As of ${snapshotDate}` : undefined}
      />
      <MetricCard
        label="Positions"
        value={positionCount.toLocaleString()}
      />
      <MetricCard
        label="Underlyings"
        value={underlyingCount.toLocaleString()}
      />
    </section>
  );
}
