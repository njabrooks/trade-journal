"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { TriagePositionsTable } from "./TriagePositionsTable";
import { TriageActionsTable } from "./TriageActionsTable";
import { TriageActionButtons } from "./TriageActionButtons";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [minDte, setMinDte] = useState<number | null>(record.dte);
  // State for position selection (always enabled when expanded for non-QUANTITY_CHANGE)
  const [selectedPositionIds, setSelectedPositionIds] = useState<Set<string>>(new Set());
  const [positionQuantities, setPositionQuantities] = useState<Map<string, number>>(new Map());
  // Column count: checkbox + symbol + trigger + severity + context + date + dte + (strategy if shown)
  const columnCount = showStrategyColumn ? 8 : 7;

  // Calculate min DTE from positions when expanded or when record changes
  useEffect(() => {
    if (record.positionId || record.strategyId) {
      const fetchMinDte = async () => {
        try {
          let url = "";
          if (record.positionId) {
            url = `/api/positions?positionId=${record.positionId}`;
          } else if (record.strategyId) {
            url = `/api/positions?strategyId=${record.strategyId}`;
          }
          
          if (url) {
            const response = await fetch(url);
            if (response.ok) {
              const data = await response.json();
              const positionsList = Array.isArray(data) ? data : [data];
              
              // Calculate DTE for each option position
              const dteValues: number[] = [];
              positionsList.forEach((pos: any) => {
                if (pos.assetClass === 'OPT' && pos.expiry) {
                  const expiryDate = new Date(pos.expiry + 'T00:00:00Z');
                  const snapshotDateObj = new Date(record.snapshotDate + 'T00:00:00Z');
                  const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
                  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                  if (diffDays >= 0) {
                    dteValues.push(diffDays);
                  }
                }
              });
              
              if (dteValues.length > 0) {
                setMinDte(Math.min(...dteValues));
              } else {
                setMinDte(null);
              }
            }
          }
        } catch (err) {
          console.error("Failed to fetch positions for DTE calculation:", err);
        }
      };
      
      fetchMinDte();
    }
  }, [record.positionId, record.strategyId, record.snapshotDate]);

  // Reset position selections when row is expanded/collapsed
  useEffect(() => {
    setSelectedPositionIds(new Set());
  }, [isExpanded]);

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
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform shrink-0",
                isExpanded && "rotate-180"
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
            {minDte !== null ? minDte : "—"}
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
      {isExpanded && (
        <tr>
          <td colSpan={columnCount + 1} className="px-4 py-4 bg-slate-50">
            <div className="space-y-4">
              {/* Positions Table */}
              <TriagePositionsTable
                positionId={record.positionId}
                strategyId={record.strategyId}
                accountId={record.accountId}
                snapshotDate={record.snapshotDate}
                editMode={record.recommendedAction !== "QUANTITY_CHANGE"}
                selectedPositionIds={selectedPositionIds}
                onPositionSelect={async (positionId, selected) => {
                  const newSelected = new Set(selectedPositionIds);
                  if (selected) {
                    newSelected.add(positionId);
                    // Initialize quantity when selected (fetch current position quantity)
                    if (!positionQuantities.has(positionId)) {
                      try {
                        let url = "";
                        if (record.positionId) {
                          url = `/api/positions?positionId=${record.positionId}`;
                        } else if (record.strategyId) {
                          url = `/api/positions?strategyId=${record.strategyId}`;
                        }
                        if (url) {
                          const response = await fetch(url);
                          if (response.ok) {
                            const data = await response.json();
                            const positionsList = Array.isArray(data) ? data : [data];
                            const position = positionsList.find((p: any) => p.id === positionId);
                            if (position) {
                              const newQuantities = new Map(positionQuantities);
                              newQuantities.set(positionId, parseFloat(position.quantity) || 0);
                              setPositionQuantities(newQuantities);
                            }
                          }
                        }
                      } catch (err) {
                        console.error("Failed to fetch position quantity:", err);
                      }
                    }
                  } else {
                    newSelected.delete(positionId);
                    // Remove quantity when deselected
                    const newQuantities = new Map(positionQuantities);
                    newQuantities.delete(positionId);
                    setPositionQuantities(newQuantities);
                  }
                  setSelectedPositionIds(newSelected);
                }}
                onSelectAll={async () => {
                  // Fetch positions to select all
                  try {
                    let url = "";
                    if (record.positionId) {
                      url = `/api/positions?positionId=${record.positionId}`;
                    } else if (record.strategyId) {
                      url = `/api/positions?strategyId=${record.strategyId}`;
                    }
                    if (url) {
                      const response = await fetch(url);
                      if (response.ok) {
                        const data = await response.json();
                        const positionsList = Array.isArray(data) ? data : [data];
                        setSelectedPositionIds(new Set(positionsList.map((p: any) => p.id)));
                        // Initialize quantities for all positions
                        const newQuantities = new Map<string, number>();
                        positionsList.forEach((p: any) => {
                          newQuantities.set(p.id, parseFloat(p.quantity) || 0);
                        });
                        setPositionQuantities(newQuantities);
                      }
                    }
                  } catch (err) {
                    console.error("Failed to fetch positions for select all:", err);
                  }
                }}
                onDeselectAll={() => {
                  setSelectedPositionIds(new Set());
                  setPositionQuantities(new Map());
                }}
                positionQuantities={positionQuantities}
                onQuantityChange={(positionId, quantity) => {
                  const newQuantities = new Map(positionQuantities);
                  newQuantities.set(positionId, quantity);
                  setPositionQuantities(newQuantities);
                }}
              />

              {/* Notes (only if not QUANTITY_CHANGE or if there are additional notes) */}
              {record.notes && 
               record.recommendedAction !== "QUANTITY_CHANGE" && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                    Notes
                  </p>
                  <div className="px-0">
                    <p className="text-sm text-slate-700 leading-relaxed">{record.notes}</p>
                  </div>
                </div>
              )}

              {/* Actions - show trade form when positions are selected, otherwise show action buttons */}
              {selectedPositionIds.size > 0 && record.recommendedAction !== "QUANTITY_CHANGE" ? (
                <TriageActionButtons
                  triageId={record.id}
                  contextLevel={record.contextLevel}
                  recommendedAction={record.recommendedAction}
                  strategyId={record.strategyId}
                  positionId={record.positionId}
                  severity={record.severity}
                  initialAction="TRADE"
                  onActionComplete={() => {
                    setIsExpanded(false);
                    setSelectedPositionIds(new Set());
                    setPositionQuantities(new Map());
                  }}
                  selectedPositionIds={selectedPositionIds}
                  onPositionSelectionChange={setSelectedPositionIds}
                  positionQuantities={positionQuantities}
                />
              ) : (
                <TriageActionsTable
                  triageId={record.id}
                  contextLevel={record.contextLevel}
                  recommendedAction={record.recommendedAction}
                  strategyId={record.strategyId}
                  positionId={record.positionId}
                  severity={record.severity}
                  onActionComplete={() => {
                    setIsExpanded(false);
                    setSelectedPositionIds(new Set());
                  }}
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

