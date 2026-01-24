"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Sparkline } from "@/components/charts/Sparkline";
import { StackedBar } from "@/components/charts/StackedBar";
import { AccountMultiSelect } from "@/components/ui/AccountMultiSelect";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
} from "@/lib/formatters";
import type { Account } from "@/db/schema";
import type { PortfolioDashboardData } from "@/db/queries/portfolio";

export default function PortfolioDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse selected account IDs from URL
  const selectedAccountIds = useMemo(() => {
    const param = searchParams.get("accountIds");
    if (!param) return null; // null means "all accounts"
    if (param === "none") return []; // explicit empty selection
    return param.split(",").filter(Boolean);
  }, [searchParams]);

  // Fetch accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) throw new Error("Failed to fetch accounts");
        const data = await res.json();
        setAccounts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      }
    }
    fetchAccounts();
  }, []);

  // Effective selected IDs: either from URL or all accounts (null = all)
  const effectiveSelectedIds = useMemo(() => {
    if (selectedAccountIds === null) {
      // No param = default to all accounts
      return accounts.map((a) => a.id);
    }
    // Explicit selection (including empty)
    return selectedAccountIds;
  }, [selectedAccountIds, accounts]);

  // Fetch dashboard data when selection changes
  useEffect(() => {
    async function fetchDashboardData() {
      if (accounts.length === 0) return;

      setIsLoading(true);
      try {
        const accountIdsParam = effectiveSelectedIds.join(",");
        const res = await fetch(`/api/dashboard/portfolio?accountIds=${accountIdsParam}`);
        if (!res.ok) throw new Error("Failed to fetch dashboard data");
        const data = await res.json();
        setDashboardData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      } finally {
        setIsLoading(false);
      }
    }
    fetchDashboardData();
  }, [accounts, effectiveSelectedIds]);

  // Update URL when selection changes
  const handleAccountSelectionChange = useCallback(
    (newSelection: string[]) => {
      const params = new URLSearchParams(searchParams.toString());

      if (newSelection.length === accounts.length) {
        // All selected: clear the param (defaults to all)
        params.delete("accountIds");
      } else if (newSelection.length === 0) {
        // None selected: explicitly set empty (different from "all")
        params.set("accountIds", "none");
      } else {
        params.set("accountIds", newSelection.join(","));
      }

      const query = params.toString();
      router.push(`/dashboard/portfolio${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, searchParams, accounts.length]
  );

  // Compute subtitle based on selection
  const subtitle = useMemo(() => {
    if (effectiveSelectedIds.length === accounts.length && accounts.length > 0) {
      return "All Accounts";
    }
    if (effectiveSelectedIds.length === 0) {
      return "No Accounts Selected";
    }
    if (effectiveSelectedIds.length === 1) {
      const account = accounts.find((a) => a.id === effectiveSelectedIds[0]);
      return account?.label || account?.brokerAccountId || "1 Account";
    }
    return `${effectiveSelectedIds.length} Accounts`;
  }, [effectiveSelectedIds, accounts]);

  // Render loading state
  if (accounts.length === 0 && isLoading) {
    return (
      <DashboardShell
        activeNav="portfolio"
        title="Portfolio Overview"
        subtitle="Loading..."
      >
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading accounts...</div>
        </div>
      </DashboardShell>
    );
  }

  // Render error state
  if (error && accounts.length === 0) {
    return (
      <DashboardShell
        activeNav="portfolio"
        title="Portfolio Overview"
        subtitle="Error"
      >
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          {error}
        </div>
      </DashboardShell>
    );
  }

  // Render no accounts state
  if (accounts.length === 0) {
    return (
      <DashboardShell
        activeNav="portfolio"
        title="Portfolio Overview"
        subtitle="Create an account to see aggregated exposure."
      >
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          No accounts found. Head to{" "}
          <a href="/admin/accounts" className="text-blue-600 underline">
            Admin &gt; Accounts
          </a>{" "}
          to add one.
        </div>
      </DashboardShell>
    );
  }

  // Prepare data for rendering
  const latestNav = dashboardData?.navTrend.at(-1)?.nav ?? null;
  const latestSnapshot = dashboardData?.latestAccountSnapshot ?? null;
  const latestStockNotional = Math.abs(latestSnapshot?.absStockNotional ?? 0);
  const latestOptionNotional = Math.abs(latestSnapshot?.absOptionNotional ?? 0);

  const navSparklineData = (dashboardData?.navTrend ?? []).map((point) => ({
    label: formatDateLabel(point.date),
    value: point.nav,
  }));

  const notionalSparklineData = (dashboardData?.accountSnapshots ?? []).map((point) => ({
    label: formatDateLabel(point.date),
    value: point.totalAbsNotional,
  }));

  const snapshotRows = (dashboardData?.accountSnapshots ?? []).slice(-8).reverse();

  return (
    <DashboardShell activeNav="portfolio" title="Portfolio Overview" subtitle={subtitle}>
      {/* Account Filter Bar */}
      <div className="flex items-center gap-4">
        <AccountMultiSelect
          accounts={accounts}
          selected={effectiveSelectedIds}
          onChange={handleAccountSelectionChange}
        />
        {isLoading && (
          <span className="text-xs text-muted-foreground">Updating...</span>
        )}
      </div>

      {/* Metric Cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="NAV"
          value={formatCurrency(latestNav)}
          delta={navSparklineData.at(-1)?.label}
        />
        <MetricCard
          label="Total Abs Notional"
          value={formatCurrency(latestSnapshot?.totalAbsNotional ?? null)}
          delta={formatPercent(latestSnapshot?.pctNavAbsNotional ?? null)}
        />
        <MetricCard
          label="Unrealized PnL"
          value={formatCurrency(latestSnapshot?.totalUnrealizedPnl ?? null)}
          valueClass={
            (latestSnapshot?.totalUnrealizedPnl ?? 0) >= 0
              ? "text-emerald-600"
              : "text-rose-600"
          }
        />
      </section>

      {/* Charts Section */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">NAV Trend</p>
              <p className="text-2xl font-semibold text-foreground">
                {formatCurrency(latestNav)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {navSparklineData.length} days
            </span>
          </div>
          <div className="mt-4 h-32">
            <Sparkline data={navSparklineData} stroke="#2563eb" showHighLow />
          </div>
          <div className="mt-8 flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Abs Notional Trend</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(latestSnapshot?.totalAbsNotional ?? null)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {notionalSparklineData.length} days
            </span>
          </div>
          <div className="mt-4 h-28">
            <Sparkline data={notionalSparklineData} stroke="#16a34a" showHighLow />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Exposure Mix</p>
            <div className="mt-4">
              <StackedBar
                segments={[
                  { label: "Stock", value: latestStockNotional, color: "oklch(0.63 0.2 250)" },
                  { label: "Options", value: latestOptionNotional, color: "oklch(0.7 0.24 30)" },
                ]}
              />
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.63_0.2_250)]" />
                  <span>Stock</span>
                </div>
                <span className="font-medium">{formatCurrency(latestStockNotional)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.7_0.24_30)]" />
                  <span>Options</span>
                </div>
                <span className="font-medium">{formatCurrency(latestOptionNotional)}</span>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Leverage vs NAV</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatPercent(latestSnapshot?.pctNavAbsNotional ?? null, 1)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Abs notional as % of NAV
            </p>
          </div>
        </div>
      </section>

      {/* Tables Section */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Top Underlyings</p>
              <p className="text-xs text-muted-foreground">
                Latest snapshot {formatDateLabel(latestSnapshot?.date ?? null)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {dashboardData?.underlyingBreakdown.length ?? 0} rows
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4">Abs Notional</th>
                  <th className="py-2 pr-4">Unrealized</th>
                  <th className="py-2">Pct NAV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {(dashboardData?.underlyingBreakdown ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No underlying level snapshots captured for the latest date.
                    </td>
                  </tr>
                ) : (
                  (dashboardData?.underlyingBreakdown ?? []).map((row) => (
                    <tr key={row.underlyingId}>
                      <td className="py-2 pr-4 font-medium text-foreground">
                        {row.ticker || row.underlyingId.slice(0, 6)}
                      </td>
                      <td className="py-2 pr-4">{formatCurrency(row.totalAbsNotional ?? null)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            row.totalUnrealizedPnl && row.totalUnrealizedPnl >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }
                        >
                          {formatCurrency(row.totalUnrealizedPnl ?? null)}
                        </span>
                      </td>
                      <td className="py-2">{formatPercent(row.pctNavAbsNotional ?? null)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Recent Snapshots</p>
            <span className="text-xs text-muted-foreground">
              Last {snapshotRows.length} days
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Abs Notional</th>
                  <th className="py-2 pr-4">PnL</th>
                  <th className="py-2">Pct NAV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {snapshotRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No portfolio snapshots captured yet.
                    </td>
                  </tr>
                ) : (
                  snapshotRows.map((row) => (
                    <tr key={row.date}>
                      <td className="py-2 pr-4">{formatDateLabel(row.date)}</td>
                      <td className="py-2 pr-4">{formatCurrency(row.totalAbsNotional ?? null)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            row.totalUnrealizedPnl && row.totalUnrealizedPnl >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }
                        >
                          {formatCurrency(row.totalUnrealizedPnl ?? null)}
                        </span>
                      </td>
                      <td className="py-2">{formatPercent(row.pctNavAbsNotional ?? null)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  valueClass?: string;
}

function MetricCard({ label, value, delta, valueClass }: MetricCardProps) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass ?? "text-foreground"}`}>{value}</p>
      {delta ? <p className="mt-1 text-xs text-muted-foreground">{delta}</p> : null}
    </div>
  );
}
