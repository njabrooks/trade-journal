"use client";

import { formatCurrency, formatPercent, formatSymbol, calculateDTE } from "@/lib/formatters";
import type { PortfolioPositionRow } from "@/db/queries/portfolio";

interface UnlinkedPositionsTableProps {
  positions: PortfolioPositionRow[];
  totalMarketValue: number;
}

const DUST_THRESHOLD_USD = 5;

export function UnlinkedPositionsTable({ positions, totalMarketValue }: UnlinkedPositionsTableProps) {
  const filtered = positions.filter((pos) => {
    const mv = Math.abs(pos.marketValueUsd ?? pos.absNotional ?? 0);
    return mv >= DUST_THRESHOLD_USD;
  });

  if (filtered.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-medium text-foreground mb-3">
        Unlinked Positions ({filtered.length})
      </h2>
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-2 pl-4 pr-3">Symbol</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3 text-right">Mark Price</th>
              <th className="py-2 pr-3 text-right">Mkt Value</th>
              <th className="py-2 pr-3 text-right">% Total</th>
              <th className="py-2 pr-3 text-center">DTE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((pos) => {
              const dte = calculateDTE(pos.expiry, pos.snapshotDate ?? "");
              const mv = Math.abs(pos.marketValueUsd ?? pos.absNotional ?? 0);
              const pctTotal = totalMarketValue > 0
                ? (mv / totalMarketValue) * 100
                : null;

              return (
                <tr key={pos.id} className="text-sm">
                  <td className="py-2 pl-4 pr-3">
                    <span className="font-mono text-xs font-medium text-foreground">
                      {formatSymbol(pos)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {pos.quantity.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {pos.spot != null ? formatCurrency(pos.spot, 'USD', 2) : "\u2014"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-foreground">
                    {formatCurrency(mv)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {pctTotal != null ? formatPercent(pctTotal) : "\u2014"}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums text-muted-foreground">
                    {dte != null ? dte : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
