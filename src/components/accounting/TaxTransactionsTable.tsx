"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import { formatCurrency, formatNumber, formatDateShort } from "@/lib/formatters";
import type { TaxTransactionRow } from "@/db/queries/tax-transactions";

type SortKey =
  | "timestamp"
  | "ticker"
  | "eventType"
  | "quantity"
  | "totalValue"
  | "acbCostBasis"
  | "acbGain"
  | "s104CostBasis"
  | "s104Gain";

type SortDir = "asc" | "desc";

const DISPOSAL_TYPES = new Set(["SELL", "SEND", "FEE", "GIFT_OUT"]);

function formatMatchTypes(types: string[] | null): string {
  if (!types || types.length === 0) return "—";
  return types
    .map((t) => {
      switch (t) {
        case "same_day": return "SD";
        case "bed_and_breakfast": return "B&B";
        case "section_104_pool": return "Pool";
        default: return t;
      }
    })
    .join(" + ");
}

interface TaxTransactionsTableProps {
  rows: TaxTransactionRow[];
  currency: string;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function TaxTransactionsTable({
  rows,
  currency,
  totalCount,
  page,
  pageSize,
  onPageChange,
}: TaxTransactionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const isGbp = currency === "GBP";

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "timestamp": av = a.timestamp; bv = b.timestamp; break;
        case "ticker": av = a.ticker.toLowerCase(); bv = b.ticker.toLowerCase(); break;
        case "eventType": av = a.eventType; bv = b.eventType; break;
        case "quantity": av = a.quantity; bv = b.quantity; break;
        case "totalValue":
          av = (isGbp ? a.totalValueGbp : a.totalValueUsd) ?? 0;
          bv = (isGbp ? b.totalValueGbp : b.totalValueUsd) ?? 0;
          break;
        case "acbCostBasis":
          av = (isGbp ? a.acbCostBasisGbp : a.acbCostBasisUsd) ?? 0;
          bv = (isGbp ? b.acbCostBasisGbp : b.acbCostBasisUsd) ?? 0;
          break;
        case "acbGain":
          av = (isGbp ? a.acbGainGbp : a.acbGainUsd) ?? 0;
          bv = (isGbp ? b.acbGainGbp : b.acbGainUsd) ?? 0;
          break;
        case "s104CostBasis": av = a.s104CostBasisGbp ?? 0; bv = b.s104CostBasisGbp ?? 0; break;
        case "s104Gain": av = a.s104GainGbp ?? 0; bv = b.s104GainGbp ?? 0; break;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, isGbp]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "eventType" || key === "timestamp" ? "asc" : "desc");
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

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto min-w-0">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[10%]" />  {/* Date */}
          <col className="w-[8%]" />   {/* Asset */}
          <col className="w-[7%]" />   {/* Type */}
          <col className="w-[9%]" />   {/* Quantity */}
          <col className="w-[6%]" />   {/* Owner */}
          <col className="w-[11%]" />  {/* Proceeds */}
          <col className="w-[11%]" />  {/* ACB Cost */}
          <col className="w-[11%]" />  {/* ACB Gain */}
          {isGbp && <col className="w-[11%]" />}  {/* S104 Cost */}
          {isGbp && <col className="w-[11%]" />}  {/* S104 Gain */}
          {isGbp && <col className="w-[5%]" />}   {/* Match */}
        </colgroup>
        <thead className="border-b">
          <tr>
            {renderSortHeader("Date", "timestamp")}
            {renderSortHeader("Asset", "ticker")}
            {renderSortHeader("Type", "eventType")}
            {renderSortHeader("Quantity", "quantity", "right")}
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Owner</th>
            {renderSortHeader("Proceeds", "totalValue", "right")}
            {renderSortHeader("ACB Cost", "acbCostBasis", "right")}
            {renderSortHeader("ACB Gain", "acbGain", "right")}
            {isGbp && renderSortHeader("S104 Cost", "s104CostBasis", "right")}
            {isGbp && renderSortHeader("S104 Gain", "s104Gain", "right")}
            {isGbp && (
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Match</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((row) => {
            const isDisposal = DISPOSAL_TYPES.has(row.eventType);
            const acbGain = isGbp ? row.acbGainGbp : row.acbGainUsd;
            const acbGainColor = acbGain == null ? "" : acbGain >= 0 ? "text-emerald-600" : "text-red-500";
            const s104GainColor = row.s104GainGbp == null ? "" : row.s104GainGbp >= 0 ? "text-emerald-600" : "text-red-500";
            const totalValue = isGbp ? row.totalValueGbp : row.totalValueUsd;
            const acbCost = isGbp ? row.acbCostBasisGbp : row.acbCostBasisUsd;

            return (
              <tr key={row.eventId} className="hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2 text-sm tabular-nums">
                  {formatDateShort(row.timestamp)}
                </td>
                <td className="px-3 py-2 text-sm font-medium truncate">
                  {row.ticker}
                </td>
                <td className="px-3 py-2 text-sm">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    isDisposal
                      ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  }`}>
                    {row.eventType}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">
                  {formatNumber(row.quantity, 4)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.owner}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">
                  {totalValue != null ? formatCurrency(totalValue, currency) : "—"}
                </td>
                <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                  {acbCost != null ? formatCurrency(acbCost, currency) : "—"}
                </td>
                <td className={`px-3 py-2 text-sm text-right tabular-nums font-medium ${acbGainColor}`}>
                  {acbGain != null ? formatCurrency(acbGain, currency) : "—"}
                </td>
                {isGbp && (
                  <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                    {row.s104CostBasisGbp != null ? formatCurrency(row.s104CostBasisGbp, "GBP") : "—"}
                  </td>
                )}
                {isGbp && (
                  <td className={`px-3 py-2 text-sm text-right tabular-nums font-medium ${s104GainColor}`}>
                    {row.s104GainGbp != null ? formatCurrency(row.s104GainGbp, "GBP") : "—"}
                  </td>
                )}
                {isGbp && (
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatMatchTypes(row.s104MatchTypes)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No transactions found for the selected filters
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of{" "}
            {totalCount.toLocaleString()} events
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 hover:bg-muted"
            >
              Prev
            </button>
            <span className="px-2 text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
