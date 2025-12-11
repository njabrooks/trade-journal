"use client";

import { useMemo } from "react";
import { BlotterDateGroup } from "@/components/blotter/BlotterDateGroup";
import { SortableHeader } from "@/components/triage/SortableHeader";
import type { BlotterEntry } from "@/db/queries/blotter";

interface BlotterPageClientProps {
  entries: BlotterEntry[];
  sort?: string;
  direction?: "asc" | "desc";
}

export function BlotterPageClient({ entries, sort, direction }: BlotterPageClientProps) {
  // Group entries by date (actionDate)
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, BlotterEntry[]>();

    for (const entry of entries) {
      const dateKey = entry.actionDate;
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(entry);
    }

    // Sort date groups based on sort parameter
    const sortedGroups = Array.from(groups.entries()).sort(([dateA], [dateB]) => {
      if (sort === "actionDate") {
        return direction === "asc" 
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      }
      // Default: newest dates first
      return dateB.localeCompare(dateA);
    });

    return sortedGroups;
  }, [entries, sort, direction]);

  return (
    <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        {entries.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            No blotter entries match the selected filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <SortableHeader column="createdAt" className="text-left">
                  Processed
                </SortableHeader>
                <SortableHeader column="actionDate" className="text-center">
                  Event Date
                </SortableHeader>
                <SortableHeader column="strategyKey" className="text-center">
                  Strategy
                </SortableHeader>
                <SortableHeader column="actionClass" className="text-center">
                  Action
                </SortableHeader>
                <th className="px-4 py-3 text-center text-xs uppercase tracking-wide text-slate-400">
                  Status
                </th>
                <SortableHeader column="reasonCode" className="text-center">
                  Reason
                </SortableHeader>
                <SortableHeader column="premiumChange" className="text-right">
                  Financials
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {groupedByDate.map(([date, dateEntries]) => (
                <BlotterDateGroup
                  key={date}
                  date={date}
                  entries={dateEntries}
                  sort={sort}
                  direction={direction}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
