"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { PortfolioPositionsData } from "@/db/queries/portfolio";

interface StrategyLensRow {
  id: string;
  label: string;
  strategyKey: string;
  assetThesisTitle: string | null;
  positionCount: number;
  marketValue: number;
  unrealizedPnl: number;
}

/**
 * D12 strategy lens — flat per-strategy view of the book, sorted by absolute
 * market value. Values reflect the live-pricing overlay when active.
 */
export function StrategyLensTable({ data }: { data: PortfolioPositionsData }) {
  const rows = useMemo<StrategyLensRow[]>(() => {
    return data.strategies
      .map((s) => {
        let marketValue = 0;
        let unrealizedPnl = 0;
        for (const p of s.positions) {
          if (p.assetClass === "REAL_ESTATE") continue;
          marketValue += Math.abs(p.marketValueUsd ?? p.absNotional ?? 0);
          unrealizedPnl += p.unrealizedPnl ?? 0;
        }
        return {
          id: s.id,
          label: s.label,
          strategyKey: s.strategyKey,
          assetThesisTitle: s.assetThesisTitle,
          positionCount: s.positions.length,
          marketValue,
          unrealizedPnl,
        };
      })
      .sort((a, b) => b.marketValue - a.marketValue);
  }, [data]);

  const totalMv = rows.reduce((sum, r) => sum + r.marketValue, 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
        No strategies with open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Strategy</th>
            <th className="px-4 py-2 font-medium">Thesis</th>
            <th className="px-4 py-2 text-right font-medium">Positions</th>
            <th className="px-4 py-2 text-right font-medium">Market Value</th>
            <th className="px-4 py-2 text-right font-medium">% of Total</th>
            <th className="px-4 py-2 text-right font-medium">Unrealized PnL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="max-w-xs px-4 py-2">
                <Link
                  href={`/strategies/${r.id}/overview`}
                  className="font-medium hover:underline"
                >
                  {r.label || r.strategyKey}
                </Link>
              </td>
              <td className="max-w-xs truncate px-4 py-2 text-xs text-muted-foreground">
                {r.assetThesisTitle ?? "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                {r.positionCount}
              </td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">
                {formatCurrency(r.marketValue)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                {totalMv > 0 ? formatPercent((r.marketValue / totalMv) * 100) : "—"}
              </td>
              <td
                className={`px-4 py-2 text-right font-medium tabular-nums ${
                  r.unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(r.unrealizedPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
