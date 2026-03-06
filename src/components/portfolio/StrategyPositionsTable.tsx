"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency, formatPercent, calculateDTE } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PortfolioStrategyRow, PortfolioPositionRow } from "@/db/queries/portfolio";

type SortColumn = "label" | "type" | "positions" | "marketValue" | "pctTotal" | "dte";
type SortDirection = "asc" | "desc";

interface StrategyPositionsTableProps {
  strategies: PortfolioStrategyRow[];
  totalMarketValue: number;
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

export function StrategyPositionsTable({ strategies, totalMarketValue }: StrategyPositionsTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>("marketValue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const sortedStrategies = useMemo(() => {
    const withAggregates = strategies.map((s) => ({
      strategy: s,
      agg: getStrategyAggregates(s, totalMarketValue),
    }));

    withAggregates.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "label":
          cmp = a.strategy.label.localeCompare(b.strategy.label);
          break;
        case "type":
          cmp = (a.strategy.strategyType ?? "").localeCompare(b.strategy.strategyType ?? "");
          break;
        case "positions":
          cmp = a.strategy.positions.length - b.strategy.positions.length;
          break;
        case "marketValue":
          cmp = a.agg.totalMV - b.agg.totalMV;
          break;
        case "pctTotal":
          cmp = (a.agg.pctTotal ?? 0) - (b.agg.pctTotal ?? 0);
          break;
        case "dte":
          cmp = (a.agg.minDte ?? 9999) - (b.agg.minDte ?? 9999);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return withAggregates;
  }, [strategies, totalMarketValue, sortColumn, sortDirection]);

  if (strategies.length === 0) return null;

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
          Strategies ({strategies.length})
        </h2>
        <button
          type="button"
          onClick={() => {
            if (expandedIds.size === strategies.length) {
              setExpandedIds(new Set());
            } else {
              setExpandedIds(new Set(strategies.map((s) => s.id)));
            }
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {expandedIds.size === strategies.length ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-2 pl-3 pr-3 w-8"></th>
              {renderSortHeader("label", "Strategy")}
              {renderSortHeader("type", "Type")}
              {renderSortHeader("positions", "# Pos", "text-right")}
              {renderSortHeader("marketValue", "Mkt Value", "text-right")}
              {renderSortHeader("pctTotal", "% Total", "text-right")}
              {renderSortHeader("dte", "Min DTE", "text-center")}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedStrategies.map(({ strategy, agg }) => {
              const isExpanded = expandedIds.has(strategy.id);

              return (
                <StrategyGroup
                  key={strategy.id}
                  strategy={strategy}
                  agg={agg}
                  totalMarketValue={totalMarketValue}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpand(strategy.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface StrategyGroupProps {
  strategy: PortfolioStrategyRow;
  agg: ReturnType<typeof getStrategyAggregates>;
  totalMarketValue: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function StrategyGroup({ strategy, agg, totalMarketValue, isExpanded, onToggle }: StrategyGroupProps) {
  return (
    <>
      {/* Strategy summary row */}
      <tr
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 pl-3 pr-1">
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </td>
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2">
            <DirectionIcon direction={strategy.direction} />
            <a
              href={`/strategies/${strategy.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm text-foreground hover:underline"
            >
              {strategy.label}
            </a>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              strategy.status === "active" ? "bg-blue-100 text-blue-700" :
              strategy.status === "draft" ? "bg-slate-100 text-slate-600" :
              strategy.status === "complete" ? "bg-emerald-100 text-emerald-700" :
              "bg-slate-100 text-slate-500"
            )}>
              {strategy.status}
            </span>
          </div>
        </td>
        <td className="py-2.5 pr-3 text-xs text-muted-foreground">
          {strategy.strategyType ?? "\u2014"}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {strategy.positions.length}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums font-medium text-foreground">
          {formatCurrency(agg.totalMV)}
        </td>
        <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {agg.pctTotal != null ? formatPercent(agg.pctTotal) : "\u2014"}
        </td>
        <td className="py-2.5 text-center text-sm tabular-nums text-muted-foreground">
          {agg.minDte != null ? agg.minDte : "\u2014"}
        </td>
      </tr>

      {/* Expanded position rows */}
      {isExpanded && strategy.positions.length > 0 && (
        <>
          {/* Position sub-header */}
          <tr className="bg-muted/30">
            <td></td>
            <td className="py-1.5 pl-8 pr-3 text-[10px] uppercase tracking-wide text-muted-foreground">Symbol</td>
            <td className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wide text-muted-foreground" colSpan={1}>Qty</td>
            <td className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wide text-muted-foreground">Mark Price</td>
            <td className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wide text-muted-foreground">Mkt Value</td>
            <td className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wide text-muted-foreground">% Total</td>
            <td className="py-1.5 text-center text-[10px] uppercase tracking-wide text-muted-foreground">DTE</td>
          </tr>
          {strategy.positions.map((pos) => (
            <PositionRowNested key={pos.id} position={pos} totalMarketValue={totalMarketValue} />
          ))}
        </>
      )}
    </>
  );
}

function PositionRowNested({ position, totalMarketValue }: { position: PortfolioPositionRow; totalMarketValue: number }) {
  const dte = calculateDTE(position.expiry, position.snapshotDate ?? "");
  const mv = Math.abs(position.marketValueUsd ?? position.absNotional ?? 0);
  const pctTotal = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : null;

  const displaySymbol = position.assetClass === 'OPT' && position.underlyingTicker
    ? (() => {
        const expiry = position.expiry ? position.expiry.replace(/-/g, '').slice(2) : '';
        const strike = position.strike ? Math.round(position.strike).toString() : '';
        const right = position.optionRight || '';
        return `${position.underlyingTicker} ${expiry} ${right}${strike}`;
      })()
    : position.symbol;

  return (
    <tr className="bg-muted/30 text-sm">
      <td></td>
      <td className="py-1.5 pl-8 pr-3">
        <span className="font-mono text-xs text-foreground">{displaySymbol}</span>
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground" colSpan={1}>
        {position.quantity.toLocaleString()}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
        {position.spot != null ? formatCurrency(position.spot, position.currency ?? 'USD', 2) : "\u2014"}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
        {formatCurrency(mv)}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
        {pctTotal != null ? formatPercent(pctTotal) : "\u2014"}
      </td>
      <td className="py-1.5 text-center tabular-nums text-muted-foreground">
        {dte != null ? dte : "\u2014"}
      </td>
    </tr>
  );
}
