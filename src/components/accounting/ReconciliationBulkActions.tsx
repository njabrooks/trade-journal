"use client";

import { useState } from "react";
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
import { Check, Flag, X } from "lucide-react";
import type { PositionReconciliation } from "@/db/queries/reconciliation";
import type { DiscrepancyNature } from "@/db/schema";

const NATURE_OPTIONS: { value: DiscrepancyNature; label: string }[] = [
  { value: "mapping_error", label: "Mapping error" },
  { value: "missing_coverage", label: "Missing coverage" },
  { value: "expected_gap", label: "Expected gap" },
  { value: "dust", label: "Dust / negligible" },
  { value: "price_drift", label: "Price drift" },
  { value: "qty_drift", label: "Quantity drift" },
  { value: "other", label: "Other" },
];

type BulkAction = "accept" | "flag";

interface ReconciliationBulkActionsProps {
  selectedPositions: PositionReconciliation[];
  onClearSelection: () => void;
  onAction: () => void;
}

export function ReconciliationBulkActions({
  selectedPositions,
  onClearSelection,
  onAction,
}: ReconciliationBulkActionsProps) {
  const [dialogAction, setDialogAction] = useState<BulkAction | null>(null);
  const [nature, setNature] = useState<DiscrepancyNature | "">("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (selectedPositions.length === 0) return null;

  async function handleSubmit() {
    if (!dialogAction) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(
        "/api/dashboard/accounting/reconciliation/resolution",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: dialogAction,
            nature: nature || undefined,
            notes: notes || undefined,
            items: selectedPositions.map((p) => ({
              owner: p.owner,
              ticker: p.ticker,
              discrepancyType: p.status,
              qtyDelta: p.qtyDelta,
              mvDelta: p.mvDelta ?? p.snapshotMv ?? p.eventSourcedMv,
            })),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        console.error("Bulk resolution failed:", err);
        return;
      }

      onClearSelection();
      onAction();
    } finally {
      setIsSubmitting(false);
      setDialogAction(null);
      setNature("");
      setNotes("");
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border bg-muted/80 backdrop-blur-sm px-4 py-2">
        <span className="text-sm font-medium">
          {selectedPositions.length} selected
        </span>
        <button
          onClick={() => setDialogAction("accept")}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          Accept selected
        </button>
        <button
          onClick={() => setDialogAction("flag")}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
        >
          <Flag className="h-3.5 w-3.5" />
          Flag selected
        </button>
        <button
          onClick={onClearSelection}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <AlertDialog
        open={dialogAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogAction(null);
            setNature("");
            setNotes("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogAction === "accept" ? "Accept" : "Flag"}{" "}
              {selectedPositions.length} discrepancies
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Nature
                  </label>
                  <select
                    value={nature}
                    onChange={(e) => setNature(e.target.value as DiscrepancyNature)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">Select root cause...</option>
                    {NATURE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Notes{dialogAction === "flag" ? " (recommended)" : " (optional)"}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      dialogAction === "accept"
                        ? "Why are these acceptable?"
                        : "What needs to be fixed?"
                    }
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Affected items
                  </label>
                  <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/50 px-3 py-2 text-xs space-y-0.5">
                    {selectedPositions.map((p) => (
                      <div key={`${p.owner}::${p.ticker}`} className="text-muted-foreground">
                        {p.ticker} ({p.owner})
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : `${dialogAction === "accept" ? "Accept" : "Flag"} ${selectedPositions.length} items`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
