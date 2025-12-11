"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { formatDateShort, formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { BlotterEntry } from "@/db/queries/blotter";
import { BlotterMatchedGroup } from "./BlotterMatchedGroup";
import { BlotterRecordRow } from "./BlotterRecordRow";

interface BlotterStrategyGroupProps {
  strategyKey: string | null;
  strategyId: string | null;
  entries: BlotterEntry[];
}

interface MatchedGroup {
  triageAction: BlotterEntry;
  linkedTrades: BlotterEntry[];
}

export function BlotterStrategyGroup({
  strategyKey,
  strategyId,
  entries,
}: BlotterStrategyGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Group entries into matched groups and unmatched records
  const { matchedGroups, unmatchedEntries } = organizeEntries(entries);

  // Calculate summary stats
  const totalRecords = entries.length;
  const unmatchedTrades = unmatchedEntries.filter(
    (e) => e.source === "trade_ingestion"
  ).length;
  const unmatchedActions = unmatchedEntries.filter(
    (e) => e.source === "triage_action"
  ).length;
  const matchedCount = matchedGroups.length;
  const latestDate = entries.reduce((latest, entry) => {
    const entryDate = entry.actionDate;
    return !latest || entryDate > latest ? entryDate : latest;
  }, null as string | null);

  // Sort entries chronologically (newest first)
  const sortedMatchedGroups = [...matchedGroups].sort((a, b) => {
    const dateA = a.triageAction.actionDate;
    const dateB = b.triageAction.actionDate;
    return dateB.localeCompare(dateA);
  });

  const sortedUnmatched = [...unmatchedEntries].sort((a, b) => {
    return b.actionDate.localeCompare(a.actionDate);
  });

  return (
    <>
      {/* Strategy Summary Row */}
      <tr
        className={cn(
          "border-b bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer",
          isExpanded && "bg-slate-100"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-slate-500 transition-transform shrink-0",
                isExpanded && "rotate-180"
              )}
            />
            {strategyId ? (
              <Link
                href={`/strategies/${strategyId}`}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
              >
                {strategyKey || "Unnamed Strategy"}
              </Link>
            ) : (
              <span className="font-semibold text-slate-900">
                {strategyKey || "Unlinked"}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center text-xs text-slate-600">
          {latestDate ? formatDateShort(latestDate) : "—"}
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex flex-col gap-1 items-center">
            <span className="text-xs text-slate-600">
              {totalRecords} record{totalRecords !== 1 ? "s" : ""}
            </span>
            {matchedCount > 0 && (
              <span className="text-[10px] text-emerald-600">
                {matchedCount} matched
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex flex-col gap-1 items-center">
            {unmatchedTrades > 0 && (
              <span className="text-xs text-amber-600 font-medium">
                {unmatchedTrades} unmatched
              </span>
            )}
            {unmatchedActions > 0 && (
              <span className="text-xs text-slate-600 font-medium">
                {unmatchedActions} actions
              </span>
            )}
            {unmatchedTrades === 0 && unmatchedActions === 0 && (
              <span className="text-xs text-slate-400">All matched</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
        <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
      </tr>

      {/* Expanded Records */}
      {isExpanded && (
        <>
          {/* Matched Groups */}
          {sortedMatchedGroups.map((group) => (
            <BlotterMatchedGroup
              key={group.triageAction.id}
              triageAction={group.triageAction}
              linkedTrades={group.linkedTrades}
            />
          ))}

          {/* Unmatched Entries */}
          {sortedUnmatched.map((entry) => (
            <BlotterRecordRow key={entry.id} entry={entry} />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Organizes entries into matched groups and unmatched entries
 */
function organizeEntries(entries: BlotterEntry[]): {
  matchedGroups: MatchedGroup[];
  unmatchedEntries: BlotterEntry[];
} {
  const matchedGroups: MatchedGroup[] = [];
  const processedIds = new Set<string>();
  const unmatchedEntries: BlotterEntry[] = [];

  // First pass: Find all triage actions that have linked trades
  for (const entry of entries) {
    if (processedIds.has(entry.id)) continue;

    // Triage action with linked trades
    if (
      entry.source === "triage_action" &&
      (entry.linkedBlotterActionId || entry.linkedTradeBlotterIds?.length)
    ) {
      const linkedTradeIds = entry.linkedTradeBlotterIds || [];
      if (entry.linkedBlotterActionId) {
        linkedTradeIds.push(entry.linkedBlotterActionId);
      }

      const linkedTrades = entries.filter(
        (e) =>
          e.source === "trade_ingestion" &&
          (linkedTradeIds.includes(e.id) || e.linkedBlotterActionId === entry.id)
      );

      if (linkedTrades.length > 0) {
        matchedGroups.push({
          triageAction: entry,
          linkedTrades,
        });
        processedIds.add(entry.id);
        linkedTrades.forEach((t) => processedIds.add(t.id));
      }
    }
  }

  // Second pass: Find trade entries that link to triage actions (in case triage action wasn't in entries)
  for (const entry of entries) {
    if (processedIds.has(entry.id)) continue;

    if (
      entry.source === "trade_ingestion" &&
      entry.linkedBlotterActionId
    ) {
      const triageAction = entries.find(
        (e) => e.id === entry.linkedBlotterActionId
      );

      if (triageAction && !processedIds.has(triageAction.id)) {
        // Find all other trades linked to this same triage action
        const allLinkedTrades = entries.filter(
          (e) =>
            e.source === "trade_ingestion" &&
            e.linkedBlotterActionId === triageAction.id
        );

        matchedGroups.push({
          triageAction,
          linkedTrades: allLinkedTrades,
        });
        processedIds.add(triageAction.id);
        allLinkedTrades.forEach((t) => processedIds.add(t.id));
      }
    }
  }

  // Third pass: Collect all unmatched entries
  for (const entry of entries) {
    if (!processedIds.has(entry.id)) {
      unmatchedEntries.push(entry);
    }
  }

  return { matchedGroups, unmatchedEntries };
}
