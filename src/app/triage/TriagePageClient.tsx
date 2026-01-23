"use client";

import { useState } from "react";
import { TriageTableRow } from "@/components/triage/TriageTableRow";
import { TriageBulkActions } from "@/components/triage/TriageBulkActions";
import { SortableHeader } from "@/components/triage/SortableHeader";

interface TriagePageClientProps {
  records: Array<{
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
    strategyKey: string | null;
  }>;
}

export function TriagePageClient({ records }: TriagePageClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedIds(new Set(records.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < records.length;

  return (
    <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <TriageBulkActions
        selectedIds={Array.from(selectedIds)}
        records={records}
        onClearSelection={handleClearSelection}
      />
      <div className="overflow-x-auto">
        {records.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            No triage flags match the selected filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                </th>
                <SortableHeader column="symbol" className="text-left">
                  Symbol
                </SortableHeader>
                <SortableHeader column="recommendedAction" className="text-left">
                  Trigger
                </SortableHeader>
                <SortableHeader column="severity" className="text-center">
                  Severity
                </SortableHeader>
                <SortableHeader column="contextLevel" className="text-center">
                  Context
                </SortableHeader>
                <SortableHeader column="snapshotDate" className="text-center">
                  Date
                </SortableHeader>
                <SortableHeader column="dte" className="text-center">
                  DTE
                </SortableHeader>
                <SortableHeader column="strategyKey" className="text-center">
                  Strategy
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <TriageTableRow
                  key={record.id}
                  record={record}
                  isSelected={selectedIds.has(record.id)}
                  onSelect={handleSelect}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

