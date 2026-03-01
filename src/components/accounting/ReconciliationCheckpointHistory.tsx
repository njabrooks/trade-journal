"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import type { CheckpointSummary } from "@/db/queries/reconciliation";

interface ReconciliationCheckpointHistoryProps {
  refreshKey?: number;
}

export function ReconciliationCheckpointHistory({
  refreshKey,
}: ReconciliationCheckpointHistoryProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[] | null>(
    null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function fetchCheckpoints() {
      try {
        const res = await fetch(
          "/api/dashboard/accounting/reconciliation/checkpoint"
        );
        if (!res.ok) return;
        const data = await res.json();
        setCheckpoints(data);
      } catch {
        // silent
      }
    }
    fetchCheckpoints();
  }, [isOpen, refreshKey]);

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <History className="h-4 w-4 text-muted-foreground" />
        Checkpoint History
        {checkpoints && isOpen && (
          <span className="text-xs font-normal text-muted-foreground">
            ({checkpoints.length} checkpoint
            {checkpoints.length !== 1 ? "s" : ""})
          </span>
        )}
      </button>

      {isOpen && (
        <div className="border-t px-5 pb-4">
          {checkpoints === null ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Loading...
            </p>
          ) : checkpoints.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No checkpoints yet. Mark the current reconciliation as reconciled
              to create the first checkpoint.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium" />
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Snap NAV
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      ES NAV
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Delta
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Matched
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Discrepancies
                    </th>
                    <th className="pb-2 pr-4 font-medium">Notes</th>
                    <th className="pb-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((cp) => (
                    <CheckpointRow
                      key={cp.id}
                      checkpoint={cp}
                      isExpanded={expandedId === cp.id}
                      onToggle={() =>
                        setExpandedId(expandedId === cp.id ? null : cp.id)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CheckpointRow({
  checkpoint: cp,
  isExpanded,
  onToggle,
}: {
  checkpoint: CheckpointSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const createdDate = new Date(cp.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <tr
        className="cursor-pointer border-b transition-colors hover:bg-muted/30 last:border-b-0"
        onClick={onToggle}
      >
        <td className="py-2.5 pr-2">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="py-2.5 pr-4 font-medium">{cp.comparisonDate}</td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          {formatCurrency(cp.snapshotNav)}
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          {formatCurrency(cp.eventSourcedNav)}
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          <span
            className={
              Math.abs(cp.navDeltaPct) < 1
                ? "text-emerald-600"
                : Math.abs(cp.navDeltaPct) < 5
                  ? "text-amber-600"
                  : "text-red-500"
            }
          >
            {formatPercent(cp.navDeltaPct)}
          </span>
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          {cp.matchedPositions}/{cp.totalPositions}
        </td>
        <td className="py-2.5 pr-4 text-right">
          <span className="tabular-nums">{cp.discrepancyCount}</span>
          <span className="ml-1 text-muted-foreground">
            ({cp.acceptedCount}a {cp.resolvedCount}r)
          </span>
        </td>
        <td className="max-w-[200px] truncate py-2.5 pr-4 text-muted-foreground">
          {cp.notes ?? "—"}
        </td>
        <td className="py-2.5 text-muted-foreground">{createdDate}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="border-b bg-muted/20 px-6 py-3">
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Snapshot NAV:</span>{" "}
                <span className="font-medium">
                  {formatCurrency(cp.snapshotNav)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Event-Sourced NAV:
                </span>{" "}
                <span className="font-medium">
                  {formatCurrency(cp.eventSourcedNav)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">NAV Delta:</span>{" "}
                <span className="font-medium">
                  {formatCurrency(cp.navDelta)} (
                  {formatPercent(cp.navDeltaPct)})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Disposition:</span>{" "}
                <span className="font-medium">
                  {cp.acceptedCount} accepted, {cp.flaggedCount} flagged,{" "}
                  {cp.resolvedCount} resolved, {cp.unresolvedCount} unresolved
                </span>
              </div>
            </div>
            {cp.notes && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Notes:</span>{" "}
                {cp.notes}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
