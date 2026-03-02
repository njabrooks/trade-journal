"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountingMetricsRow } from "@/components/accounting/AccountingMetricsRow";
import {
  AccountingNavChart,
  type TimeRange,
} from "@/components/accounting/AccountingNavChart";
import { AccountingBreakdowns } from "@/components/accounting/AccountingBreakdowns";
import { AccountingPositionsTable } from "@/components/accounting/AccountingPositionsTable";
import { PriceFreshness } from "@/components/accounting/PriceFreshness";
import { formatDateShort } from "@/lib/formatters";
import type {
  AccountingDashboardData,
  AccountingPositionRow,
} from "@/db/queries/accounting";

type Currency = "USD" | "GBP";

export default function AccountingDashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("1Y");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [dashboardData, setDashboardData] =
    useState<AccountingDashboardData | null>(null);
  const [positions, setPositions] = useState<AccountingPositionRow[] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data when time range or currency changes
  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(
          `/api/dashboard/accounting?range=${timeRange}&currency=${currency}`
        );
        if (!res.ok) throw new Error("Failed to fetch accounting data");
        const data = await res.json();
        setDashboardData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      }
    }
    fetchDashboard();
  }, [timeRange, currency]);

  // Fetch positions when currency changes
  useEffect(() => {
    async function fetchPositions() {
      try {
        const res = await fetch(`/api/dashboard/accounting/positions?currency=${currency}`);
        if (!res.ok) throw new Error("Failed to fetch positions");
        const data = await res.json();
        setPositions(data);
      } catch (err) {
        console.error("Failed to fetch positions:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPositions();
  }, [currency]);

  if (error && !dashboardData) {
    return (
      <DashboardShell activeNav="accounting" title="Accounting">
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          {error}
        </div>
      </DashboardShell>
    );
  }

  const subtitle = dashboardData?.summary.latestDate
    ? `As of ${formatDateShort(dashboardData.summary.latestDate)}`
    : isLoading
      ? "Loading..."
      : undefined;

  return (
    <DashboardShell activeNav="accounting" title="Accounting" subtitle={subtitle}>
      {/* Currency toggle */}
      <div className="flex items-center gap-1">
        {(["USD", "GBP"] as Currency[]).map((c) => (
          <button
            key={c}
            onClick={() => setCurrency(c)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              currency === c
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground border"
            }`}
          >
            {c === "USD" ? "$ USD" : "\u00a3 GBP"}
          </button>
        ))}
      </div>

      {isLoading && !dashboardData && (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      )}

      {dashboardData && (
        <>
          <AccountingMetricsRow
            summary={dashboardData.summary}
            realizedPnl={dashboardData.realizedPnl}
            currency={currency}
          />

          <AccountingNavChart
            data={dashboardData.navTimeSeries}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            currency={currency}
          />

          <AccountingBreakdowns
            ownerBreakdown={dashboardData.ownerBreakdown}
            assetClassBreakdown={dashboardData.assetClassBreakdown}
            summary={dashboardData.summary}
            realizedPnl={dashboardData.realizedPnl}
            currency={currency}
          />
        </>
      )}

      <PriceFreshness />

      {positions && <AccountingPositionsTable positions={positions} currency={currency} />}

      <div className="flex justify-end">
        <Link
          href="/dashboard/accounting/reconciliation"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
        >
          Reconciliation (Snapshot vs Event-Sourced)
        </Link>
      </div>
    </DashboardShell>
  );
}
