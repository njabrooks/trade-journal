"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency, formatPercent, calculateDTE } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PortfolioStrategyRow, PortfolioPositionRow, CashBreakdownRow } from "@/db/queries/portfolio";
import type { Account } from "@/db/schema";

type SortColumn = "underlying" | "strategies" | "positions" | "spot" | "marketValue" | "pctTotal" | "dte";
type SortDirection = "asc" | "desc";

interface CashCurrencyGroup {
  currency: string;
  totalBalance: number;
  totalBalanceUsd: number;
  rows: CashBreakdownRow[];
}

interface UnderlyingGroup {
  underlyingTicker: string;
  underlyingId: string | null;
  strategies: PortfolioStrategyRow[];
  totalMV: number;
  spot: number | null;
  currency: string | null;
  pctTotal: number | null;
  minDte: number | null;
  positionCount: number;
  cashCurrencyGroups?: CashCurrencyGroup[];
}

interface UnderlyingStrategyTableProps {
  strategies: PortfolioStrategyRow[];
  accounts: Account[];
  totalMarketValue: number;
  cashRows?: CashBreakdownRow[];
}

function getStrategyAggregates(strategy: PortfolioStrategyRow, totalMarketValue: number) {
  let totalMV = 0;
  let minDte: number | null = null;

  for (const pos of strategy.positions) {
    totalMV += Math.abs(pos.marketValueUsd ?? pos.absNotional ?? 0);

    const dte = calculateDTE(pos.expiry, pos.snapshotDate ?? "");
    if (dte != null && (minDte === null || dte < minDte)) {
      minDte = dte;
    }
  }

  const pctTotal = totalMarketValue > 0 ? (totalMV / totalMarketValue) * 100 : null;

  return { totalMV, pctTotal, minDte };
}

function DirectionIcon({ direction }: { direction: string | null }) {
  if (direction === "bullish") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (direction === "bearish") return <TrendingDown className="h-3.5 w-3.5 text-rose-600" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function UnderlyingStrategyTable({ strategies, accounts, totalMarketValue, cashRows }: UnderlyingStrategyTableProps) {
  const [expandedUnderlyings, setExpandedUnderlyings] = useState<Set<string>>(new Set());
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>("marketValue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Create account lookup map
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const acc of accounts) {
      map.set(acc.id, acc);
    }
    return map;
  }, [accounts]);

  // Group strategies by underlying ticker (using parent underlying if available)
  const underlyingGroups = useMemo(() => {
    const groups = new Map<string, UnderlyingGroup>();

    for (const strategy of strategies) {
      // Get the most common underlying ticker among positions (by notional value).
      // Uses parentUnderlyingTicker if available (e.g., HSOL -> SOL, CBBTC -> BTC)
      // to ensure derivative tokens group with their parent.
      const tickerNotionals = new Map<string, { ticker: string; id: string | null; notional: number }>();
      for (const pos of strategy.positions) {
        // Use parent ticker if available, otherwise fall back to position's ticker
        const ticker = pos.parentUnderlyingTicker ?? pos.underlyingTicker ?? "Unknown";
        const existing = tickerNotionals.get(ticker);
        if (existing) {
          existing.notional += Math.abs(pos.marketValueUsd ?? pos.absNotional ?? 0);
        } else {
          tickerNotionals.set(ticker, {
            ticker,
            id: pos.underlyingId,
            notional: Math.abs(pos.marketValueUsd ?? pos.absNotional ?? 0),
          });
        }
      }

      // Find ticker with highest notional
      let underlyingTicker = "Unknown";
      let underlyingId: string | null = null;
      let maxNotional = -1;
      for (const entry of tickerNotionals.values()) {
        if (entry.notional > maxNotional) {
          maxNotional = entry.notional;
          underlyingTicker = entry.ticker;
          underlyingId = entry.id;
        }
      }

      if (!groups.has(underlyingTicker)) {
        groups.set(underlyingTicker, {
          underlyingTicker,
          underlyingId,
          strategies: [],
          totalMV: 0,
          spot: null,
          currency: null,
          pctTotal: null,
          minDte: null,
          positionCount: 0,
        });
      }

      const group = groups.get(underlyingTicker)!;
      group.strategies.push(strategy);

      // Pick up the underlying's spot price.
      // For STK/CRYPTO/PERP positions, positions.spot IS the underlying price.
      // For OPT positions, positions.spot is the option mark — use underlyingSpot instead.
      // Prefer non-option sources first, then fall back to underlyingSpot from any position.
      if (group.spot == null) {
        for (const pos of strategy.positions) {
          if (pos.spot != null && pos.assetClass !== "OPT") {
            group.spot = pos.spot;
            group.currency = pos.currency;
            break;
          }
        }
      }
      if (group.spot == null) {
        for (const pos of strategy.positions) {
          if (pos.underlyingSpot != null) {
            group.spot = pos.underlyingSpot;
            group.currency = pos.currency;
            break;
          }
        }
      }

      const agg = getStrategyAggregates(strategy, totalMarketValue);
      group.totalMV += agg.totalMV;
      group.positionCount += strategy.positions.length;

      if (agg.minDte !== null && (group.minDte === null || agg.minDte < group.minDte)) {
        group.minDte = agg.minDte;
      }
    }

    // Calculate percentages
    for (const group of groups.values()) {
      group.pctTotal = totalMarketValue > 0 ? (group.totalMV / totalMarketValue) * 100 : null;
    }

    const result = Array.from(groups.values());

    // Append synthetic cash group if cash data is present
    if (cashRows && cashRows.length > 0) {
      const cashTotalUsd = cashRows.reduce((sum, r) => sum + (r.balanceUsd ?? 0), 0);

      // Group cash rows by currency
      const currencyMap = new Map<string, CashCurrencyGroup>();
      for (const row of cashRows) {
        const existing = currencyMap.get(row.currency);
        if (existing) {
          existing.totalBalance += row.balance;
          existing.totalBalanceUsd += row.balanceUsd ?? 0;
          existing.rows.push(row);
        } else {
          currencyMap.set(row.currency, {
            currency: row.currency,
            totalBalance: row.balance,
            totalBalanceUsd: row.balanceUsd ?? 0,
            rows: [row],
          });
        }
      }
      // Sort currency groups by USD value descending
      const cashCurrencyGroups = Array.from(currencyMap.values())
        .sort((a, b) => b.totalBalanceUsd - a.totalBalanceUsd);

      result.push({
        underlyingTicker: "Cash & Equivalents",
        underlyingId: null,
        strategies: [],
        totalMV: cashTotalUsd,
        spot: null,
        currency: null,
        pctTotal: totalMarketValue > 0 ? (cashTotalUsd / totalMarketValue) * 100 : null,
        minDte: null,
        positionCount: 0,
        cashCurrencyGroups,
      });
    }

    return result;
  }, [strategies, totalMarketValue, cashRows]);

  // Sort groups
  const sortedGroups = useMemo(() => {
    const sorted = [...underlyingGroups];

    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "underlying":
          cmp = a.underlyingTicker.localeCompare(b.underlyingTicker);
          break;
        case "strategies":
          cmp = a.strategies.length - b.strategies.length;
          break;
        case "positions":
          cmp = a.positionCount - b.positionCount;
          break;
        case "spot":
          cmp = (a.spot ?? 0) - (b.spot ?? 0);
          break;
        case "marketValue":
          cmp = a.totalMV - b.totalMV;
          break;
        case "pctTotal":
          cmp = (a.pctTotal ?? 0) - (b.pctTotal ?? 0);
          break;
        case "dte":
          cmp = (a.minDte ?? 9999) - (b.minDte ?? 9999);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [underlyingGroups, sortColumn, sortDirection]);

  const toggleUnderlyingExpand = (ticker: string) => {
    setExpandedUnderlyings((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  const toggleStrategyExpand = (id: string) => {
    setExpandedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const expandAllUnderlyings = () => {
    setExpandedUnderlyings(new Set(sortedGroups.map((g) => g.underlyingTicker)));
  };

  const collapseAllUnderlyings = () => {
    setExpandedUnderlyings(new Set());
    setExpandedStrategies(new Set());
  };

  if (strategies.length === 0 && (!cashRows || cashRows.length === 0)) return null;

  function renderSortHeader(column: SortColumn, label: string, className?: string) {
    return (
      <th
        key={column}
        className={cn("py-2 pr-3 cursor-pointer select-none hover:text-foreground", className)}
        onClick={() => handleSort(column)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {sortColumn === column && (
            <span className="text-foreground">{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>
          )}
        </span>
      </th>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">
          Underlyings ({sortedGroups.length})
        </h2>
        <button
          type="button"
          onClick={expandedUnderlyings.size === sortedGroups.length ? collapseAllUnderlyings : expandAllUnderlyings}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {expandedUnderlyings.size === sortedGroups.length ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-2 pl-3 pr-3 w-8"></th>
              {renderSortHeader("underlying", "Underlying")}
              {renderSortHeader("strategies", "# Strat", "text-right")}
              {renderSortHeader("positions", "# Pos", "text-right")}
              {renderSortHeader("spot", "Spot", "text-right")}
              {renderSortHeader("marketValue", "Mkt Value", "text-right")}
              {renderSortHeader("pctTotal", "% Total", "text-right")}
              {renderSortHeader("dte", "Min DTE", "text-center")}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedGroups.map((group) => {
              const isExpanded = expandedUnderlyings.has(group.underlyingTicker);

              return (
                <UnderlyingGroup
                  key={group.underlyingTicker}
                  group={group}
                  totalMarketValue={totalMarketValue}
                  isExpanded={isExpanded}
                  onToggle={() => toggleUnderlyingExpand(group.underlyingTicker)}
                  expandedStrategies={expandedStrategies}
                  onToggleStrategy={toggleStrategyExpand}
                  accountMap={accountMap}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface UnderlyingGroupProps {
  group: UnderlyingGroup;
  totalMarketValue: number;
  isExpanded: boolean;
  onToggle: () => void;
  expandedStrategies: Set<string>;
  onToggleStrategy: (id: string) => void;
  accountMap: Map<string, Account>;
}

function UnderlyingGroup({
  group,
  totalMarketValue,
  isExpanded,
  onToggle,
  expandedStrategies,
  onToggleStrategy,
  accountMap,
}: UnderlyingGroupProps) {
  return (
    <>
      {/* Underlying summary row */}
      <tr
        className="cursor-pointer hover:bg-muted/50 transition-colors bg-muted/20"
        onClick={onToggle}
      >
        <td className="py-2.5 pl-3 pr-1">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="py-2.5 pr-3">
          <span className="font-semibold text-sm text-foreground">
            {group.underlyingTicker}
          </span>
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {group.cashCurrencyGroups ? group.cashCurrencyGroups.length : group.strategies.length}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {group.cashCurrencyGroups ? "\u2014" : group.positionCount}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {group.spot != null ? formatCurrency(group.spot, group.currency ?? "USD", 2) : "\u2014"}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums font-medium text-foreground">
          {formatCurrency(group.totalMV)}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {group.pctTotal != null ? formatPercent(group.pctTotal) : "\u2014"}
        </td>
        <td className="py-2.5 text-center text-sm tabular-nums text-muted-foreground">
          {group.minDte != null ? group.minDte : "\u2014"}
        </td>
      </tr>

      {/* Expanded cash currency groups */}
      {isExpanded && group.cashCurrencyGroups &&
        group.cashCurrencyGroups.map((currencyGroup) => {
          const currencyKey = `cash-${currencyGroup.currency}`;
          const isCurrencyExpanded = expandedStrategies.has(currencyKey);
          return (
            <CashCurrencyRow
              key={currencyKey}
              currencyGroup={currencyGroup}
              totalMarketValue={totalMarketValue}
              isExpanded={isCurrencyExpanded}
              onToggle={() => onToggleStrategy(currencyKey)}
              accountMap={accountMap}
            />
          );
        })}

      {/* Expanded strategies */}
      {isExpanded && !group.cashCurrencyGroups &&
        group.strategies.map((strategy) => {
          const isStrategyExpanded = expandedStrategies.has(strategy.id);
          const agg = getStrategyAggregates(strategy, totalMarketValue);

          return (
            <StrategyRow
              key={strategy.id}
              strategy={strategy}
              agg={agg}
              totalMarketValue={totalMarketValue}
              isExpanded={isStrategyExpanded}
              onToggle={() => onToggleStrategy(strategy.id)}
              accountMap={accountMap}
            />
          );
        })}
    </>
  );
}

function CashCurrencyRow({
  currencyGroup,
  totalMarketValue,
  isExpanded,
  onToggle,
  accountMap,
}: {
  currencyGroup: CashCurrencyGroup;
  totalMarketValue: number;
  isExpanded: boolean;
  onToggle: () => void;
  accountMap: Map<string, Account>;
}) {
  const pctTotal =
    totalMarketValue > 0 ? (currencyGroup.totalBalanceUsd / totalMarketValue) * 100 : null;

  return (
    <>
      {/* Currency summary row (like a strategy row) */}
      <tr
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 pl-6 pr-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="py-2 pr-3">
          <span className="pl-3 font-medium text-sm text-foreground">
            {currencyGroup.currency}
          </span>
        </td>
        <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
          {"\u2014"}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {currencyGroup.rows.length}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {"\u2014"}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums font-medium text-foreground">
          {formatCurrency(currencyGroup.totalBalanceUsd)}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {pctTotal != null ? formatPercent(pctTotal) : "\u2014"}
        </td>
        <td className="py-2 text-center text-sm tabular-nums text-muted-foreground">
          {"\u2014"}
        </td>
      </tr>

      {/* Expanded account rows */}
      {isExpanded && currencyGroup.rows.length > 0 && (
        <>
          <tr className="bg-muted/30">
            <td></td>
            <td className="py-1.5 pl-10 pr-3 text-xs uppercase tracking-wide text-muted-foreground">
              Account
            </td>
            <td className="py-1.5 pr-3 text-xs uppercase tracking-wide text-muted-foreground">
              Source
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              Balance
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              USD Value
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              % Total
            </td>
            <td className="py-1.5 text-center text-xs uppercase tracking-wide text-muted-foreground">
              {"\u2014"}
            </td>
          </tr>
          {currencyGroup.rows.map((row, i) => (
            <CashAccountRow
              key={`${row.accountId}-${row.source}-${i}`}
              row={row}
              totalMarketValue={totalMarketValue}
              accountMap={accountMap}
            />
          ))}
        </>
      )}
    </>
  );
}

function CashAccountRow({
  row,
  totalMarketValue,
  accountMap,
}: {
  row: CashBreakdownRow;
  totalMarketValue: number;
  accountMap: Map<string, Account>;
}) {
  const pctTotal =
    totalMarketValue > 0 && row.balanceUsd != null
      ? (row.balanceUsd / totalMarketValue) * 100
      : null;
  const account = accountMap.get(row.accountId);
  const accountLabel = account?.label ?? account?.brokerAccountId ?? row.accountId.slice(0, 8);

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td></td>
      <td className="py-1.5 pl-10 pr-3 text-xs text-muted-foreground">
        {accountLabel}
      </td>
      <td className="py-1.5 pr-3 text-xs text-muted-foreground">
        {row.source}
      </td>
      <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-muted-foreground">
        {row.balance.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </td>
      <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-muted-foreground">
      </td>
      <td className="py-1.5 pr-3 text-right text-xs tabular-nums font-medium text-foreground">
        {row.balanceUsd != null ? formatCurrency(row.balanceUsd) : "\u2014"}
      </td>
      <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-muted-foreground">
        {pctTotal != null ? formatPercent(pctTotal) : "\u2014"}
      </td>
      <td className="py-1.5 text-center text-xs tabular-nums text-muted-foreground">
        {"\u2014"}
      </td>
    </tr>
  );
}

interface StrategyRowProps {
  strategy: PortfolioStrategyRow;
  agg: ReturnType<typeof getStrategyAggregates>;
  totalMarketValue: number;
  isExpanded: boolean;
  onToggle: () => void;
  accountMap: Map<string, Account>;
}

function StrategyRow({ strategy, agg, totalMarketValue, isExpanded, onToggle, accountMap }: StrategyRowProps) {
  return (
    <>
      {/* Strategy row - indented */}
      <tr
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 pl-6 pr-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2 pl-3">
            <DirectionIcon direction={strategy.direction} />
            <a
              href={`/strategies/${strategy.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm text-foreground hover:underline"
            >
              {strategy.label}
            </a>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                strategy.status === "active"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : strategy.status === "draft"
                  ? "bg-muted text-muted-foreground"
                  : strategy.status === "complete"
                  ? "bg-muted text-muted-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {strategy.status}
            </span>
          </div>
        </td>
        <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
          {strategy.strategyType ?? "\u2014"}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {strategy.positions.length}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums font-medium text-foreground">
          {formatCurrency(agg.totalMV)}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {agg.pctTotal != null ? formatPercent(agg.pctTotal) : "\u2014"}
        </td>
        <td className="py-2 text-center text-sm tabular-nums text-muted-foreground">
          {agg.minDte != null ? agg.minDte : "\u2014"}
        </td>
      </tr>

      {/* Expanded position rows */}
      {isExpanded && strategy.positions.length > 0 && (
        <>
          {/* Position sub-header */}
          <tr className="bg-muted/30">
            <td></td>
            <td className="py-1.5 pl-10 pr-3 text-xs uppercase tracking-wide text-muted-foreground">
              Symbol
            </td>
            <td className="py-1.5 pr-3 text-xs uppercase tracking-wide text-muted-foreground">
              Account
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              Qty
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              Spot
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              Mkt Value
            </td>
            <td className="py-1.5 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
              % Total
            </td>
            <td className="py-1.5 text-center text-xs uppercase tracking-wide text-muted-foreground">
              DTE
            </td>
          </tr>
          {strategy.positions.map((pos) => (
            <PositionRowNested
              key={pos.id}
              position={pos}
              totalMarketValue={totalMarketValue}
              accountMap={accountMap}
            />
          ))}
        </>
      )}
    </>
  );
}

function PositionRowNested({
  position,
  totalMarketValue,
  accountMap,
}: {
  position: PortfolioPositionRow;
  totalMarketValue: number;
  accountMap: Map<string, Account>;
}) {
  const dte = calculateDTE(position.expiry, position.snapshotDate ?? "");
  const mv = Math.abs(position.marketValueUsd ?? position.absNotional ?? 0);
  const pctTotal = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : null;
  const isShort = position.quantity < 0;

  const displaySymbol =
    position.assetClass === "OPT" && position.underlyingTicker
      ? (() => {
          const expiry = position.expiry ? position.expiry.replace(/-/g, "").slice(2) : "";
          const strike = position.strike ? Math.round(position.strike).toString() : "";
          const right = position.optionRight || "";
          return `${position.underlyingTicker} ${expiry} ${right}${strike}`;
        })()
      : position.symbol;

  const account = accountMap.get(position.accountId);
  const accountLabel = account?.label ?? account?.brokerAccountId ?? "Unknown";

  return (
    <tr className="bg-muted/30 text-sm">
      <td></td>
      <td className="py-1.5 pl-10 pr-3">
        <span className="font-mono text-xs text-foreground">{displaySymbol}</span>
      </td>
      <td className="py-1.5 pr-3 text-xs text-muted-foreground">{accountLabel}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
        {position.quantity.toLocaleString()}
      </td>
      <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-muted-foreground">
        {position.spot != null ? formatCurrency(position.spot, position.currency ?? "USD", 2) : "\u2014"}
      </td>
      <td className={cn("py-1.5 pr-3 text-right tabular-nums", isShort ? "text-rose-600" : "text-foreground")}>{formatCurrency(mv)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
        {pctTotal != null ? formatPercent(pctTotal) : "\u2014"}
      </td>
      <td className="py-1.5 text-center tabular-nums text-muted-foreground">
        {dte != null ? dte : "\u2014"}
      </td>
    </tr>
  );
}
