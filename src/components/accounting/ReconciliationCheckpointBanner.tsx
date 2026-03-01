"use client";

import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle, Bookmark } from "lucide-react";
import type {
  ReconciliationSummaryData,
  CheckpointSummary,
} from "@/db/queries/reconciliation";

interface ReconciliationCheckpointBannerProps {
  summary: ReconciliationSummaryData;
  lastCheckpoint: CheckpointSummary | null;
  onCheckpointCreated: () => void;
}

export function ReconciliationCheckpointBanner({
  summary,
  lastCheckpoint,
  onCheckpointCreated,
}: ReconciliationCheckpointBannerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const unresolvedCount = summary.unresolvedCount ?? 0;
  const flaggedCount = summary.flaggedCount ?? 0;
  const allTriaged = unresolvedCount === 0 && flaggedCount === 0;

  const isAlreadyCheckpointed =
    lastCheckpoint?.comparisonDate === summary.comparisonDate && allTriaged;

  async function handleCreateCheckpoint() {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        "/api/dashboard/accounting/reconciliation/checkpoint",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: notes || undefined }),
        }
      );
      if (!res.ok) throw new Error("Failed to create checkpoint");
      setShowDialog(false);
      setNotes("");
      onCheckpointCreated();
    } catch (err) {
      console.error("Failed to create checkpoint:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          {isAlreadyCheckpointed ? (
            <>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Reconciled
                </span>
                <span className="text-muted-foreground">
                  {" "}at {summary.comparisonDate}
                  {lastCheckpoint.notes && (
                    <span> — {lastCheckpoint.notes}</span>
                  )}
                </span>
              </span>
            </>
          ) : lastCheckpoint ? (
            <>
              <Bookmark className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Last reconciled:{" "}
                <span className="font-medium text-foreground">
                  {lastCheckpoint.comparisonDate}
                </span>
                {" — "}
                {lastCheckpoint.acceptedCount} accepted,{" "}
                {lastCheckpoint.unresolvedCount} unresolved
                {lastCheckpoint.comparisonDate !== summary.comparisonDate && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                    (comparison date has advanced to {summary.comparisonDate})
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <Bookmark className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                No reconciliation checkpoint yet
              </span>
            </>
          )}
        </div>

        <button
          onClick={() => setShowDialog(true)}
          disabled={!allTriaged || isAlreadyCheckpointed}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark Reconciled
        </button>
      </div>

      <AlertDialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDialog(false);
            setNotes("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Reconciliation Checkpoint</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This will record the current reconciliation state as a
                  milestone at{" "}
                  <span className="font-medium text-foreground">
                    {summary.comparisonDate}
                  </span>
                  .
                </p>

                <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">NAV Delta:</span>{" "}
                    <span className="font-medium">
                      {formatCurrency(summary.navDelta)} (
                      {formatPercent(summary.navDeltaPct)})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Positions:</span>{" "}
                    <span className="font-medium">
                      {summary.matchedPositions}/{summary.totalPositions}{" "}
                      matched
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Accepted:</span>{" "}
                    <span className="font-medium">
                      {summary.acceptedCount ?? 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Resolved:</span>{" "}
                    <span className="font-medium">
                      {summary.resolvedCount ?? 0}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Notes{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes about this reconciliation..."
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateCheckpoint}
              disabled={isSubmitting}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isSubmitting ? "Creating..." : "Mark as Reconciled"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
