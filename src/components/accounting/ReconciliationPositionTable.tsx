"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { ArrowUpDown, Filter } from "lucide-react";
import type { PositionReconciliation } from "@/db/queries/reconciliation";

type StatusFilter = "all" | "discrepancies" | "match" | "qty_mismatch" | "mv_mismatch" | "snapshot_only" | "event_sourced_only";
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

interface ReconciliationPositionTableProps {
  positions: PositionReconciliation[];
}

export function ReconciliationPositionTable({ positions }: ReconciliationPositionTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("discrepancies");
  const [sortKey, setSortKey] = useState<SortKey>("mvDelta");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return positions;
    if (statusFilter === "discrepancies") return positions.filter((p) => p.status !== "match");
    return positions.filter((p) => p.status === statusFilter);
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
    { value: "discrepancies", label: "Discrepancies", count: positions.filter((p) => p.status !== "match").length },
    { value: "all", label: "All", count: positions.length },
    { value: "match", label: "Matches", count: positions.filter((p) => p.status === "match").length },
    { value: "snapshot_only", label: "Snap-only", count: positions.filter((p) => p.status === "snapshot_only").length },
    { value: "event_sourced_only", label: "ES-only", count: positions.filter((p) => p.status === "event_sourced_only").length },
  ];

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto min-w-0">
      <div className="flex items-center gap-2 border-b px-3 py-2">
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
          <col className="w-[14%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[11%]" />
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
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}>
                  {STATUS_LABELS[row.status]}
                </span>
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
  );
}
