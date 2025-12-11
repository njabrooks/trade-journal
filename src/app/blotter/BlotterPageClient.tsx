"use client";

import { useMemo } from "react";
import { BlotterStrategyGroup } from "@/components/blotter/BlotterStrategyGroup";
import type { BlotterEntry } from "@/db/queries/blotter";

interface BlotterPageClientProps {
  entries: BlotterEntry[];
}

export function BlotterPageClient({ entries }: BlotterPageClientProps) {
  // Group entries by strategy
  const groupedByStrategy = useMemo(() => {
    const groups = new Map<
      string,
      { strategyKey: string | null; strategyId: string | null; entries: BlotterEntry[] }
    >();

    for (const entry of entries) {
      const key = entry.strategyKey || "unlinked";
      if (!groups.has(key)) {
        groups.set(key, {
          strategyKey: entry.strategyKey,
          strategyId: entry.strategyId,
          entries: [],
        });
      }
      groups.get(key)!.entries.push(entry);
    }

    // Sort groups: strategies first (alphabetically), then unlinked
    const sortedGroups = Array.from(groups.entries()).sort(([keyA], [keyB]) => {
      if (keyA === "unlinked") return 1;
      if (keyB === "unlinked") return -1;
      return keyA.localeCompare(keyB);
    });

    return sortedGroups.map(([_, group]) => group);
  }, [entries]);

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
                <th className="px-4 py-3 text-left">Strategy / Processed</th>
                <th className="px-4 py-3 text-center">Event Date</th>
                <th className="px-4 py-3 text-center">Action</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Reason</th>
                <th className="px-4 py-3 text-center">Financials</th>
              </tr>
            </thead>
            <tbody>
              {groupedByStrategy.map((group, idx) => (
                <BlotterStrategyGroup
                  key={group.strategyKey || `unlinked-${idx}`}
                  strategyKey={group.strategyKey}
                  strategyId={group.strategyId}
                  entries={group.entries}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
