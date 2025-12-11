"use client";

import { useMemo } from "react";
import { formatDateShort } from "@/lib/formatters";
import type { BlotterEntry } from "@/db/queries/blotter";
import { BlotterMatchedGroup } from "./BlotterMatchedGroup";
import { BlotterRecordRow } from "./BlotterRecordRow";

interface BlotterDateGroupProps {
  date: string;
  entries: BlotterEntry[];
  sort?: string;
  direction?: "asc" | "desc";
}

interface MatchedGroup {
  triageAction: BlotterEntry;
  linkedTrades: BlotterEntry[];
}

export function BlotterDateGroup({ date, entries, sort, direction }: BlotterDateGroupProps) {
  // Group entries into matched groups and unmatched records
  const { matchedGroups, unmatchedEntries } = organizeEntries(entries);

  // Sort matched groups based on sort parameter
  const sortedMatchedGroups = useMemo(() => {
    const sorted = [...matchedGroups];
    if (sort === "createdAt") {
      sorted.sort((a, b) => {
        const dateA = a.triageAction.createdAt || "";
        const dateB = b.triageAction.createdAt || "";
        return direction === "asc" 
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      });
    } else if (sort === "strategyKey") {
      sorted.sort((a, b) => {
        const keyA = a.triageAction.strategyKey || "";
        const keyB = b.triageAction.strategyKey || "";
        return direction === "asc"
          ? keyA.localeCompare(keyB)
          : keyB.localeCompare(keyA);
      });
    } else if (sort === "actionClass") {
      sorted.sort((a, b) => {
        const classA = a.triageAction.actionClass || "";
        const classB = b.triageAction.actionClass || "";
        return direction === "asc"
          ? classA.localeCompare(classB)
          : classB.localeCompare(classA);
      });
    } else if (sort === "premiumChange") {
      sorted.sort((a, b) => {
        const totalA = a.linkedTrades.reduce((sum, t) => sum + (t.premiumChange || 0), 0);
        const totalB = b.linkedTrades.reduce((sum, t) => sum + (t.premiumChange || 0), 0);
        return direction === "asc" ? totalA - totalB : totalB - totalA;
      });
    } else {
      // Default: sort by createdAt desc
      sorted.sort((a, b) => {
        const dateA = a.triageAction.createdAt || "";
        const dateB = b.triageAction.createdAt || "";
        return dateB.localeCompare(dateA);
      });
    }
    return sorted;
  }, [matchedGroups, sort, direction]);

  // Sort unmatched entries based on sort parameter
  const sortedUnmatched = useMemo(() => {
    const sorted = [...unmatchedEntries];
    if (sort === "createdAt") {
      sorted.sort((a, b) => {
        const dateA = a.createdAt || "";
        const dateB = b.createdAt || "";
        return direction === "asc"
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      });
    } else if (sort === "strategyKey") {
      sorted.sort((a, b) => {
        const keyA = a.strategyKey || "";
        const keyB = b.strategyKey || "";
        return direction === "asc"
          ? keyA.localeCompare(keyB)
          : keyB.localeCompare(keyA);
      });
    } else if (sort === "actionClass") {
      sorted.sort((a, b) => {
        const classA = a.actionClass || "";
        const classB = b.actionClass || "";
        return direction === "asc"
          ? classA.localeCompare(classB)
          : classB.localeCompare(classA);
      });
    } else if (sort === "premiumChange") {
      sorted.sort((a, b) => {
        const changeA = a.premiumChange || 0;
        const changeB = b.premiumChange || 0;
        return direction === "asc" ? changeA - changeB : changeB - changeA;
      });
    } else {
      // Default: sort by createdAt desc
      sorted.sort((a, b) => {
        const dateA = a.createdAt || "";
        const dateB = b.createdAt || "";
        return dateB.localeCompare(dateA);
      });
    }
    return sorted;
  }, [unmatchedEntries, sort, direction]);

  return (
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

    if (entry.source === "trade_ingestion" && entry.linkedBlotterActionId) {
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
