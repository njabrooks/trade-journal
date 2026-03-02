"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { formatNumber } from "@/lib/formatters";
import { ArrowUpDown } from "lucide-react";
import type { AccountingPositionRow } from "@/db/queries/accounting";

type SortKey =
  | "ticker"
  | "owner"
  | "account"
  | "assetClass"
  | "quantity"
  | "price"
  | "marketValue"
  | "bookValue"
  | "unrealizedPnl"
  | "unrealizedPct";

type SortDir = "asc" | "desc";

function getSortValue(row: AccountingPositionRow, key: SortKey): number | string {
  switch (key) {
    case "ticker":
      return row.ticker.toLowerCase();
    case "owner":
      return row.owner.toLowerCase();
    case "account":
      return row.account.toLowerCase();
    case "assetClass":
      return (row.assetClass ?? "").toLowerCase();
    case "quantity":
      return row.quantity;
    case "price":
      return row.price ?? 0;
    case "marketValue":
      return row.marketValue ?? 0;
    case "bookValue":
      return row.bookValue ?? 0;
    case "unrealizedPnl":
      return row.unrealizedPnl ?? 0;
    case "unrealizedPct":
      return row.unrealizedPct ?? 0;
  }
}

interface AccountingPositionsTableProps {
  positions: AccountingPositionRow[];
  currency?: string;
}

export function AccountingPositionsTable({
  positions,
  currency = "USD",
}: AccountingPositionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [positions, sortKey, sortDir]);

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
          <ArrowUpDown
            className={`h-3 w-3 ${isActive ? "text-foreground" : "text-muted-foreground/40"}`}
          />
        </span>
      </th>
    );
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto min-w-0">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[14%]" /> {/* Asset */}
          <col className="w-[8%]" />  {/* Owner */}
          <col className="w-[10%]" /> {/* Account */}
          <col className="w-[7%]" />  {/* Class */}
          <col className="w-[9%]" />  {/* Quantity */}
          <col className="w-[9%]" />  {/* Price */}
          <col className="w-[12%]" /> {/* Market Value */}
          <col className="w-[11%]" /> {/* Book Value */}
          <col className="w-[11%]" /> {/* Unreal. P&L */}
          <col className="w-[9%]" />  {/* Unreal. % */}
        </colgroup>
        <thead className="border-b">
          <tr>
            {renderSortHeader("Asset", "ticker")}
            {renderSortHeader("Owner", "owner")}
            {renderSortHeader("Account", "account")}
            {renderSortHeader("Class", "assetClass")}
            {renderSortHeader("Quantity", "quantity", "right")}
            {renderSortHeader("Price", "price", "right")}
            {renderSortHeader("Market Value", "marketValue", "right")}
            {renderSortHeader("Book Value", "bookValue", "right")}
            {renderSortHeader("Unreal. P&L", "unrealizedPnl", "right")}
            {renderSortHeader("Unreal. %", "unrealizedPct", "right")}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((row, idx) => {
            const pnlColor =
              row.unrealizedPnl == null
                ? ""
                : row.unrealizedPnl >= 0
                  ? "text-emerald-600"
                  : "text-red-500";

            return (
              <tr
                key={`${row.assetId}-${row.owner}-${row.account}-${idx}`}
                className="hover:bg-muted/50 transition-colors"
              >
                <td className="px-3 py-2 text-sm overflow-hidden">
                  <div className="font-medium truncate">{row.ticker}</div>
                  {row.assetName && (
                    <div className="text-xs text-muted-foreground truncate">
                      {row.assetName}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-sm text-muted-foreground">
                  {row.owner}
                </td>
                <td className="px-3 py-2 text-sm text-muted-foreground">
                  {row.account}
                </td>
                <td className="px-3 py-2 text-sm text-muted-foreground">
                  {row.assetClass ?? "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">
                  {formatNumber(row.quantity, 4)}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                  {row.price != null ? formatCurrency(row.price, "USD", 2) : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums font-medium">
                  {row.marketValue != null
                    ? formatCurrency(row.marketValue, currency)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                  {row.bookValue != null
                    ? formatCurrency(row.bookValue, currency)
                    : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-sm text-right tabular-nums font-medium ${pnlColor}`}
                >
                  {row.unrealizedPnl != null
                    ? formatCurrency(row.unrealizedPnl, currency)
                    : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-sm text-right tabular-nums ${pnlColor}`}
                >
                  {row.unrealizedPct != null
                    ? formatPercent(row.unrealizedPct)
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {positions.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No position data available
        </div>
      )}
    </div>
  );
}
