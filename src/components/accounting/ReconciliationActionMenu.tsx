"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal, Check, Flag, RotateCcw, CheckCircle } from "lucide-react";
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

interface ReconciliationActionMenuProps {
  position: PositionReconciliation;
  onAction: () => void;
}

type ActionType = "accept" | "flag" | "resolve" | "reopen";

export function ReconciliationActionMenu({
  position,
  onAction,
}: ReconciliationActionMenuProps) {
  const [dialogAction, setDialogAction] = useState<ActionType | null>(null);
  const [nature, setNature] = useState<DiscrepancyNature | "">("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStatus = position.resolution?.status ?? "unresolved";

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
            owner: position.owner,
            ticker: position.ticker,
            action: dialogAction,
            nature: nature || undefined,
            notes: notes || undefined,
            discrepancyType: position.status,
            qtyDelta: position.qtyDelta,
            mvDelta: position.mvDelta ?? position.snapshotMv ?? position.eventSourcedMv,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        console.error("Resolution failed:", err);
        return;
      }

      onAction();
    } finally {
      setIsSubmitting(false);
      setDialogAction(null);
      setNature("");
      setNotes("");
    }
  }

  function openDialog(action: ActionType) {
    // Pre-fill nature from existing resolution if available
    if (position.resolution?.nature) {
      setNature(position.resolution.nature);
    }
    setDialogAction(action);
  }

  // Don't show menu for matched positions
  if (position.status === "match") return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-md p-1 hover:bg-muted transition-colors">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {(currentStatus === "unresolved" || currentStatus === "flagged") && (
            <DropdownMenuItem onClick={() => openDialog("accept")}>
              <Check className="mr-2 h-3.5 w-3.5 text-emerald-600" />
              Accept
            </DropdownMenuItem>
          )}
          {(currentStatus === "unresolved" || currentStatus === "accepted") && (
            <DropdownMenuItem onClick={() => openDialog("flag")}>
              <Flag className="mr-2 h-3.5 w-3.5 text-red-500" />
              Flag issue
            </DropdownMenuItem>
          )}
          {(currentStatus === "flagged" || currentStatus === "accepted") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openDialog("resolve")}>
                <CheckCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                Mark resolved
              </DropdownMenuItem>
            </>
          )}
          {(currentStatus === "accepted" || currentStatus === "flagged" || currentStatus === "resolved") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openDialog("reopen")}>
                <RotateCcw className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                Reopen
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
              {dialogAction === "accept" && "Accept discrepancy"}
              {dialogAction === "flag" && "Flag issue"}
              {dialogAction === "resolve" && "Mark as resolved"}
              {dialogAction === "reopen" && "Reopen discrepancy"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {position.ticker} ({position.owner}) — {position.status.replace("_", " ")}
                </p>

                {dialogAction !== "reopen" && (
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
                )}

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Notes{dialogAction === "flag" ? " (recommended)" : " (optional)"}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      dialogAction === "accept"
                        ? "Why is this acceptable?"
                        : dialogAction === "flag"
                          ? "What needs to be fixed?"
                          : dialogAction === "resolve"
                            ? "How was this resolved?"
                            : "Why are you reopening this?"
                    }
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
