"use client";

import { useState } from "react";
import Link from "next/link";

interface TriageActionButtonsProps {
  triageId: string;
  contextLevel: string;
  recommendedAction: string | null;
  strategyId: string | null;
  positionId?: string | null;
  onActionComplete?: () => void;
}

export function TriageActionButtons({
  triageId,
  contextLevel,
  recommendedAction,
  strategyId,
  positionId,
  onActionComplete,
}: TriageActionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (actionType: string, notes?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/triage/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triageId,
          actionType,
          notes,
          strategyId,
          positionId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to record action");
      }

      if (onActionComplete) {
        onActionComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record action");
    } finally {
      setLoading(false);
    }
  };

  const getActionButtons = () => {
    const buttons: Array<{ label: string; action: string; variant: string }> = [];

    if (contextLevel === "position") {
      // Position-level actions
      if (recommendedAction?.includes("ROLL") || recommendedAction?.includes("CLOSE")) {
        buttons.push(
          { label: "Roll", action: "ROLL", variant: "default" },
          { label: "Close", action: "CLOSE", variant: "destructive" }
        );
      } else if (recommendedAction?.includes("ASSIGNMENT")) {
        buttons.push(
          { label: "Manage Assignment", action: "MANAGE_ASSIGNMENT", variant: "default" }
        );
      } else {
        buttons.push({ label: "Review", action: "REVIEW", variant: "default" });
      }
      buttons.push({ label: "Mark Reviewed", action: "MARK_REVIEWED", variant: "secondary" });
    } else if (contextLevel === "strategy") {
      // Strategy-level actions
      if (recommendedAction === "CONFIRM_STRATEGIES") {
        buttons.push({
          label: "Confirm Strategy",
          action: "CONFIRM_STRATEGIES",
          variant: "default",
        });
      } else if (recommendedAction === "PROVIDE_STRATEGY_METADATA") {
        buttons.push({
          label: "Complete Metadata",
          action: "PROVIDE_STRATEGY_METADATA",
          variant: "default",
        });
      } else if (recommendedAction === "REVIEW_STATE_CODE_CHANGE") {
        buttons.push({
          label: "Review State Code",
          action: "REVIEW_STATE_CODE",
          variant: "default",
        });
      } else if (recommendedAction === "REVIEW_SIZE") {
        buttons.push(
          { label: "Review Size", action: "REVIEW_SIZE", variant: "default" },
          { label: "Reduce Size", action: "REDUCE_SIZE", variant: "destructive" }
        );
      } else {
        buttons.push({ label: "Review", action: "REVIEW", variant: "default" });
      }
      buttons.push({ label: "Mark Reviewed", action: "MARK_REVIEWED", variant: "secondary" });
    } else {
      // Default actions
      buttons.push({ label: "Review", action: "REVIEW", variant: "default" });
      buttons.push({ label: "Mark Reviewed", action: "MARK_REVIEWED", variant: "secondary" });
    }

    return buttons;
  };

  const buttons = getActionButtons();

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {buttons.map((btn) => (
        <button
          key={btn.action}
          onClick={() => handleAction(btn.action)}
          disabled={loading}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            btn.variant === "destructive"
              ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
              : btn.variant === "secondary"
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          } disabled:opacity-50`}
        >
          {btn.label}
        </button>
      ))}
      {strategyId && (
        <Link
          href={`/strategies/${strategyId}`}
          className="ml-auto text-xs font-medium text-blue-600 hover:underline"
        >
          View Strategy →
        </Link>
      )}
      {error && (
        <span className="ml-2 text-xs text-rose-600">{error}</span>
      )}
    </div>
  );
}

