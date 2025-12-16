"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateShort, formatDateTime, formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { BlotterEntry } from "@/db/queries/blotter";
import { TradeDetailsCard } from "./TradeDetailsCard";
import { PositionDetailsCard } from "./PositionDetailsCard";

interface BlotterRecordRowProps {
  entry: BlotterEntry;
}

function ActionBadge({
  actionClass,
  actionDetail,
  reasonCode,
}: {
  actionClass: string | null;
  actionDetail: string | null;
  reasonCode: string | null;
}) {
  // For display, prefer actionDetail for clarity
  const displayText = actionDetail || reasonCode || actionClass || "—";
  
  const variantMap: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    TRADE: "default",
    QUANTITY_CHANGE: "secondary",
    MONITOR: "secondary",
    DISMISS: "outline",
    UPDATE: "secondary",
  };

  const classNameMap: Record<string, string> = {
    TRADE: "bg-blue-100 text-blue-700 border-blue-200",
    QUANTITY_CHANGE: "bg-amber-100 text-amber-700 border-amber-200",
    MONITOR: "bg-blue-100 text-blue-700 border-blue-200",
    DISMISS: "bg-slate-100 text-slate-700 border-slate-200",
    UPDATE: "bg-purple-100 text-purple-700 border-purple-200",
  };

  // Normalize for badge styling - use actionDetail first, then actionClass
  const normalized = actionDetail || actionClass || "outline";

  return (
    <Badge
      variant={variantMap[normalized] ?? "outline"}
      className={cn(
        "text-[11px] font-medium",
        classNameMap[normalized] ?? classNameMap.DISMISS
      )}
    >
      {displayText}
    </Badge>
  );
}

function StatusIndicator({ entry }: { entry: BlotterEntry }) {
  const isTrade = entry.source === "trade_ingestion";
  const isMatched =
    !!entry.linkedBlotterActionId ||
    (entry.linkedTradeBlotterIds && entry.linkedTradeBlotterIds.length > 0);
  const needsMetadata = isTrade && !isMatched;
  const needsTrade =
    entry.actionClass === "TRADE" &&
    entry.source === "triage_action" &&
    !isMatched;
  const hasFollowUp = entry.followUpRequired && !entry.completed;

  if (needsMetadata) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
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
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        Unmatched
      </span>
    );
  }

  if (needsTrade) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
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
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Needs trade
      </span>
    );
  }

  if (hasFollowUp) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Follow-up
      </span>
    );
  }

  return <span className="text-xs text-slate-400">—</span>;
}

export function BlotterRecordRow({ entry }: BlotterRecordRowProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const isTrade = entry.source === "trade_ingestion";
  const needsMetadata = isTrade && !entry.linkedBlotterActionId;
  const hasFollowUp = entry.followUpRequired && !entry.completed;

  return (
    <>
      <tr
        className={cn(
          "border-b transition-colors hover:bg-slate-50",
          (needsMetadata || hasFollowUp) &&
            "bg-amber-50/50 border-l-4 border-l-amber-400"
        )}
      >
        <td
          className="px-4 py-3 text-left cursor-pointer"
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
        >
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform shrink-0",
                isDetailsOpen && "rotate-180"
              )}
            />
            <span className="text-xs text-slate-600">
              {entry.createdAt ? formatDateTime(entry.createdAt) : "—"}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-xs text-slate-600">
          {formatDateShort(entry.actionDate)}
        </td>
        <td className="px-4 py-3 text-center">
          {entry.strategyId ? (
            <Link
              href={`/strategies/${entry.strategyId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {entry.strategyKey ?? "Strategy"}
            </Link>
          ) : (
            <span className="text-xs text-slate-400">Unlinked</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <ActionBadge
            actionClass={entry.actionClass}
            actionDetail={entry.actionDetail}
            reasonCode={entry.reasonCode}
          />
        </td>
        <td className="px-4 py-3 text-center">
          <StatusIndicator entry={entry} />
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-xs text-slate-600">
            {entry.reasonCode || entry.actionDetail || "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="text-xs text-slate-600">
            {entry.qtyChange !== null && (
              <div className="font-medium">
                {entry.qtyChange > 0 ? "+" : ""}
                {entry.qtyChange}
              </div>
            )}
            {entry.premiumChange !== null && (
              <div className="text-slate-500">
                {formatCurrency(entry.premiumChange)}
              </div>
            )}
            {entry.qtyChange === null && entry.premiumChange === null && (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </td>
      </tr>
      {isDetailsOpen && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-slate-50">
            <div className="space-y-4">
              {/* Trade Details Section */}
              {isTrade && (
                <>
                  {entry.tradeDetails && entry.tradeDetails.length > 0 ? (
                    <TradeDetailsCard entry={entry} />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                        Trade Details
                      </p>
                      <div className="space-y-2">
                        {entry.tradeCount && entry.tradeCount > 1 && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">{entry.tradeCount}</span>{" "}
                            trades aggregated
                          </div>
                        )}
                        {entry.ticker && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">Ticker:</span>{" "}
                            {entry.ticker}
                          </div>
                        )}
                        {entry.conid && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">ConID:</span>{" "}
                            {entry.conid}
                          </div>
                        )}
                        {entry.qtyChange !== null && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">Quantity Change:</span>{" "}
                            {entry.qtyChange > 0 ? "+" : ""}
                            {entry.qtyChange}
                          </div>
                        )}
                        {entry.premiumChange !== null && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">Premium Change:</span>{" "}
                            {formatCurrency(entry.premiumChange)}
                          </div>
                        )}
                        {entry.realizedPnl !== null && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">Realized P&L:</span>{" "}
                            {formatCurrency(entry.realizedPnl)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {entry.positionDetails && (
                    <PositionDetailsCard entry={entry} />
                  )}
                </>
              )}

              {/* Action Details Section */}
              {!isTrade && (
                <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
                  <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                      Action Details
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {entry.reasonCode && (
                      <div className="text-sm text-slate-700">
                        <span className="font-medium">Reason:</span>{" "}
                        {entry.reasonCode}
                      </div>
                    )}
                    {entry.notes && (
                      <div className="text-sm text-slate-700">
                        <span className="font-medium">Notes:</span>{" "}
                        {entry.notes}
                      </div>
                    )}
                    {entry.actionDetail === "QUANTITY_CHANGE" &&
                      entry.linkedTradeReason && (
                        <div className="text-sm text-slate-700">
                          <span className="font-medium">Trade Reason:</span>{" "}
                          {entry.linkedTradeReason}
                          {entry.linkedTradeStage && (
                            <span className="text-slate-500">
                              {" "}
                              · {entry.linkedTradeStage}
                            </span>
                          )}
                        </div>
                      )}
                    {(entry.actionDetail === "MONITOR" ||
                      entry.actionDetail === "DISMISS") && (
                      <div className="space-y-1">
                        {entry.actionDetail === "MONITOR" &&
                          entry.overrideExpiresDate && (
                            <div className="text-sm text-slate-700">
                              <span className="font-medium">Expires:</span>{" "}
                              {formatDateShort(entry.overrideExpiresDate)}
                              {entry.monitorDays && (
                                <span className="text-slate-500">
                                  {" "}
                                  ({entry.monitorDays} days)
                                </span>
                              )}
                            </div>
                          )}
                        {entry.actionDetail === "DISMISS" &&
                          entry.severityOverride === "info" && (
                            <div className="text-sm text-slate-700">
                              <span className="font-medium">Status:</span>{" "}
                              Permanent override
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Linking Information Section */}
              {entry.linkedTradeEntries &&
                entry.linkedTradeEntries.length > 0 && (
                  <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
                    <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                        Linked Trades
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {entry.linkedTradeEntries.map((linkedTrade) => (
                        <div
                          key={linkedTrade.id}
                          className="text-sm text-slate-600"
                        >
                          {linkedTrade.ticker}:{" "}
                          {linkedTrade.qtyChange &&
                            linkedTrade.qtyChange > 0 &&
                            "+"}
                          {linkedTrade.qtyChange} @{" "}
                          {formatCurrency(linkedTrade.premiumChange)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Follow-up Section */}
              {entry.followUpRequired && (
                <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
                  <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                      Follow-up
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="text-sm text-slate-700">
                      <span className="font-medium">Status:</span>{" "}
                      <span
                        className={
                          entry.completed
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }
                      >
                        {entry.completed ? "Completed" : "Pending"}
                      </span>
                    </div>
                    {entry.followUpDate && (
                      <div className="text-sm text-slate-700">
                        <span className="font-medium">Follow-up Date:</span>{" "}
                        {formatDateShort(entry.followUpDate)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
