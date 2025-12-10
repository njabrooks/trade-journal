"use client";

import { useState, useEffect } from "react";
import { TriageActionButtons } from "./TriageActionButtons";
import { cn } from "@/lib/utils";

type ActionType = "TRADE" | "MONITOR" | "DISMISS" | "UPDATE";

// Mapping of trigger types to available actions
const TRIGGER_ACTIONS: Record<string, ActionType[]> = {
  // Position-level triggers
  "ASSIGNMENT_RISK≤14_DTE": ["TRADE", "MONITOR", "DISMISS"],
  "ASSIGNMENT_RISK≤30_DTE": ["TRADE", "MONITOR", "DISMISS"],
  "ITM_SHORT": ["TRADE", "MONITOR", "DISMISS"],
  "ITM_LONG": ["TRADE", "MONITOR", "DISMISS"],
  "SIGMA_0.5_SHORT": ["TRADE", "MONITOR", "DISMISS"],
  "SIGMA_0.5_LONG": ["TRADE", "MONITOR", "DISMISS"],
  "SIGMA_1.0": ["TRADE", "MONITOR", "DISMISS"],
  "REVIEW_DTE": ["TRADE", "MONITOR", "DISMISS"],
  
  // Strategy-level triggers
  "CONFIRM_STRATEGIES": ["UPDATE"],
  "PROVIDE_STRATEGY_METADATA": ["UPDATE"],
  "REVIEW_SIZE": ["TRADE", "MONITOR", "DISMISS"],
  "REVIEW_COMPLEXITY": [], // No actions available
  "STATE_CODE_CHANGE": ["TRADE", "MONITOR", "DISMISS"],
  "QUANTITY_CHANGE": ["UPDATE"], // Only UPDATE action for quantity change triggers
};

// Helper to determine available actions for a trigger
function getAvailableActions(recommendedAction: string | null, severity: string | null): ActionType[] {
  if (!recommendedAction) {
    // Default: all actions available
    return ["TRADE", "MONITOR", "DISMISS", "UPDATE"];
  }
  
  const actions = TRIGGER_ACTIONS[recommendedAction] || ["TRADE", "MONITOR", "DISMISS", "UPDATE"];
  
  // Special case: DISMISS not available if severity is 'info'
  if (severity === "info" && actions.includes("DISMISS")) {
    return actions.filter((a) => a !== "DISMISS");
  }
  
  return actions;
}

interface TriageActionsTableProps {
  triageId: string;
  contextLevel: string;
  recommendedAction: string | null;
  strategyId: string | null;
  positionId?: string | null;
  severity?: string | null;
  onActionComplete?: () => void;
}

const ACTION_LABELS: Record<ActionType, string> = {
  TRADE: "Trade",
  MONITOR: "Monitor",
  DISMISS: "Dismiss",
  UPDATE: "Update",
};

const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  TRADE: "Record a trade decision or execute a trade",
  MONITOR: "Set a monitoring period to review later",
  DISMISS: "Dismiss this flag (can be re-triggered)",
  UPDATE: "Update strategy metadata or record quantity change",
};

export function TriageActionsTable({
  triageId,
  contextLevel,
  recommendedAction,
  strategyId,
  positionId,
  severity,
  onActionComplete,
}: TriageActionsTableProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const availableActions = getAvailableActions(recommendedAction, severity ?? null);

  // Auto-select if only one action is available
  useEffect(() => {
    if (availableActions.length === 1 && !selectedAction) {
      setSelectedAction(availableActions[0]);
    }
  }, [availableActions, selectedAction]);

  if (availableActions.length === 0) {
    return (
      <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
        <div className="px-4 py-6 text-center">
          <div className="text-sm text-slate-500">No actions available for this trigger type.</div>
        </div>
      </div>
    );
  }

  // If action is selected, show the form
  if (selectedAction) {
    return (
      <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
        <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {ACTION_LABELS[selectedAction]} Action
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {ACTION_DESCRIPTIONS[selectedAction]}
              </p>
            </div>
            <button
              onClick={() => setSelectedAction(null)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
            >
              ← Back to actions
            </button>
          </div>
        </div>
        <div className="p-4 bg-white">
          <TriageActionButtons
            triageId={triageId}
            contextLevel={contextLevel}
            recommendedAction={recommendedAction}
            strategyId={strategyId}
            positionId={positionId}
            severity={severity}
            onActionComplete={() => {
              setSelectedAction(null);
              onActionComplete?.();
            }}
            initialAction={selectedAction}
          />
        </div>
      </div>
    );
  }

  // Show action selection
  return (
    <div className="overflow-hidden border border-slate-300 rounded-lg bg-white shadow-sm">
      <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Select Action</h3>
        <p className="text-xs text-slate-500">
          Choose an action to take on this triage flag
        </p>
      </div>
      <div className="p-4 bg-white">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {availableActions.map((action) => (
            <button
              key={action}
              onClick={() => setSelectedAction(action)}
              className={cn(
                "p-4 rounded-lg border-2 border-slate-200 bg-white text-left transition-all",
                "hover:border-blue-400 hover:bg-blue-50 hover:shadow-sm",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
                "active:scale-[0.98]"
              )}
            >
              <div className="font-semibold text-slate-900 mb-1.5 text-sm">
                {ACTION_LABELS[action]}
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">
                {ACTION_DESCRIPTIONS[action]}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

