"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountMultiSelect } from "@/components/ui/AccountMultiSelect";
import { PortfolioMetricsRow } from "@/components/portfolio/PortfolioMetricsRow";
import { PortfolioFilterBar, type AssetClassFilter } from "@/components/portfolio/PortfolioFilterBar";
import { StrategyPositionsTable } from "@/components/portfolio/StrategyPositionsTable";
import { UnlinkedPositionsTable } from "@/components/portfolio/UnlinkedPositionsTable";
import { PortfolioCharts } from "@/components/portfolio/PortfolioCharts";
import { calculateCostBasis } from "@/lib/formatters";
import { formatDateShort } from "@/lib/formatters";
import type { Account } from "@/db/schema";
import type { PortfolioDashboardData, PortfolioPositionsData, PortfolioPositionRow, PortfolioStrategyRow } from "@/db/queries/portfolio";

export default function PortfolioDashboardPage() {
  return (
    <Suspense fallback={
      <DashboardShell activeNav="portfolio" title="Portfolio" subtitle="Loading...">
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </DashboardShell>
    }>
      <PortfolioDashboardContent />
    </Suspense>
  );
}

function PortfolioDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [positionsData, setPositionsData] = useState<PortfolioPositionsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClassFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Parse selected account IDs from URL
  const selectedAccountIds = useMemo(() => {
    const param = searchParams.get("accountIds");
    if (!param) return null;
    if (param === "none") return [];
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

  // Effective selected IDs
  const effectiveSelectedIds = useMemo(() => {
    if (selectedAccountIds === null) {
      return accounts.map((a) => a.id);
    }
    return selectedAccountIds;
  }, [selectedAccountIds, accounts]);

  // Fetch both dashboard data and positions data in parallel
  useEffect(() => {
    async function fetchData() {
      if (accounts.length === 0) return;

      setIsLoading(true);
      try {
        const accountIdsParam = effectiveSelectedIds.join(",");
        const [dashRes, posRes] = await Promise.all([
          fetch(`/api/dashboard/portfolio?accountIds=${accountIdsParam}`),
          fetch(`/api/dashboard/portfolio/positions?accountIds=${accountIdsParam}`),
        ]);

        if (!dashRes.ok) throw new Error("Failed to fetch dashboard data");
        if (!posRes.ok) throw new Error("Failed to fetch positions data");

        const [dashData, posData] = await Promise.all([dashRes.json(), posRes.json()]);
        setDashboardData(dashData);
        setPositionsData(posData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [accounts, effectiveSelectedIds]);

  // Update URL when selection changes
  const handleAccountSelectionChange = useCallback(
    (newSelection: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newSelection.length === accounts.length) {
        params.delete("accountIds");
      } else if (newSelection.length === 0) {
        params.set("accountIds", "none");
      } else {
        params.set("accountIds", newSelection.join(","));
      }
      const query = params.toString();
      router.push(`/dashboard/portfolio${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, searchParams, accounts.length]
  );

  // Apply filters to positions data
  const filteredData = useMemo(() => {
    if (!positionsData) return { strategies: [], unlinkedPositions: [] };

    const filterPositions = (positions: PortfolioPositionRow[]) => {
      let filtered = positions;

      // Asset class filter
      if (assetClassFilter !== "all") {
        filtered = filtered.filter((p) => p.assetClass === assetClassFilter);
      }

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((p) =>
          p.symbol.toLowerCase().includes(q) ||
          (p.underlyingTicker?.toLowerCase().includes(q) ?? false)
        );
      }

      return filtered;
    };

    // Filter strategies - keep strategy if any position matches
    const filteredStrategies: PortfolioStrategyRow[] = [];
    for (const strategy of positionsData.strategies) {
      // Check if strategy label matches search
      const strategyMatchesSearch = searchQuery
        ? strategy.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          strategy.strategyKey.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      const filteredPositions = filterPositions(strategy.positions);

      // Include strategy if it has matching positions OR if the strategy itself matches search
      if (filteredPositions.length > 0 || (strategyMatchesSearch && assetClassFilter === "all")) {
        filteredStrategies.push({
          ...strategy,
          positions: strategyMatchesSearch && assetClassFilter === "all" && filteredPositions.length === 0
            ? strategy.positions // Show all positions if strategy matched but individual positions didn't
            : filteredPositions,
        });
      }
    }

    return {
      strategies: filteredStrategies.filter((s) => s.positions.length > 0),
      unlinkedPositions: filterPositions(positionsData.unlinkedPositions),
    };
  }, [positionsData, assetClassFilter, searchQuery]);

  // Compute totals from all positions
  const totals = useMemo(() => {
    if (!positionsData) return { marketValue: 0, costBasis: 0, unrealizedPnl: 0, positionCount: 0 };

    const allPositions = [
      ...positionsData.strategies.flatMap((s) => s.positions),
      ...positionsData.unlinkedPositions,
    ];

    let marketValue = 0;
    let costBasis = 0;
    let unrealizedPnl = 0;

    for (const pos of allPositions) {
      marketValue += Math.abs(pos.absNotional ?? 0);
      const cb = calculateCostBasis(pos);
      if (cb != null) costBasis += cb;
      unrealizedPnl += pos.unrealizedPnl ?? 0;
    }

    return { marketValue, costBasis, unrealizedPnl, positionCount: allPositions.length };
  }, [positionsData]);

  // Filtered counts
  const filteredCounts = useMemo(() => {
    const positionCount = filteredData.strategies.reduce((sum, s) => sum + s.positions.length, 0)
      + filteredData.unlinkedPositions.length;
    return {
      strategyCount: filteredData.strategies.length,
      positionCount,
    };
  }, [filteredData]);

  // Subtitle
  const subtitle = useMemo(() => {
    if (effectiveSelectedIds.length === accounts.length && accounts.length > 0) return "All Accounts";
    if (effectiveSelectedIds.length === 0) return "No Accounts Selected";
    if (effectiveSelectedIds.length === 1) {
      const account = accounts.find((a) => a.id === effectiveSelectedIds[0]);
      return account?.label || account?.brokerAccountId || "1 Account";
    }
    return `${effectiveSelectedIds.length} Accounts`;
  }, [effectiveSelectedIds, accounts]);

  // Loading state
  if (accounts.length === 0 && isLoading) {
    return (
      <DashboardShell activeNav="portfolio" title="Portfolio" subtitle="Loading...">
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading accounts...</div>
        </div>
      </DashboardShell>
    );
  }

  // Error state
  if (error && accounts.length === 0) {
    return (
      <DashboardShell activeNav="portfolio" title="Portfolio" subtitle="Error">
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          {error}
        </div>
      </DashboardShell>
    );
  }

  // No accounts
  if (accounts.length === 0) {
    return (
      <DashboardShell activeNav="portfolio" title="Portfolio" subtitle="Get started">
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          No accounts found. Head to{" "}
          <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a>{" "}
          to add one.
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activeNav="portfolio" title="Portfolio" subtitle={subtitle}>
      {/* Top bar: Account filter + asset class filter + search */}
      <div className="flex flex-wrap items-center gap-3">
        <AccountMultiSelect
          accounts={accounts}
          selected={effectiveSelectedIds}
          onChange={handleAccountSelectionChange}
        />
        {positionsData && positionsData.snapshotDate && (
          <span className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            {formatDateShort(positionsData.snapshotDate)}
          </span>
        )}
        {isLoading && <span className="text-xs text-muted-foreground">Updating...</span>}
      </div>

      {/* Metrics */}
      <PortfolioMetricsRow
        nav={positionsData?.nav ?? null}
        totalMarketValue={totals.marketValue}
        totalCostBasis={totals.costBasis}
        totalUnrealizedPnl={totals.unrealizedPnl}
        snapshotDate={positionsData?.snapshotDate ?? null}
      />

      {/* Charts */}
      {dashboardData && <PortfolioCharts dashboardData={dashboardData} />}

      {/* Filter bar */}
      {positionsData && (
        <PortfolioFilterBar
          assetClassFilter={assetClassFilter}
          onAssetClassFilterChange={setAssetClassFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          positionCount={filteredCounts.positionCount}
          strategyCount={filteredCounts.strategyCount}
        />
      )}

      {/* Strategies table */}
      {filteredData.strategies.length > 0 && (
        <StrategyPositionsTable
          strategies={filteredData.strategies}
          nav={positionsData?.nav ?? null}
        />
      )}

      {/* Unlinked positions */}
      {filteredData.unlinkedPositions.length > 0 && (
        <UnlinkedPositionsTable positions={filteredData.unlinkedPositions} />
      )}

      {/* Empty state */}
      {positionsData && filteredData.strategies.length === 0 && filteredData.unlinkedPositions.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          {searchQuery || assetClassFilter !== "all"
            ? "No positions match the current filters."
            : "No open positions found. Run position ingestion to populate data."}
        </div>
      )}
    </DashboardShell>
  );
}
