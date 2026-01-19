"use client";

import { useState, useEffect } from "react";
import { TriageActionButtons } from "./TriageActionButtons";
import { cn } from "@/lib/utils";

type ActionType = "TRADE" | "MONITOR" | "DISMISS" | "UPDATE";

// Mapping of trigger types to available actions
// Note: TRADE actions are handled via checkbox selection in positions table or quantity change triggers
const TRIGGER_ACTIONS: Record<string, ActionType[]> = {
  // Position-level triggers
  "ASSIGNMENT_RISK≤14_DTE": ["MONITOR", "DISMISS"],
  "ASSIGNMENT_RISK≤30_DTE": ["MONITOR", "DISMISS"],
  "ITM_SHORT": ["MONITOR", "DISMISS"],
  "ITM_LONG": ["MONITOR", "DISMISS"],
  "SIGMA_0.5_SHORT": ["MONITOR", "DISMISS"],
  "SIGMA_0.5_LONG": ["MONITOR", "DISMISS"],
  "SIGMA_1.0": ["MONITOR", "DISMISS"],
  "REVIEW_DTE": ["MONITOR", "DISMISS"],
  
  // Strategy-level triggers
  "CONFIRM_STRATEGY": ["UPDATE"],  // Confirmation: label, type, direction, optional thesis linkage
  "REVIEW_SIZE": ["MONITOR", "DISMISS"],
  "REVIEW_COMPLEXITY": [], // No actions available
  "QUANTITY_CHANGE": ["TRADE"], // TRADE action for quantity change triggers (creates Trade Actions)
  "TRADE_INGESTION": ["TRADE"], // TRADE action for newly ingested trades
  // Note: STATE_CODE_CHANGE removed - replaced by strategy signals
};

// Helper to determine available actions for a trigger
function getAvailableActions(recommendedAction: string | null, severity: string | null): ActionType[] {
  if (!recommendedAction) {
    // Default: monitor and dismiss available
    return ["MONITOR", "DISMISS"];
  }
  
  const actions = TRIGGER_ACTIONS[recommendedAction] || ["MONITOR", "DISMISS"];
  
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
  onTradeActionSelected?: (isSelected: boolean) => void;
  onPositionSelectionChange?: (selectedIds: Set<string>, handlers: {
    onPositionSelect: (positionId: string, selected: boolean) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
  }) => void;
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
  onTradeActionSelected,
  onPositionSelectionChange,
}: TriageActionsTableProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const availableActions = getAvailableActions(recommendedAction, severity ?? null);

  // Note: We intentionally don't auto-select even if only one action is available,
  // as this causes dialogs to open immediately on row expand (bad UX).

  if (availableActions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Actions
        </p>
        <div className="text-sm text-slate-500">No actions available for this trigger type.</div>
      </div>
    );
  }

  // If action is selected, show the form
  if (selectedAction) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            {ACTION_LABELS[selectedAction]} Action
          </p>
          <button
            onClick={() => setSelectedAction(null)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
          >
            ← Back
          </button>
        </div>
        <div>
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
            onTradeActionSelected={onTradeActionSelected}
            onPositionSelectionChangeLegacy={onPositionSelectionChange}
          />
        </div>
      </div>
    );
  }

  // Show action selection
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
        Actions
      </p>
      <div className="flex flex-wrap gap-2">
        {availableActions.map((action) => (
          <button
            key={action}
            onClick={() => setSelectedAction(action)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              "border border-slate-300 bg-white text-slate-700",
              "hover:bg-slate-50 hover:border-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            )}
          >
            {ACTION_LABELS[action]}
          </button>
        ))}
      </div>
    </div>
  );
}

