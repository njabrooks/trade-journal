"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ActionType = "TRADE" | "MONITOR" | "DISMISS" | "UPDATE";

// Mapping of trigger types to available actions (same as TriageActionsTable)
// Note: TRADE actions are handled via checkbox selection in positions table or quantity change triggers
const TRIGGER_ACTIONS: Record<string, ActionType[]> = {
  "ASSIGNMENT_RISK≤14_DTE": ["MONITOR", "DISMISS"],
  "ASSIGNMENT_RISK≤30_DTE": ["MONITOR", "DISMISS"],
  "ITM_SHORT": ["MONITOR", "DISMISS"],
  "ITM_LONG": ["MONITOR", "DISMISS"],
  "SIGMA_0.5_SHORT": ["MONITOR", "DISMISS"],
  "SIGMA_0.5_LONG": ["MONITOR", "DISMISS"],
  "SIGMA_1.0": ["MONITOR", "DISMISS"],
  "REVIEW_DTE": ["MONITOR", "DISMISS"],
  "CONFIRM_STRATEGY": ["UPDATE"],  // Confirmation: label, type, direction, optional thesis linkage
  "REVIEW_SIZE": ["MONITOR", "DISMISS"],
  "REVIEW_COMPLEXITY": [],
  "QUANTITY_CHANGE": ["TRADE"], // TRADE action for quantity change triggers (creates Trade Actions)
  "TRADE_INGESTION": ["TRADE"], // TRADE action for newly ingested trades
  // Note: STATE_CODE_CHANGE removed - replaced by strategy signals
};

// Helper to check if this is a trade metadata capture trigger
function isTradeMetadataTrigger(recommendedAction: string | null): boolean {
  return recommendedAction === "QUANTITY_CHANGE" || recommendedAction === "TRADE_INGESTION";
}

const ACTION_LABELS: Record<ActionType, string> = {
  TRADE: "Trade",
  MONITOR: "Monitor",
  DISMISS: "Dismiss",
  UPDATE: "Update",
};

interface TriageBulkActionsProps {
  selectedIds: string[];
  records: Array<{
    id: string;
    recommendedAction: string | null;
    severity: string | null;
  }>;
  onClearSelection: () => void;
}

export function TriageBulkActions({
  selectedIds,
  records,
  onClearSelection,
}: TriageBulkActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [notes, setNotes] = useState("");
  const [monitorDays, setMonitorDays] = useState(7);
  const [tradeReason, setTradeReason] = useState("");
  const [tradeStage, setTradeStage] = useState("");

  // Get selected records
  const selectedRecords = records.filter((r) => selectedIds.includes(r.id));

  // Validate all selected records have the same trigger type
  const triggerTypes = new Set(
    selectedRecords.map((r) => r.recommendedAction).filter(Boolean)
  );
  const commonTrigger = triggerTypes.size === 1 ? Array.from(triggerTypes)[0] : null;
  const hasMixedTriggers = triggerTypes.size > 1;

  // Get available actions for the common trigger
  const availableActions = commonTrigger
    ? TRIGGER_ACTIONS[commonTrigger] || []
    : [];

  const handleBulkAction = async (actionType: ActionType) => {
    if (!commonTrigger) {
      setError("All selected records must have the same trigger type");
      return;
    }

    // Validate required fields for trade metadata triggers (QUANTITY_CHANGE, TRADE_INGESTION)
    if (actionType === "TRADE" && isTradeMetadataTrigger(commonTrigger)) {
      if (!tradeReason.trim() || !tradeStage) {
        setError("Trade reason and trade stage are required for trade actions");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/triage/action/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triageIds: selectedIds,
          actionType,
          notes: notes.trim() || undefined,
          monitorDays: actionType === "MONITOR" ? monitorDays : undefined,
          tradeReason: actionType === "TRADE" && isTradeMetadataTrigger(commonTrigger) ? tradeReason.trim() : undefined,
          tradeStage: actionType === "TRADE" && isTradeMetadataTrigger(commonTrigger) ? tradeStage : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to apply bulk action");
      }

      // Clear selection and refresh
      onClearSelection();
      setSelectedAction(null);
      setNotes("");
      setMonitorDays(7);
      setTradeReason("");
      setTradeStage("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply bulk action");
      setLoading(false);
    }
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 border-b bg-blue-50 px-6 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-900">
            {selectedIds.length} record{selectedIds.length !== 1 ? "s" : ""} selected
          </span>
          {hasMixedTriggers && (
            <span className="text-xs text-amber-600 font-medium">
              ⚠️ Mixed trigger types - select records with the same trigger type
            </span>
          )}
          {commonTrigger && !hasMixedTriggers && (
            <span className="text-xs text-slate-600">
              Trigger: {commonTrigger}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!selectedAction ? (
            <>
              {availableActions.length > 0 ? (
                <div className="flex items-center gap-2">
                  {availableActions.map((action) => (
                    <Button
                      key={action}
                      onClick={() => setSelectedAction(action)}
                      variant="outline"
                      size="sm"
                      disabled={loading}
                    >
                      {ACTION_LABELS[action]}
                    </Button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-slate-500">
                  No bulk actions available for this trigger type
                </span>
              )}
              <Button
                onClick={onClearSelection}
                variant="ghost"
                size="sm"
                disabled={loading}
              >
                Clear
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedAction === "MONITOR" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600">Days:</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={monitorDays}
                    onChange={(e) => setMonitorDays(parseInt(e.target.value) || 7)}
                    className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
                    disabled={loading}
                  />
                </div>
              )}
              {selectedAction === "TRADE" && isTradeMetadataTrigger(commonTrigger) && (
                <>
                  <input
                    type="text"
                    placeholder="Trade reason (required)"
                    value={tradeReason}
                    onChange={(e) => setTradeReason(e.target.value)}
                    className="w-48 px-2 py-1 text-xs border border-slate-300 rounded"
                    disabled={loading}
                    required
                  />
                  <Select
                    value={tradeStage || undefined}
                    onValueChange={setTradeStage}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue placeholder="Stage (required)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="close">Close</SelectItem>
                      <SelectItem value="hedge">Hedge</SelectItem>
                      <SelectItem value="roll">Roll</SelectItem>
                      <SelectItem value="reduce">Reduce</SelectItem>
                      <SelectItem value="add">Add</SelectItem>
                      <SelectItem value="assignment">Assignment</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              <input
                type="text"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-48 px-2 py-1 text-xs border border-slate-300 rounded"
                disabled={loading}
              />
              <Button
                onClick={() => handleBulkAction(selectedAction)}
                size="sm"
                disabled={loading}
              >
                {loading ? "Applying..." : `Apply ${ACTION_LABELS[selectedAction]}`}
              </Button>
              <Button
                onClick={() => {
                  setSelectedAction(null);
                  setNotes("");
                  setMonitorDays(7);
                  setTradeReason("");
                  setTradeStage("");
                }}
                variant="ghost"
                size="sm"
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-600">{error}</div>
      )}
    </div>
  );
}

