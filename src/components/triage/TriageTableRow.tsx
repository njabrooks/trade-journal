"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { TriagePositionsTable } from "./TriagePositionsTable";
import { TriageActionsTable } from "./TriageActionsTable";
import { TriageQuickActions } from "./TriageQuickActions";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface TriageTableRowProps {
  record: {
    id: string;
    symbol: string;
    recommendedAction: string | null;
    severity: string | null;
    contextLevel: string;
    snapshotDate: string;
    dte: number | null;
    absNotional: number | null;
    unrealizedPnl: number | null;
    pctNavAbsNotional: number | null;
    notes: string | null;
    positionId: string | null;
    strategyId: string | null;
    accountId: string;
  };
  showStrategyColumn?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

function SeverityTag({ severity }: { severity: string | null }) {
  const normalized = severity ?? "info";
  const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    urgent: "destructive",
    attention: "secondary",
    monitor: "secondary",
    info: "outline",
    pending: "secondary",
    complete: "secondary",
  };
  
  const classNameMap: Record<string, string> = {
    urgent: "bg-rose-100 text-rose-700 border-rose-200",
    attention: "bg-amber-100 text-amber-700 border-amber-200",
    monitor: "bg-blue-100 text-blue-700 border-blue-200",
    info: "bg-slate-200 text-slate-700 border-slate-300",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    complete: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  
  return (
    <Badge
      variant={variantMap[normalized] ?? "outline"}
      className={cn("text-[11px] font-medium", classNameMap[normalized] ?? classNameMap.info)}
    >
      {normalized}
    </Badge>
  );
}

export function TriageTableRow({ 
  record, 
  showStrategyColumn = true,
  isSelected = false,
  onSelect,
}: TriageTableRowProps) {
  const [isPositionsOpen, setIsPositionsOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  // Column count: checkbox + symbol + trigger + severity + context + date + dte + (strategy if shown) + actions
  const columnCount = showStrategyColumn ? 9 : 8;

  return (
    <>
      <tr 
        className={cn(
          "border-b transition-colors hover:bg-slate-50",
          isSelected && "bg-blue-50"
        )}
      >
        <td 
          className="px-4 py-3 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect?.(record.id, e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
        </td>
        <td 
          className="px-4 py-3 text-left cursor-pointer"
          onClick={() => setIsPositionsOpen(!isPositionsOpen)}
        >
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform shrink-0",
                isPositionsOpen && "rotate-180"
              )}
            />
            <span className="font-medium text-slate-900">{record.symbol}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-left">
          <span className="text-sm text-slate-600">{record.recommendedAction || "Review"}</span>
        </td>
          <td className="px-4 py-3 text-center">
            <SeverityTag severity={record.severity} />
          </td>
          <td className="px-4 py-3 text-center">
            <span className="text-xs text-slate-600">{record.contextLevel}</span>
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-600">
            {formatDateShort(record.snapshotDate)}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-600">
            {record.dte ?? "—"} DTE
          </td>
          {showStrategyColumn && (
            <td className="px-4 py-3 text-center">
              {record.strategyId ? (
                <Link
                  href={`/strategies/${record.strategyId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View
                </Link>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </td>
          )}
          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
            <TriageQuickActions
              onToggle={() => setIsActionsOpen(!isActionsOpen)}
              isOpen={isActionsOpen}
            />
          </td>
      </tr>
      {isPositionsOpen && (
        <tr>
          <td colSpan={columnCount + 1} className="px-4 py-4 bg-slate-50">
            <div className="space-y-4">
              {/* Positions Table - CENTERPIECE */}
              <TriagePositionsTable
                positionId={record.positionId}
                strategyId={record.strategyId}
                accountId={record.accountId}
                snapshotDate={record.snapshotDate}
              />

              {/* Notes */}
              {record.notes && (
                <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
                  <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">Notes</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-sm text-slate-700 leading-relaxed">{record.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      {isActionsOpen && (
        <tr>
          <td colSpan={columnCount + 1} className="px-4 py-4 bg-slate-50">
            <TriageActionsTable
              triageId={record.id}
              contextLevel={record.contextLevel}
              recommendedAction={record.recommendedAction}
              strategyId={record.strategyId}
              positionId={record.positionId}
              severity={record.severity}
              onActionComplete={() => setIsActionsOpen(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

