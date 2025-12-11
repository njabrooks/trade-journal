"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronDownIcon, Link2Icon } from "lucide-react";
import { formatDateShort, formatDateTime, formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BlotterEntry } from "@/db/queries/blotter";

interface BlotterMatchedGroupProps {
  triageAction: BlotterEntry;
  linkedTrades: BlotterEntry[];
}

interface MatchedRecord {
  entry: BlotterEntry;
  actionLabel: "DECISION" | "RECONCILE" | "EXECUTION";
}

export function BlotterMatchedGroup({
  triageAction,
  linkedTrades,
}: BlotterMatchedGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Find the trade ingestion record (for event date)
  const tradeIngestion = linkedTrades.find((t) => t.source === "trade_ingestion");
  const eventDate = tradeIngestion?.actionDate || triageAction.actionDate;

  // Get most recent processed date
  const allDates = [
    triageAction.createdAt,
    ...linkedTrades.map((t) => t.createdAt),
  ].filter(Boolean) as string[];
  const mostRecentProcessed = allDates.sort((a, b) => b.localeCompare(a))[0] || null;

  // Calculate totals
  const totalQtyChange = linkedTrades.reduce(
    (sum, t) => sum + (t.qtyChange || 0),
    0
  );
  const totalPremiumChange = linkedTrades.reduce(
    (sum, t) => sum + (t.premiumChange || 0),
    0
  );

  // Organize matched records for expanded view
  const matchedRecords = useMemo(() => {
    const records: MatchedRecord[] = [];

    // Add triage action
    if (triageAction.source === "triage_action") {
      if (triageAction.actionDetail === "TRADE") {
        records.push({
          entry: triageAction,
          actionLabel: "DECISION",
        });
      } else if (triageAction.reasonCode === "QUANTITY_CHANGE") {
        records.push({
          entry: triageAction,
          actionLabel: "RECONCILE",
        });
      }
    }

    // Add trade ingestion records
    linkedTrades
      .filter((t) => t.source === "trade_ingestion")
      .forEach((trade) => {
        records.push({
          entry: trade,
          actionLabel: "EXECUTION",
        });
      });

    // Sort chronologically by createdAt (newest first, descending) to match primary row sorting
    // This shows the most recent processing first, which typically means RECONCILE appears before EXECUTION
    return records.sort((a, b) => {
      const dateA = a.entry.createdAt || "";
      const dateB = b.entry.createdAt || "";
      return dateB.localeCompare(dateA); // Descending: newest first
    });
  }, [triageAction, linkedTrades]);

  return (
    <>
      {/* Primary Summary Row */}
      <tr
        className={cn(
          "border-b hover:bg-slate-50 transition-colors cursor-pointer"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3 text-left">
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform shrink-0",
                isExpanded && "rotate-180"
              )}
            />
            <span className="text-xs text-slate-600">
              {mostRecentProcessed ? formatDateTime(mostRecentProcessed) : "—"}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-xs text-slate-600">
          {formatDateShort(eventDate)}
        </td>
        <td className="px-4 py-3 text-center">
          {triageAction.strategyId ? (
            <Link
              href={`/strategies/${triageAction.strategyId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {triageAction.strategyKey ?? "Strategy"}
            </Link>
          ) : (
            <span className="text-xs text-slate-400">Unlinked</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <Badge
            variant="default"
            className="bg-blue-100 text-blue-700 border-blue-200 text-[11px] font-medium"
          >
            TRADE
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

      {/* Expanded Matched Records */}
      {isExpanded && (
        <>
          {matchedRecords.map((record) => (
            <tr
              key={record.entry.id}
              className="border-b bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <td className="px-4 py-2 pl-8">
                <span className="text-xs text-slate-500">
                  {record.entry.createdAt ? formatDateTime(record.entry.createdAt) : "—"}
                </span>
              </td>
              <td className="px-4 py-2 text-center text-xs text-slate-500">
                {formatDateShort(record.entry.actionDate)}
              </td>
              <td className="px-4 py-2 text-center">
                {record.entry.strategyId ? (
                  <Link
                    href={`/strategies/${record.entry.strategyId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {record.entry.strategyKey ?? "Strategy"}
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Unlinked</span>
                )}
              </td>
              <td className="px-4 py-2 text-center">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] font-medium",
                    record.actionLabel === "DECISION" &&
                      "bg-purple-50 text-purple-700 border-purple-200",
                    record.actionLabel === "EXECUTION" &&
                      "bg-blue-50 text-blue-700 border-blue-200",
                    record.actionLabel === "RECONCILE" &&
                      "bg-amber-50 text-amber-700 border-amber-200"
                  )}
                >
                  {record.actionLabel}
                </Badge>
              </td>
              <td className="px-4 py-2 text-center">
                <span className="text-xs text-slate-500">
                  {record.entry.ticker || "—"}
                </span>
              </td>
              <td className="px-4 py-2 text-center">
                <span className="text-xs text-slate-400">—</span>
              </td>
              <td className="px-4 py-2 text-center">
                <div className="text-xs text-slate-600">
                  {record.entry.qtyChange !== null && (
                    <div className="font-medium">
                      {record.entry.qtyChange > 0 ? "+" : ""}
                      {record.entry.qtyChange}
                    </div>
                  )}
                  {record.entry.premiumChange !== null && (
                    <div className="text-slate-500">
                      {formatCurrency(record.entry.premiumChange)}
                    </div>
                  )}
                  {record.entry.qtyChange === null &&
                    record.entry.premiumChange === null && (
                      <span className="text-slate-400">—</span>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </>
      )}
    </>
  );
}
