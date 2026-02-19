"use client";

import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { AccountingSummary } from "@/db/queries/accounting";

function MetricCard({
  label,
  value,
  subtitle,
  subtitleColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  subtitleColor?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
      {subtitle && (
        <p className={`mt-1 text-xs ${subtitleColor ?? "text-muted-foreground"}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

interface AccountingMetricsRowProps {
  summary: AccountingSummary;
  realizedPnl: number;
}

export function AccountingMetricsRow({
  summary,
  realizedPnl,
}: AccountingMetricsRowProps) {
  const unrealizedColor =
    summary.unrealizedGain >= 0 ? "text-emerald-600" : "text-red-500";

  return (
    <section className="grid gap-4 sm:grid-cols-5">
      <MetricCard label="NAV" value={formatCurrency(summary.nav)} />
      <MetricCard
        label="Book Value"
        value={formatCurrency(summary.bookValue)}
      />
      <MetricCard
        label="Unrealized P&L"
        value={formatCurrency(summary.unrealizedGain)}
        subtitle={formatPercent(summary.unrealizedGainPercent)}
        subtitleColor={unrealizedColor}
      />
      <MetricCard
        label="Realized P&L"
        value={formatCurrency(realizedPnl)}
        subtitleColor={realizedPnl >= 0 ? "text-emerald-600" : "text-red-500"}
      />
      <MetricCard
        label="Positions"
        value={summary.positionCount.toLocaleString()}
      />
    </section>
  );
}
