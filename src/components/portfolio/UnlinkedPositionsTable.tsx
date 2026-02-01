"use client";

import { formatCurrency, formatPercent, formatSymbol, calculateDTE, calculateCostBasis } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PortfolioPositionRow } from "@/db/queries/portfolio";

interface UnlinkedPositionsTableProps {
  positions: PortfolioPositionRow[];
}

export function UnlinkedPositionsTable({ positions }: UnlinkedPositionsTableProps) {
  if (positions.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-medium text-foreground mb-3">
        Unlinked Positions ({positions.length})
      </h2>
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-2 pl-4 pr-3">Symbol</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3 text-right">Avg Cost</th>
              <th className="py-2 pr-3 text-right">Cost Basis</th>
              <th className="py-2 pr-3 text-right">Mark Price</th>
              <th className="py-2 pr-3 text-right">Mkt Value</th>
              <th className="py-2 pr-3 text-right">Unrealized P&L</th>
              <th className="py-2 pr-3 text-right">% NAV</th>
              <th className="py-2 pr-3 text-center">DTE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {positions.map((pos) => {
              const costBasis = calculateCostBasis(pos);
              const dte = calculateDTE(pos.expiry, pos.snapshotDate ?? "");
              const pctNav = pos.absNotional && pos.nav && pos.nav > 0
                ? (Math.abs(pos.absNotional) / pos.nav) * 100
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
                    {pos.avgPrice != null ? formatCurrency(pos.avgPrice, 'USD', 2) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {costBasis != null ? formatCurrency(costBasis) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {pos.spot != null ? formatCurrency(pos.spot, 'USD', 2) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-foreground">
                    {formatCurrency(Math.abs(pos.absNotional ?? 0))}
                  </td>
                  <td className={cn(
                    "py-2 pr-3 text-right tabular-nums font-medium",
                    (pos.unrealizedPnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {pos.unrealizedPnl != null ? formatCurrency(pos.unrealizedPnl) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {pctNav != null ? formatPercent(pctNav) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums text-muted-foreground">
                    {dte != null ? dte : "—"}
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
