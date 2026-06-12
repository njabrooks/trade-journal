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
import type { OverlaidPositionRow } from "@/lib/livePricingOverlay";

interface PositionRowProps {
  position: PortfolioPositionRow;
  isNested?: boolean;
}

export function computeDeltaPctNav(position: PortfolioPositionRow): number | null {
  if (position.delta == null || !position.nav || position.nav <= 0) return null;
  const spot = position.underlyingSpot ?? position.spot;
  if (spot == null) return null;
  const multiplier = position.multiplier ?? 1;
  const deltaExposure = position.quantity * multiplier * spot * position.delta;
  return (deltaExposure / position.nav) * 100;
}

export function PositionRow({ position, isNested = false }: PositionRowProps) {
  const costBasis = calculateCostBasis(position);
  const dte = calculateDTE(position.expiry, position.snapshotDate ?? "");
  const mv = position.marketValueUsd ?? position.absNotional;
  const pctNav = mv && position.nav && position.nav > 0
    ? (Math.abs(mv) / position.nav) * 100
    : null;
  const deltaPctNav = computeDeltaPctNav(position);

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
        <span className="inline-flex items-center gap-1.5">
          {(position as OverlaidPositionRow).livePriced && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
              title={`Live price (${(position as OverlaidPositionRow).liveSource})`}
            />
          )}
          {position.spot != null ? formatCurrency(position.spot, position.currency ?? 'USD', 2) : "—"}
        </span>
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
      <td className={cn(
        "py-2 pr-3 text-right tabular-nums font-medium",
        deltaPctNav != null && deltaPctNav >= 0 ? "text-emerald-600" : deltaPctNav != null ? "text-rose-600" : "text-muted-foreground"
      )}>
        {deltaPctNav != null ? (deltaPctNav >= 0 ? "+" : "") + deltaPctNav.toFixed(1) + "%" : "—"}
      </td>
      <td className="py-2 text-center tabular-nums text-muted-foreground">
        {dte != null ? dte : "—"}
      </td>
    </tr>
  );
}
