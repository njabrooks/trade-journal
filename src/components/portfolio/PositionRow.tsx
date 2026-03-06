"use client";

import {
  formatCurrency,
  formatPercent,
  formatSymbol,
  calculateDTE,
  calculateCostBasis,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PortfolioPositionRow } from "@/db/queries/portfolio";

interface PositionRowProps {
  position: PortfolioPositionRow;
  isNested?: boolean;
}

export function PositionRow({ position, isNested = false }: PositionRowProps) {
  const costBasis = calculateCostBasis(position);
  const dte = calculateDTE(position.expiry, position.snapshotDate ?? "");
  const mv = position.marketValueUsd ?? position.absNotional;
  const pctNav = mv && position.nav && position.nav > 0
    ? (Math.abs(mv) / position.nav) * 100
    : null;

  return (
    <tr className={cn(
      "text-sm",
      isNested && "bg-muted/30"
    )}>
      <td className={cn("py-2 pr-3", isNested && "pl-8")}>
        <span className="font-mono text-xs font-medium text-foreground">
          {formatSymbol(position)}
        </span>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground">
        {position.quantity.toLocaleString()}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {position.avgPrice != null ? formatCurrency(position.avgPrice, position.currency ?? 'USD', 2) : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {costBasis != null ? formatCurrency(costBasis) : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {position.spot != null ? formatCurrency(position.spot, position.currency ?? 'USD', 2) : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums font-medium text-foreground">
        {formatCurrency(Math.abs(position.marketValueUsd ?? position.absNotional ?? 0))}
      </td>
      <td className={cn(
        "py-2 pr-3 text-right tabular-nums font-medium",
        (position.unrealizedPnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
      )}>
        {position.unrealizedPnl != null ? formatCurrency(position.unrealizedPnl) : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {pctNav != null ? formatPercent(pctNav) : "—"}
      </td>
      <td className="py-2 text-center tabular-nums text-muted-foreground">
        {dte != null ? dte : "—"}
      </td>
    </tr>
  );
}
