"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountingMetricsRow } from "@/components/accounting/AccountingMetricsRow";
import {
  AccountingNavChart,
  type TimeRange,
} from "@/components/accounting/AccountingNavChart";
import { AccountingBreakdowns } from "@/components/accounting/AccountingBreakdowns";
import { AccountingPositionsTable } from "@/components/accounting/AccountingPositionsTable";
import { formatDateShort } from "@/lib/formatters";
import type {
  AccountingDashboardData,
  AccountingPositionRow,
} from "@/db/queries/accounting";

export default function AccountingDashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("1Y");
  const [dashboardData, setDashboardData] =
    useState<AccountingDashboardData | null>(null);
  const [positions, setPositions] = useState<AccountingPositionRow[] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data when time range changes
  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(
          `/api/dashboard/accounting?range=${timeRange}`
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
  }, [timeRange]);

  // Fetch positions once on mount
  useEffect(() => {
    async function fetchPositions() {
      try {
        const res = await fetch("/api/dashboard/accounting/positions");
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
  }, []);

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
          />

          <AccountingNavChart
            data={dashboardData.navTimeSeries}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />

          <AccountingBreakdowns
            ownerBreakdown={dashboardData.ownerBreakdown}
            assetClassBreakdown={dashboardData.assetClassBreakdown}
            summary={dashboardData.summary}
            realizedPnl={dashboardData.realizedPnl}
          />
        </>
      )}

      {positions && <AccountingPositionsTable positions={positions} />}
    </DashboardShell>
  );
}
