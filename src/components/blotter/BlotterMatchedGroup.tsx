"use client";

import { useState } from "react";
import { ChevronDownIcon, Link2Icon } from "lucide-react";
import { formatDateShort, formatDateTime, formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BlotterEntry } from "@/db/queries/blotter";
import { BlotterRecordRow } from "./BlotterRecordRow";

interface BlotterMatchedGroupProps {
  triageAction: BlotterEntry;
  linkedTrades: BlotterEntry[];
}

export function BlotterMatchedGroup({
  triageAction,
  linkedTrades,
}: BlotterMatchedGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Sort trades chronologically
  const sortedTrades = [...linkedTrades].sort((a, b) => {
    return b.actionDate.localeCompare(a.actionDate);
  });

  const totalQtyChange = linkedTrades.reduce(
    (sum, t) => sum + (t.qtyChange || 0),
    0
  );
  const totalPremiumChange = linkedTrades.reduce(
    (sum, t) => sum + (t.premiumChange || 0),
    0
  );

  return (
    <>
      {/* Triage Action Row (Primary) */}
      <tr
        className={cn(
          "border-b bg-emerald-50/30 hover:bg-emerald-50/50 transition-colors cursor-pointer border-l-4 border-l-emerald-400"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3 pl-8">
          <div className="flex items-center gap-2">
            <Link2Icon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <ChevronDownIcon
              className={cn(
                "h-3.5 w-3.5 text-slate-400 transition-transform shrink-0",
                isExpanded && "rotate-180"
              )}
            />
            <span className="text-xs text-slate-600">
              {triageAction.createdAt
                ? formatDateTime(triageAction.createdAt)
                : "—"}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-xs text-slate-600">
          {formatDateShort(triageAction.actionDate)}
        </td>
        <td className="px-4 py-3 text-center">
          <Badge
            variant="secondary"
            className="bg-purple-100 text-purple-700 border-purple-200 text-[11px] font-medium"
          >
            {triageAction.actionDetail || triageAction.reasonCode || "ACTION"}
          </Badge>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Matched ({linkedTrades.length} trade{linkedTrades.length !== 1 ? "s" : ""})
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-xs text-slate-600">
            {triageAction.reasonCode || triageAction.actionDetail || "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="text-xs text-slate-600">
            {totalQtyChange !== 0 && (
              <div className="font-medium">
                {totalQtyChange > 0 ? "+" : ""}
                {totalQtyChange}
              </div>
            )}
            {totalPremiumChange !== 0 && (
              <div className="text-slate-500">
                {formatCurrency(totalPremiumChange)}
              </div>
            )}
            {totalQtyChange === 0 && totalPremiumChange === 0 && (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </td>
      </tr>

      {/* Linked Trades (Indented) */}
      {isExpanded &&
        sortedTrades.map((trade) => (
          <tr
            key={trade.id}
            className="border-b bg-emerald-50/10 hover:bg-emerald-50/20 transition-colors border-l-4 border-l-emerald-300"
          >
            <td className="px-4 py-2 pl-12">
              <div className="flex items-center gap-2">
                <div className="h-px w-4 bg-emerald-300" />
                <span className="text-xs text-slate-500">
                  {trade.createdAt ? formatDateTime(trade.createdAt) : "—"}
                </span>
              </div>
            </td>
            <td className="px-4 py-2 text-center text-xs text-slate-500">
              {formatDateShort(trade.actionDate)}
            </td>
            <td className="px-4 py-2 text-center">
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-medium"
              >
                TRADE
              </Badge>
            </td>
            <td className="px-4 py-2 text-center">
              <span className="text-xs text-slate-500">
                {trade.ticker || "—"}
              </span>
            </td>
            <td className="px-4 py-2 text-center">
              <span className="text-xs text-slate-400">—</span>
            </td>
            <td className="px-4 py-2 text-center">
              <div className="text-xs text-slate-600">
                {trade.qtyChange !== null && (
                  <div className="font-medium">
                    {trade.qtyChange > 0 ? "+" : ""}
                    {trade.qtyChange}
                  </div>
                )}
                {trade.premiumChange !== null && (
                  <div className="text-slate-500">
                    {formatCurrency(trade.premiumChange)}
                  </div>
                )}
                {trade.qtyChange === null && trade.premiumChange === null && (
                  <span className="text-slate-400">—</span>
                )}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}
