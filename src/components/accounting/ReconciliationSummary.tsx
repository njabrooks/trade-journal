"use client";

import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { ReconciliationSummaryData } from "@/db/queries/reconciliation";

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
        <p
          className={`mt-1 text-xs ${subtitleColor ?? "text-muted-foreground"}`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function buildDiscrepancySubtitle(summary: ReconciliationSummaryData): string {
  const parts: string[] = [];
  const unresolved = summary.unresolvedCount ?? 0;
  const flagged = summary.flaggedCount ?? 0;
  const accepted = summary.acceptedCount ?? 0;
  const resolved = summary.resolvedCount ?? 0;

  if (unresolved > 0) parts.push(`${unresolved} unresolved`);
  if (flagged > 0) parts.push(`${flagged} flagged`);
  if (accepted > 0) parts.push(`${accepted} accepted`);
  if (resolved > 0) parts.push(`${resolved} resolved`);

  if (parts.length === 0) return "All discrepancies resolved";
  return parts.join(", ");
}

interface ReconciliationSummaryProps {
  summary: ReconciliationSummaryData;
}

export function ReconciliationSummary({ summary }: ReconciliationSummaryProps) {
  const deltaColor =
    Math.abs(summary.navDeltaPct) < 1
      ? "text-emerald-600"
      : Math.abs(summary.navDeltaPct) < 5
        ? "text-amber-600"
        : "text-red-500";

  const matchRate =
    summary.totalPositions > 0
      ? (summary.matchedPositions / summary.totalPositions) * 100
      : 0;

  const freshnessLabel = summary.eventSourceFreshness
    ?.map((s) => `${s.source}: ${s.lastEventDate}`)
    .join(", ");

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <span className="font-medium">Comparing at {summary.comparisonDate}</span>
        {" — "}last date with complete event data across all sources.
        {freshnessLabel && (
          <span className="ml-1 text-blue-600 dark:text-blue-400">
            ({freshnessLabel})
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <MetricCard
          label="Snapshot NAV"
          value={formatCurrency(summary.snapshotNav)}
          subtitle={`snapshot at ${summary.snapshotDate}`}
        />
        <MetricCard
          label="Event-Sourced NAV"
          value={formatCurrency(summary.eventSourcedNav)}
          subtitle={`at ${summary.eventSourcedDate}`}
        />
        <MetricCard
          label="NAV Delta"
          value={formatCurrency(summary.navDelta)}
          subtitle={formatPercent(summary.navDeltaPct)}
          subtitleColor={deltaColor}
        />
        <MetricCard
          label="Position Match"
          value={`${summary.matchedPositions}/${summary.totalPositions}`}
          subtitle={formatPercent(matchRate) + " match rate"}
          subtitleColor={
            matchRate > 80
              ? "text-emerald-600"
              : matchRate > 50
                ? "text-amber-600"
                : "text-red-500"
          }
        />
        <MetricCard
          label="Discrepancies"
          value={((summary.unresolvedCount ?? 0) + (summary.flaggedCount ?? 0)).toLocaleString()}
          subtitle={buildDiscrepancySubtitle(summary)}
          subtitleColor={
            (summary.unresolvedCount ?? 0) + (summary.flaggedCount ?? 0) === 0
              ? "text-emerald-600"
              : (summary.unresolvedCount ?? 0) + (summary.flaggedCount ?? 0) > 10
                ? "text-red-500"
                : "text-amber-600"
          }
        />
      </div>
    </section>
  );
}
