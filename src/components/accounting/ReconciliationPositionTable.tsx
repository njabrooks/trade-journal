"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { ArrowUpDown, Filter } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReconciliationActionMenu } from "@/components/accounting/ReconciliationActionMenu";
import type { PositionReconciliation } from "@/db/queries/reconciliation";

type StatusFilter =
  | "unresolved"
  | "flagged"
  | "accepted"
  | "resolved"
  | "all_discrepancies"
  | "all"
  | "match";
type SortKey = "ticker" | "owner" | "qtyDelta" | "mvDelta" | "status";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<PositionReconciliation["status"], string> = {
  match: "Match",
  qty_mismatch: "Qty Mismatch",
  mv_mismatch: "MV Mismatch",
  snapshot_only: "Snap-only",
  event_sourced_only: "ES-only",
};

const STATUS_COLORS: Record<PositionReconciliation["status"], string> = {
  match: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  qty_mismatch: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  mv_mismatch: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  snapshot_only: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  event_sourced_only: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const RESOLUTION_BADGES: Record<string, { label: string; classes: string }> = {
  accepted: {
    label: "Accepted",
    classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  flagged: {
    label: "Flagged",
    classes: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
  resolved: {
    label: "Resolved",
    classes: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

const NATURE_LABELS: Record<string, string> = {
  mapping_error: "Mapping error",
  missing_coverage: "Missing coverage",
  expected_gap: "Expected gap",
  dust: "Dust",
  price_drift: "Price drift",
  qty_drift: "Qty drift",
  other: "Other",
};

interface ReconciliationPositionTableProps {
  positions: PositionReconciliation[];
  onResolutionAction?: () => void;
}

export function ReconciliationPositionTable({
  positions,
  onResolutionAction,
}: ReconciliationPositionTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("unresolved");
  const [sortKey, setSortKey] = useState<SortKey>("mvDelta");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Compute filter counts
  const counts = useMemo(() => {
    const discrepancies = positions.filter((p) => p.status !== "match");
    return {
      unresolved: discrepancies.filter(
        (p) => !p.resolution || p.resolution.status === "unresolved"
      ).length,
      flagged: discrepancies.filter((p) => p.resolution?.status === "flagged").length,
      accepted: discrepancies.filter((p) => p.resolution?.status === "accepted").length,
      resolved: discrepancies.filter((p) => p.resolution?.status === "resolved").length,
      all_discrepancies: discrepancies.length,
      all: positions.length,
      match: positions.filter((p) => p.status === "match").length,
    };
  }, [positions]);

  const filtered = useMemo(() => {
    switch (statusFilter) {
      case "unresolved":
        return positions.filter(
          (p) =>
            p.status !== "match" &&
            (!p.resolution || p.resolution.status === "unresolved")
        );
      case "flagged":
        return positions.filter((p) => p.resolution?.status === "flagged");
      case "accepted":
        return positions.filter((p) => p.resolution?.status === "accepted");
      case "resolved":
        return positions.filter((p) => p.resolution?.status === "resolved");
      case "all_discrepancies":
        return positions.filter((p) => p.status !== "match");
      case "match":
        return positions.filter((p) => p.status === "match");
      case "all":
        return positions;
      default:
        return positions;
    }
  }, [positions, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "ticker":
          cmp = a.ticker.localeCompare(b.ticker);
          break;
        case "owner":
          cmp = a.owner.localeCompare(b.owner);
          break;
        case "qtyDelta":
          cmp = Math.abs(a.qtyDelta ?? 0) - Math.abs(b.qtyDelta ?? 0);
          break;
        case "mvDelta":
          cmp =
            Math.abs(a.mvDelta ?? a.snapshotMv ?? a.eventSourcedMv ?? 0) -
            Math.abs(b.mvDelta ?? b.snapshotMv ?? b.eventSourcedMv ?? 0);
          break;
        case "status": {
          const order = { qty_mismatch: 0, mv_mismatch: 1, snapshot_only: 2, event_sourced_only: 3, match: 4 };
          cmp = order[a.status] - order[b.status];
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "owner" ? "asc" : "desc");
    }
  }

  function renderSortHeader(label: string, key: SortKey, align?: "right") {
    const isActive = sortKey === key;
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground ${
          align === "right" ? "text-right" : "text-left"
        }`}
        onClick={() => toggleSort(key)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={`h-3 w-3 ${isActive ? "text-foreground" : "text-muted-foreground/40"}`} />
        </span>
      </th>
    );
  }

  const filterOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: "unresolved", label: "Unresolved", count: counts.unresolved },
    { value: "flagged", label: "Flagged", count: counts.flagged },
    { value: "accepted", label: "Accepted", count: counts.accepted },
    { value: "resolved", label: "Resolved", count: counts.resolved },
    { value: "all_discrepancies", label: "All Discrepancies", count: counts.all_discrepancies },
    { value: "match", label: "Matches", count: counts.match },
    { value: "all", label: "All", count: counts.all },
  ];

  return (
    <TooltipProvider>
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto min-w-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label} ({opt.count})
            </button>
          ))}
        </div>
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="border-b">
            <tr>
              {renderSortHeader("Ticker", "ticker")}
              {renderSortHeader("Owner", "owner")}
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Class</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Snap Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">ES Qty</th>
              {renderSortHeader("Qty Delta", "qtyDelta", "right")}
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Snap MV</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">ES MV</th>
              {renderSortHeader("Status", "status")}
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((row, idx) => (
              <tr key={`${row.ticker}-${row.owner}-${idx}`} className="hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2 text-sm font-medium truncate">{row.ticker}</td>
                <td className="px-3 py-2 text-sm text-muted-foreground">{row.owner}</td>
                <td className="px-3 py-2 text-sm text-muted-foreground truncate">{row.account}</td>
                <td className="px-3 py-2 text-sm text-muted-foreground">{row.assetClass ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">
                  {row.snapshotQty != null ? formatNumber(row.snapshotQty, 4) : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">
                  {row.eventSourcedQty != null ? formatNumber(row.eventSourcedQty, 4) : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums font-medium">
                  {row.qtyDelta != null ? formatNumber(row.qtyDelta, 4) : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                  {row.snapshotMv != null ? formatCurrency(row.snapshotMv) : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                  {row.eventSourcedMv != null ? formatCurrency(row.eventSourcedMv) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                    <ResolutionBadge position={row} />
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <ReconciliationActionMenu
                    position={row}
                    onAction={onResolutionAction ?? (() => {})}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No positions matching filter
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function ResolutionBadge({ position }: { position: PositionReconciliation }) {
  const res = position.resolution;
  if (!res || res.status === "unresolved") return null;

  const badge = RESOLUTION_BADGES[res.status];
  if (!badge) return null;

  const natureLabel = res.nature ? NATURE_LABELS[res.nature] ?? res.nature : null;

  // Build tooltip content
  const tooltipParts: string[] = [];
  if (natureLabel) tooltipParts.push(natureLabel);
  if (res.notes) tooltipParts.push(res.notes);

  // Delta drift indicator
  const currentMvDelta = position.mvDelta ?? position.snapshotMv ?? position.eventSourcedMv ?? 0;
  const storedMvDelta = res.mvDeltaAtAction;
  if (storedMvDelta != null && Math.abs(currentMvDelta - storedMvDelta) > 1) {
    tooltipParts.push(
      `Was ${formatCurrency(storedMvDelta)} → now ${formatCurrency(currentMvDelta)}`
    );
  }

  const tooltipText = tooltipParts.length > 0 ? tooltipParts.join(" · ") : badge.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.classes}`}>
          {badge.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
