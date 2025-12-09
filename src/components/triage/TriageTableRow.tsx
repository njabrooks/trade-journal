"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { TriageActionButtons } from "./TriageActionButtons";
import { PositionList } from "./PositionList";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort, formatPercent } from "@/lib/formatters";
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
  };
  showStrategyColumn?: boolean;
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

export function TriageTableRow({ record, showStrategyColumn = true }: TriageTableRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const columnCount = showStrategyColumn ? 7 : 6; // Reduced: removed Abs Notional, Unrealized, % NAV

  return (
    <>
      <tr 
        className="cursor-pointer border-b transition-colors hover:bg-slate-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <td className="px-4 py-3 text-left">
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform shrink-0",
                isOpen && "rotate-180"
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
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={columnCount} className="px-4 py-4 bg-slate-50">
            <div className="space-y-4">
              {/* Metrics Grid */}
              <dl className="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400 mb-1">Abs Notional</dt>
                  <dd className="font-medium text-slate-900">{formatCurrency(record.absNotional)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400 mb-1">Unrealized</dt>
                  <dd
                    className={
                      record.unrealizedPnl && record.unrealizedPnl >= 0
                        ? "font-medium text-emerald-600"
                        : "font-medium text-rose-600"
                    }
                  >
                    {formatCurrency(record.unrealizedPnl)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400 mb-1">% NAV</dt>
                  <dd className="font-medium text-slate-600">{formatPercent(record.pctNavAbsNotional)}</dd>
                </div>
              </dl>

              {/* Positions List */}
              <PositionList
                key={`${record.id}-${record.positionId}-${record.strategyId}`}
                positionId={record.positionId}
                strategyId={record.strategyId}
              />

              {/* Notes */}
              {record.notes && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
                  <p className="text-sm text-slate-600">{record.notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div>
                <TriageActionButtons
                  triageId={record.id}
                  contextLevel={record.contextLevel}
                  recommendedAction={record.recommendedAction}
                  strategyId={record.strategyId}
                  positionId={record.positionId}
                  severity={record.severity}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

