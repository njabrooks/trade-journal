"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import { formatCurrency, formatNumber, formatDateShort } from "@/lib/formatters";
import type { TaxTransactionRow } from "@/lib/tax-transactions-types";

type SortKey =
  | "timestamp"
  | "ticker"
  | "eventType"
  | "quantity"
  | "price"
  | "proceeds"
  | "costBasis"
  | "gain";

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

  function getProceeds(r: TaxTransactionRow) {
    return isGbp ? r.totalValueGbp : r.totalValueUsd;
  }
  function getCostBasis(r: TaxTransactionRow) {
    return isGbp ? r.s104CostBasisGbp : r.acbCostBasisUsd;
  }
  function getGain(r: TaxTransactionRow) {
    return isGbp ? r.s104GainGbp : r.acbGainUsd;
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "timestamp": av = a.timestamp; bv = b.timestamp; break;
        case "ticker": av = a.ticker.toLowerCase(); bv = b.ticker.toLowerCase(); break;
        case "eventType": av = a.eventType; bv = b.eventType; break;
        case "quantity": av = a.quantity; bv = b.quantity; break;
        case "price": av = a.price ?? 0; bv = b.price ?? 0; break;
        case "proceeds": av = getProceeds(a) ?? 0; bv = getProceeds(b) ?? 0; break;
        case "costBasis": av = getCostBasis(a) ?? 0; bv = getCostBasis(b) ?? 0; break;
        case "gain": av = getGain(a) ?? 0; bv = getGain(b) ?? 0; break;
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

  function th(label: string, align?: "right") {
    return (
      <th className={`px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}>
        {label}
      </th>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const costLabel = isGbp ? "S104 Cost" : "ACB Cost";
  const gainLabel = isGbp ? "S104 Gain" : "ACB Gain";

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto min-w-0">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            {renderSortHeader("Date", "timestamp")}
            {renderSortHeader("Asset", "ticker")}
            {renderSortHeader("Type", "eventType")}
            {th("Tag")}
            {renderSortHeader("Qty", "quantity", "right")}
            {renderSortHeader("Price", "price", "right")}
            {th("Owner")}
            {th("Account")}
            {th("Source")}
            {renderSortHeader("Proceeds", "proceeds", "right")}
            {renderSortHeader(costLabel, "costBasis", "right")}
            {renderSortHeader(gainLabel, "gain", "right")}
            {isGbp && th("Match")}
            {isGbp && th("FX", "right")}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((row) => {
            const isDisposal = DISPOSAL_TYPES.has(row.eventType);
            const gain = getGain(row);
            const gainColor = gain == null ? "" : gain >= 0 ? "text-emerald-600" : "text-red-500";
            const proceeds = getProceeds(row);
            const costBasis = getCostBasis(row);

            return (
              <tr key={row.eventId} className="hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {formatDateShort(row.timestamp)}
                </td>
                <td className="px-3 py-2 font-medium truncate max-w-[6rem]">
                  {row.ticker}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    isDisposal
                      ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  }`}>
                    {row.eventType}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[5rem]">
                  {row.tag ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(row.quantity, 4)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.price != null ? formatCurrency(row.price, "USD") : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.owner}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[5rem]">
                  {row.account}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.source}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {proceeds != null ? formatCurrency(proceeds, currency) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {costBasis != null ? formatCurrency(costBasis, currency) : "—"}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${gainColor}`}>
                  {gain != null ? formatCurrency(gain, currency) : "—"}
                </td>
                {isGbp && (
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatMatchTypes(row.s104MatchTypes)}
                  </td>
                )}
                {isGbp && (
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                    {row.fxRateToGbp != null ? row.fxRateToGbp.toFixed(4) : "—"}
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
