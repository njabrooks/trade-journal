"use client";

import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { PortfolioMetricsRow } from "@/components/portfolio/PortfolioMetricsRow";
import {
  PortfolioUnifiedFilterBar,
  type AssetClassFilter,
  type OwnerFilter,
  type SourceFilter,
  accountMatchesOwnerFilter,
  accountMatchesSourceFilter,
} from "@/components/portfolio/PortfolioUnifiedFilterBar";
import { UnderlyingStrategyTable } from "@/components/portfolio/UnderlyingStrategyTable";
import { UnlinkedPositionsTable } from "@/components/portfolio/UnlinkedPositionsTable";
import { PortfolioCharts } from "@/components/portfolio/PortfolioCharts";
import { formatDateShort } from "@/lib/formatters";
import type { Account } from "@/db/schema";
import { formatCurrency } from "@/lib/formatters";
import type {
  PortfolioDashboardData,
  PortfolioPositionsData,
  PortfolioPositionRow,
  PortfolioStrategyRow,
  CashBreakdownRow,
} from "@/db/queries/portfolio";

export default function PortfolioDashboardPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell activeNav="portfolio" title="Portfolio" subtitle="Loading...">
          <div className="flex h-64 items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </DashboardShell>
      }
    >
      <PortfolioDashboardContent />
    </Suspense>
  );
}

function PortfolioDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [positionsData, setPositionsData] = useState<PortfolioPositionsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClassFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Track if this is the initial load to prevent URL update race condition
  const isInitialLoad = useRef(true);

  // Parse selected account IDs from URL
  const selectedAccountIdsFromUrl = useMemo(() => {
    const param = searchParams.get("accountIds");
    if (!param) return null; // null means "all accounts"
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
        setAccountsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
        setAccountsLoaded(true);
      }
    }
    fetchAccounts();
  }, []);

  // Effective selected IDs - only compute after accounts are loaded
  const effectiveSelectedIds = useMemo(() => {
    if (!accountsLoaded || accounts.length === 0) {
      return []; // Return empty while loading to prevent premature fetches
    }
    if (selectedAccountIdsFromUrl === null) {
      return accounts.map((a) => a.id); // Default to all accounts
    }
    // Validate that URL IDs exist in accounts list
    return selectedAccountIdsFromUrl.filter((id) =>
      accounts.some((a) => a.id === id)
    );
  }, [selectedAccountIdsFromUrl, accounts, accountsLoaded]);

  // Fetch both dashboard data and positions data in parallel
  useEffect(() => {
    async function fetchData() {
      if (!accountsLoaded || accounts.length === 0) return;
      if (effectiveSelectedIds.length === 0 && selectedAccountIdsFromUrl !== null) {
        // Explicit "none" selected
        setDashboardData(null);
        setPositionsData(null);
        setIsLoading(false);
        return;
      }

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
        isInitialLoad.current = false;
      }
    }
    fetchData();
  }, [accounts, effectiveSelectedIds, accountsLoaded, selectedAccountIdsFromUrl]);

  // Update URL when selection changes - but not on initial load
  const handleAccountSelectionChange = useCallback(
    (newSelection: string[]) => {
      if (!accountsLoaded || isInitialLoad.current) return;

      const params = new URLSearchParams(searchParams.toString());
      if (newSelection.length === accounts.length && newSelection.length > 0) {
        params.delete("accountIds");
      } else if (newSelection.length === 0) {
        params.set("accountIds", "none");
      } else {
        params.set("accountIds", newSelection.join(","));
      }
      const query = params.toString();
      router.push(`/dashboard/portfolio${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, searchParams, accounts.length, accountsLoaded]
  );

  // Filter accounts by owner and source, then update selection
  const filteredAccountsByOwnerAndSource = useMemo(() => {
    return accounts.filter(
      (a) =>
        accountMatchesOwnerFilter(a, ownerFilter) &&
        accountMatchesSourceFilter(a, sourceFilter)
    );
  }, [accounts, ownerFilter, sourceFilter]);

  // When owner or source filter changes, update account selection
  useEffect(() => {
    if (!accountsLoaded || isInitialLoad.current) return;

    // When both filters are "all", reset to all accounts
    if (ownerFilter === "all" && sourceFilter === "all") {
      const allIds = accounts.map((a) => a.id);
      const sortedAll = [...allIds].sort();
      const sortedEffective = [...effectiveSelectedIds].sort();
      // Only update if not already showing all accounts
      if (JSON.stringify(sortedAll) !== JSON.stringify(sortedEffective)) {
        handleAccountSelectionChange(allIds);
      }
      return;
    }

    const filteredIds = filteredAccountsByOwnerAndSource.map((a) => a.id);
    // Only update if different from current selection
    const sortedFiltered = [...filteredIds].sort();
    const sortedEffective = [...effectiveSelectedIds].sort();
    if (JSON.stringify(sortedFiltered) !== JSON.stringify(sortedEffective)) {
      handleAccountSelectionChange(filteredIds);
    }
  }, [
    ownerFilter,
    sourceFilter,
    filteredAccountsByOwnerAndSource,
    effectiveSelectedIds,
    handleAccountSelectionChange,
    accountsLoaded,
    accounts,
  ]);

  // Apply filters to positions data
  const filteredData = useMemo(() => {
    if (!positionsData) return { strategies: [], unlinkedPositions: [] };

    const filterPositions = (positions: PortfolioPositionRow[]) => {
      let filtered = positions;

      // Asset class filter
      if (assetClassFilter !== "all") {
        if (assetClassFilter === "CASH") {
          // Cash filter: no positions match (cash is separate from positions)
          filtered = [];
        } else if (assetClassFilter === "CRYPTO") {
          // "Crypto" filter matches both spot (CRYPTO) and perpetuals (PERP)
          filtered = filtered.filter(
            (p) => p.assetClass === "CRYPTO" || p.assetClass === "PERP"
          );
        } else {
          filtered = filtered.filter((p) => p.assetClass === assetClassFilter);
        }
      }

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (p) =>
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
      if (
        filteredPositions.length > 0 ||
        (strategyMatchesSearch && assetClassFilter === "all")
      ) {
        filteredStrategies.push({
          ...strategy,
          positions:
            strategyMatchesSearch &&
            assetClassFilter === "all" &&
            filteredPositions.length === 0
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
    if (!positionsData)
      return { marketValue: 0, positionCount: 0, underlyingCount: 0 };

    const allPositions = [
      ...positionsData.strategies.flatMap((s) => s.positions),
      ...positionsData.unlinkedPositions,
    ];

    let marketValue = 0;
    const underlyingIds = new Set<string>();

    for (const pos of allPositions) {
      marketValue += Math.abs(pos.absNotionalUsd ?? pos.absNotional ?? 0);
      if (pos.underlyingId) underlyingIds.add(pos.underlyingId);
    }

    return {
      marketValue,
      positionCount: allPositions.length,
      underlyingCount: underlyingIds.size,
    };
  }, [positionsData]);

  // Compute exposure breakdown by asset class from positions
  const exposureBreakdown = useMemo(() => {
    if (!positionsData)
      return { equities: 0, options: 0, cryptoSpot: 0, perpetuals: 0, cash: 0 };

    const allPositions = [
      ...positionsData.strategies.flatMap((s) => s.positions),
      ...positionsData.unlinkedPositions,
    ];

    let equities = 0;
    let options = 0;
    let cryptoSpot = 0;
    let perpetuals = 0;

    for (const pos of allPositions) {
      const notional = Math.abs(pos.absNotionalUsd ?? pos.absNotional ?? 0);
      if (pos.assetClass === "STK") equities += notional;
      else if (pos.assetClass === "OPT") options += notional;
      else if (pos.assetClass === "CRYPTO") cryptoSpot += notional;
      else if (pos.assetClass === "PERP") perpetuals += notional;
    }

    const cash = positionsData.totalCashUsd ?? 0;

    return { equities, options, cryptoSpot, perpetuals, cash };
  }, [positionsData]);

  // Filtered counts
  const filteredCounts = useMemo(() => {
    const positionCount =
      filteredData.strategies.reduce((sum, s) => sum + s.positions.length, 0) +
      filteredData.unlinkedPositions.length;
    return {
      strategyCount: filteredData.strategies.length,
      positionCount,
    };
  }, [filteredData]);

  // Subtitle
  const subtitle = useMemo(() => {
    if (!accountsLoaded) return "Loading...";
    if (effectiveSelectedIds.length === accounts.length && accounts.length > 0)
      return "All Accounts";
    if (effectiveSelectedIds.length === 0) return "No Accounts Selected";
    if (effectiveSelectedIds.length === 1) {
      const account = accounts.find((a) => a.id === effectiveSelectedIds[0]);
      return account?.label || account?.brokerAccountId || "1 Account";
    }
    return `${effectiveSelectedIds.length} Accounts`;
  }, [effectiveSelectedIds, accounts, accountsLoaded]);

  // Loading state
  if (!accountsLoaded) {
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
      <DashboardShell
        activeNav="portfolio"
        title="Portfolio"
        subtitle="Get started"
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

  return (
    <DashboardShell activeNav="portfolio" title="Portfolio" subtitle={subtitle}>
      {/* Top info bar */}
      <div className="flex flex-wrap items-center gap-3">
        {positionsData && positionsData.snapshotDate && (
          <span className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            {formatDateShort(positionsData.snapshotDate)}
          </span>
        )}
        {isLoading && (
          <span className="text-xs text-muted-foreground">Updating...</span>
        )}
      </div>

      {/* Metrics */}
      <PortfolioMetricsRow
        totalMarketValue={totals.marketValue}
        totalCashUsd={
          positionsData?.totalCashUsd ??
          dashboardData?.latestAccountSnapshot?.totalCashUsd ??
          null
        }
        nav={
          positionsData?.nav ??
          dashboardData?.latestAccountSnapshot?.navAtSnapshot ??
          null
        }
        leverageRatio={
          positionsData?.leverageRatio ??
          dashboardData?.latestAccountSnapshot?.leverageRatio ??
          null
        }
        positionCount={totals.positionCount}
        snapshotDate={positionsData?.snapshotDate ?? null}
      />

      {/* Charts */}
      {dashboardData && (
        <PortfolioCharts
          dashboardData={dashboardData}
          exposureBreakdown={exposureBreakdown}
        />
      )}

      {/* Filter bar */}
      {positionsData && (
        <PortfolioUnifiedFilterBar
          accounts={accounts}
          selectedAccountIds={effectiveSelectedIds}
          onAccountSelectionChange={handleAccountSelectionChange}
          assetClassFilter={assetClassFilter}
          onAssetClassFilterChange={setAssetClassFilter}
          ownerFilter={ownerFilter}
          onOwnerFilterChange={setOwnerFilter}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          positionCount={filteredCounts.positionCount}
          strategyCount={filteredCounts.strategyCount}
        />
      )}

      {/* Strategies table (grouped by underlying) */}
      {filteredData.strategies.length > 0 && (
        <UnderlyingStrategyTable
          strategies={filteredData.strategies}
          accounts={accounts}
          totalMarketValue={totals.marketValue}
        />
      )}

      {/* Unlinked positions */}
      {filteredData.unlinkedPositions.length > 0 && (
        <UnlinkedPositionsTable
          positions={filteredData.unlinkedPositions}
          totalMarketValue={totals.marketValue}
        />
      )}

      {/* Cash breakdown table — shown when Cash filter is active */}
      {assetClassFilter === "CASH" &&
        dashboardData &&
        dashboardData.cashBreakdown.length > 0 && (
          <CashBreakdownTable rows={dashboardData.cashBreakdown} />
        )}

      {/* Empty state */}
      {positionsData &&
        filteredData.strategies.length === 0 &&
        filteredData.unlinkedPositions.length === 0 &&
        assetClassFilter !== "CASH" && (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
            {searchQuery || assetClassFilter !== "all"
              ? "No positions match the current filters."
              : "No open positions found. Run position ingestion to populate data."}
          </div>
        )}
    </DashboardShell>
  );
}

/** Inline cash breakdown table for the Cash filter tab */
function CashBreakdownTable({ rows }: { rows: CashBreakdownRow[] }) {
  const total = rows.reduce((sum, r) => sum + (r.balanceUsd ?? 0), 0);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-5 py-3">
        <h3 className="text-sm font-medium text-foreground">
          Cash & Equivalents
        </h3>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-5 py-2 font-medium">Currency</th>
            <th className="px-5 py-2 font-medium">Source</th>
            <th className="px-5 py-2 text-right font-medium">Balance</th>
            <th className="px-5 py-2 text-right font-medium">USD Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.currency}-${row.source}-${i}`}
              className="border-b last:border-b-0"
            >
              <td className="px-5 py-2.5 font-medium text-foreground">
                {row.currency}
              </td>
              <td className="px-5 py-2.5 text-muted-foreground">{row.source}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-foreground">
                {row.balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums text-foreground">
                {row.balanceUsd !== null ? formatCurrency(row.balanceUsd) : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t bg-muted/30">
              <td colSpan={3} className="px-5 py-2.5 font-medium text-foreground">
                Total
              </td>
              <td className="px-5 py-2.5 text-right font-medium tabular-nums text-foreground">
                {formatCurrency(total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
