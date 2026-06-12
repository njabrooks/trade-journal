"use client";

import { useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { PortfolioPositionsData } from "@/db/queries/portfolio";

interface PnlLensRow {
  ticker: string;
  positionCount: number;
  marketValue: number;
  unrealizedPnl: number;
  pnlPct: number | null; // unrealized / |cost basis| where cost basis known
}

/**
 * D12 unrealized-P&L lens — per-underlying winners and losers, sorted by
 * unrealized P&L. Values reflect the live-pricing overlay when active.
 */
export function PnlLensTable({ data }: { data: PortfolioPositionsData }) {
  const rows = useMemo<PnlLensRow[]>(() => {
    const byTicker = new Map<
      string,
      { positionCount: number; marketValue: number; unrealizedPnl: number; costBasis: number }
    >();
    const allPositions = [
      ...data.strategies.flatMap((s) => s.positions),
      ...data.unlinkedPositions,
    ];
    for (const p of allPositions) {
      if (p.assetClass === "REAL_ESTATE") continue;
      const ticker = p.parentUnderlyingTicker ?? p.underlyingTicker ?? p.symbol;
      const agg = byTicker.get(ticker) ?? {
        positionCount: 0,
        marketValue: 0,
        unrealizedPnl: 0,
        costBasis: 0,
      };
      agg.positionCount += 1;
      agg.marketValue += Math.abs(p.marketValueUsd ?? p.absNotional ?? 0);
      agg.unrealizedPnl += p.unrealizedPnl ?? 0;
      agg.costBasis += Math.abs(p.costBasisMoney ?? 0);
      byTicker.set(ticker, agg);
    }
    return [...byTicker.entries()]
      .map(([ticker, agg]) => ({
        ticker,
        positionCount: agg.positionCount,
        marketValue: agg.marketValue,
        unrealizedPnl: agg.unrealizedPnl,
        pnlPct: agg.costBasis > 0 ? (agg.unrealizedPnl / agg.costBasis) * 100 : null,
      }))
      .sort((a, b) => b.unrealizedPnl - a.unrealizedPnl);
  }, [data]);

  const totalPnl = rows.reduce((sum, r) => sum + r.unrealizedPnl, 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
        No open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Underlying</th>
            <th className="px-4 py-2 text-right font-medium">Positions</th>
            <th className="px-4 py-2 text-right font-medium">Market Value</th>
            <th className="px-4 py-2 text-right font-medium">Unrealized PnL</th>
            <th className="px-4 py-2 text-right font-medium">PnL %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.ticker}>
              <td className="px-4 py-2 font-mono text-xs font-medium">{r.ticker}</td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                {r.positionCount}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatCurrency(r.marketValue)}
              </td>
              <td
                className={`px-4 py-2 text-right font-medium tabular-nums ${
                  r.unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(r.unrealizedPnl)}
              </td>
              <td
                className={`px-4 py-2 text-right tabular-nums ${
                  r.pnlPct === null
                    ? "text-muted-foreground"
                    : r.pnlPct >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                }`}
              >
                {r.pnlPct !== null ? formatPercent(r.pnlPct) : "—"}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-medium">
            <td className="px-4 py-2 text-sm">Total</td>
            <td className="px-4 py-2" />
            <td className="px-4 py-2" />
            <td
              className={`px-4 py-2 text-right tabular-nums ${
                totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatCurrency(totalPnl)}
            </td>
            <td className="px-4 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
