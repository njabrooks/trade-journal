"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ReconciliationSummary } from "@/components/accounting/ReconciliationSummary";
import {
  ReconciliationNavChart,
  type TimeRange,
} from "@/components/accounting/ReconciliationNavChart";
import { ReconciliationOwnerTable } from "@/components/accounting/ReconciliationOwnerTable";
import { ReconciliationPositionTable } from "@/components/accounting/ReconciliationPositionTable";
import type { ReconciliationData } from "@/db/queries/reconciliation";
import type { NavComparisonPoint } from "@/db/queries/reconciliation";

export default function ReconciliationPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("1Y");
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [navData, setNavData] = useState<NavComparisonPoint[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/accounting/reconciliation");
      if (!res.ok) throw new Error("Failed to fetch reconciliation data");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch main reconciliation data once on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch NAV comparison when time range changes
  useEffect(() => {
    async function fetchNav() {
      try {
        const res = await fetch(
          `/api/dashboard/accounting/reconciliation/nav?range=${timeRange}`
        );
        if (!res.ok) throw new Error("Failed to fetch NAV comparison");
        const json = await res.json();
        setNavData(json);
      } catch (err) {
        console.error("Failed to fetch NAV comparison:", err);
      }
    }
    fetchNav();
  }, [timeRange]);

  if (error && !data) {
    return (
      <DashboardShell activeNav="accounting-reconciliation" title="Reconciliation">
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          {error}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activeNav="accounting-reconciliation" title="Reconciliation">
      {isLoading && !data && (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      )}

      {data && (
        <>
          <ReconciliationSummary
            summary={data.summary}
            bottleneck={data.bottleneck}
          />

          {navData && (
            <ReconciliationNavChart
              data={navData}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
            />
          )}

          <ReconciliationOwnerTable owners={data.ownerBreakdown} />

          <ReconciliationPositionTable
            positions={data.positions}
            onResolutionAction={fetchData}
          />
        </>
      )}
    </DashboardShell>
  );
}
