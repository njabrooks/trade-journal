"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface TriageActionButtonsProps {
  triageId: string;
  contextLevel: string;
  recommendedAction: string | null;
  strategyId: string | null;
  positionId?: string | null;
  severity?: string | null;
  onActionComplete?: () => void;
}

type ActionType = "TRADE" | "MONITOR" | "DISMISS" | "UPDATE";

// Mapping of trigger types to available actions
const TRIGGER_ACTIONS: Record<string, ActionType[]> = {
  // Position-level triggers
  REVIEW_DTE: ["TRADE", "MONITOR", "DISMISS"],
  WATCH_CLOSELY: ["TRADE", "MONITOR", "DISMISS"],
  MONITOR: ["TRADE", "MONITOR", "DISMISS"],
  CLOSE_OR_ROLL: ["TRADE", "MONITOR", "DISMISS"],
  
  // Strategy-level triggers
  CONFIRM_STRATEGIES: ["UPDATE"],
  PROVIDE_STRATEGY_METADATA: ["UPDATE"],
  REVIEW_SIZE: ["TRADE", "MONITOR", "DISMISS"],
  REVIEW_COMPLEXITY: [], // No actions available
  STATE_CODE_CHANGE: ["TRADE", "MONITOR", "DISMISS"],
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

export function TriageActionButtons({
  triageId,
  contextLevel,
  recommendedAction,
  strategyId,
  positionId,
  severity,
  onActionComplete,
}: TriageActionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [notes, setNotes] = useState("");
  const [monitorDays, setMonitorDays] = useState(7);
  
  // Strategy confirmation form state
  const [strategyData, setStrategyData] = useState<any>(null);
  const [strategyTypes, setStrategyTypes] = useState<string[]>([]);
  const [strategyFormData, setStrategyFormData] = useState({
    strategyKey: "",
    label: "",
    strategyType: "",
    thesis: "",
    profitRules: "",
    defenseRules: "",
    timeRules: "",
  });
  const [loadingStrategy, setLoadingStrategy] = useState(false);

  const availableActions = getAvailableActions(recommendedAction, severity);

  // Load strategy data and types when UPDATE action is selected for CONFIRM_STRATEGIES or PROVIDE_STRATEGY_METADATA
  useEffect(() => {
    if (
      selectedAction === "UPDATE" &&
      (recommendedAction === "CONFIRM_STRATEGIES" || recommendedAction === "PROVIDE_STRATEGY_METADATA") &&
      strategyId &&
      !strategyData
    ) {
      loadStrategyData();
      loadStrategyTypes();
    }
  }, [selectedAction, recommendedAction, strategyId]);

  const loadStrategyData = async () => {
    if (!strategyId) return;
    setLoadingStrategy(true);
    try {
      const response = await fetch(`/api/strategies?id=${strategyId}`);
      if (response.ok) {
        const data = await response.json();
        setStrategyData(data);
        setStrategyFormData({
          strategyKey: data.strategyKey || "",
          label: data.autoDerivedLabel || data.strategyKey || "",
          strategyType: data.strategyType || "",
          thesis: data.thesis || "",
          profitRules: data.profitRules || "",
          defenseRules: data.defenseRules || "",
          timeRules: data.timeRules || "",
        });
      }
    } catch (err) {
      setError("Failed to load strategy data");
    } finally {
      setLoadingStrategy(false);
    }
  };

  const loadStrategyTypes = async () => {
    try {
      const response = await fetch("/api/strategies?strategyTypes=true");
      if (response.ok) {
        const types = await response.json();
        setStrategyTypes(types);
      }
    } catch (err) {
      console.error("Failed to load strategy types:", err);
    }
  };

  const handleAction = async (actionType: ActionType) => {
    if (!availableActions.includes(actionType)) return;
    setSelectedAction(actionType);
    setShowActionForm(true);
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;

    setLoading(true);
    setError(null);

    try {
      let body: any = {
        triageId,
        actionType: selectedAction,
        strategyId,
        positionId,
      };

      // Handle strategy confirmation
      if (selectedAction === "UPDATE" && recommendedAction === "CONFIRM_STRATEGIES") {
        if (!strategyFormData.strategyType) {
          setError("Strategy type is required");
          setLoading(false);
          return;
        }

        // Update strategy via API
        const strategyResponse = await fetch("/api/strategies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: strategyId,
            confirm: true,
            strategyKey: strategyFormData.strategyKey,
            label: strategyFormData.label,
            strategyType: strategyFormData.strategyType,
            thesis: strategyFormData.thesis || null,
            profitRules: strategyFormData.profitRules || null,
            defenseRules: strategyFormData.defenseRules || null,
            timeRules: strategyFormData.timeRules || null,
          }),
        });

        if (!strategyResponse.ok) {
          const data = await strategyResponse.json();
          throw new Error(data.error || "Failed to confirm strategy");
        }

        // Then record the triage action
        body.notes = `Strategy confirmed: ${strategyFormData.strategyType}`;
      } else if (selectedAction === "UPDATE" && recommendedAction === "PROVIDE_STRATEGY_METADATA") {
        if (!strategyFormData.strategyType) {
          setError("Strategy type is required");
          setLoading(false);
          return;
        }

        // Update strategy metadata via API (no confirm flag, just update fields)
        const strategyResponse = await fetch("/api/strategies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: strategyId,
            strategyType: strategyFormData.strategyType,
            thesis: strategyFormData.thesis || null,
            profitRules: strategyFormData.profitRules || null,
            defenseRules: strategyFormData.defenseRules || null,
            timeRules: strategyFormData.timeRules || null,
          }),
        });

        if (!strategyResponse.ok) {
          const data = await strategyResponse.json();
          throw new Error(data.error || "Failed to update strategy metadata");
        }

        // Then record the triage action
        body.notes = `Strategy metadata updated: ${strategyFormData.strategyType}`;
      } else {
        // Standard action handling
        if (notes.trim()) {
          body.notes = notes.trim();
        }

        if (selectedAction === "MONITOR") {
          body.monitorDays = monitorDays;
        }
      }

      const response = await fetch("/api/triage/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to record action");
      }

      // Reset form
      setShowActionForm(false);
      setSelectedAction(null);
      setNotes("");
      setMonitorDays(7);
      setStrategyFormData({
        strategyKey: "",
        label: "",
        strategyType: "",
        thesis: "",
        profitRules: "",
        defenseRules: "",
        timeRules: "",
      });
      setStrategyData(null);

      if (onActionComplete) {
        onActionComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record action");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowActionForm(false);
    setSelectedAction(null);
    setNotes("");
    setMonitorDays(7);
    setError(null);
    setStrategyFormData({
      strategyKey: "",
      label: "",
      strategyType: "",
      thesis: "",
      profitRules: "",
      defenseRules: "",
      timeRules: "",
    });
    setStrategyData(null);
  };

  const getActionLabel = (action: ActionType): string => {
    switch (action) {
      case "TRADE":
        return "Trade";
      case "MONITOR":
        return "Monitor";
      case "DISMISS":
        return "Dismiss";
      case "UPDATE":
        return "Update";
    }
  };

  const getActionDescription = (action: ActionType): string => {
    if (action === "UPDATE" && recommendedAction === "CONFIRM_STRATEGIES") {
      return "Confirm this auto-derived strategy and set its metadata. This will link it to playbook items and enable state code computation.";
    }
    
    if (action === "UPDATE" && recommendedAction === "PROVIDE_STRATEGY_METADATA") {
      return "Complete the required strategy metadata fields. This will link the strategy to playbook items and enable state code computation.";
    }
    
    switch (action) {
      case "TRADE":
        return "Record a trade decision (close, adjust, hedge, roll, reduce, add, etc.)";
      case "MONITOR":
        return "Monitor this trigger for a specified period. Severity will be set to 'monitor' and revert after the period.";
      case "DISMISS":
        return "Dismiss this trigger. Severity will be set to 'info' permanently.";
      case "UPDATE":
        return "Update metadata or complete forms. Severity will be set to 'complete'.";
    }
  };

  const isActionDisabled = (action: ActionType): boolean => {
    return !availableActions.includes(action);
  };

  // Render strategy metadata form (for PROVIDE_STRATEGY_METADATA)
  if (showActionForm && selectedAction === "UPDATE" && recommendedAction === "PROVIDE_STRATEGY_METADATA") {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-900">Complete Strategy Metadata</h4>
          <p className="mt-1 text-xs text-slate-600">{getActionDescription("UPDATE")}</p>
        </div>

        {loadingStrategy ? (
          <div className="text-sm text-slate-500">Loading strategy data...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Strategy Type *
              </label>
              <select
                value={strategyFormData.strategyType}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, strategyType: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              >
                <option value="">Select strategy type...</option>
                {strategyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Links the strategy to playbook items and enables state code computation
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Thesis
              </label>
              <textarea
                value={strategyFormData.thesis}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, thesis: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                rows={3}
                placeholder="Entry thesis and reasoning..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Profit Rules
                </label>
                <textarea
                  value={strategyFormData.profitRules}
                  onChange={(e) =>
                    setStrategyFormData({ ...strategyFormData, profitRules: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="When to take profits..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Defense Rules
                </label>
                <textarea
                  value={strategyFormData.defenseRules}
                  onChange={(e) =>
                    setStrategyFormData({ ...strategyFormData, defenseRules: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="How to defend the position..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Time Rules
              </label>
              <textarea
                value={strategyFormData.timeRules}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, timeRules: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                rows={2}
                placeholder="Time-based exit criteria..."
              />
            </div>

            {error && <div className="text-xs text-rose-600">{error}</div>}

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={loading || !strategyFormData.strategyType}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Update Metadata"}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render strategy confirmation form
  if (showActionForm && selectedAction === "UPDATE" && recommendedAction === "CONFIRM_STRATEGIES") {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-900">Confirm Strategy</h4>
          <p className="mt-1 text-xs text-slate-600">{getActionDescription("UPDATE")}</p>
        </div>

        {loadingStrategy ? (
          <div className="text-sm text-slate-500">Loading strategy data...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Strategy Key *
              </label>
              <input
                type="text"
                value={strategyFormData.strategyKey}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, strategyKey: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Label
              </label>
              <input
                type="text"
                value={strategyFormData.label}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, label: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Optional display label"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Strategy Type *
              </label>
              <select
                value={strategyFormData.strategyType}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, strategyType: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              >
                <option value="">Select strategy type...</option>
                {strategyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Links the strategy to playbook items and enables state code computation
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Thesis
              </label>
              <textarea
                value={strategyFormData.thesis}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, thesis: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                rows={3}
                placeholder="Entry thesis and reasoning..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Profit Rules
                </label>
                <textarea
                  value={strategyFormData.profitRules}
                  onChange={(e) =>
                    setStrategyFormData({ ...strategyFormData, profitRules: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="When to take profits..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Defense Rules
                </label>
                <textarea
                  value={strategyFormData.defenseRules}
                  onChange={(e) =>
                    setStrategyFormData({ ...strategyFormData, defenseRules: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="How to defend the position..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Time Rules
              </label>
              <textarea
                value={strategyFormData.timeRules}
                onChange={(e) =>
                  setStrategyFormData({ ...strategyFormData, timeRules: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                rows={2}
                placeholder="Time-based exit criteria..."
              />
            </div>

            {error && <div className="text-xs text-rose-600">{error}</div>}

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={loading || !strategyFormData.strategyType}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Confirming..." : "Confirm Strategy"}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standard action form
  if (showActionForm && selectedAction) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3">
          <h4 className="text-sm font-medium text-slate-900">
            {getActionLabel(selectedAction)}
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            {getActionDescription(selectedAction)}
          </p>
        </div>

        {selectedAction === "MONITOR" && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-700">
              Monitor Period (days)
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={monitorDays}
              onChange={(e) => setMonitorDays(parseInt(e.target.value) || 7)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-700">
            Notes {selectedAction === "TRADE" && "(e.g., Roll, Close, Reduce Size)"}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              selectedAction === "TRADE"
                ? "Describe the trade: Roll position, Close position, Reduce size, etc."
                : "Add any relevant notes..."
            }
            rows={2}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>

        {error && <div className="mb-3 text-xs text-rose-600">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Confirming..." : "Confirm"}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleAction("TRADE")}
          disabled={loading || isActionDisabled("TRADE")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
            isActionDisabled("TRADE")
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          }`}
          title={isActionDisabled("TRADE") ? "Not available for this trigger" : ""}
        >
          Trade
        </button>
        <button
          onClick={() => handleAction("MONITOR")}
          disabled={loading || isActionDisabled("MONITOR")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
            isActionDisabled("MONITOR")
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200"
          }`}
          title={isActionDisabled("MONITOR") ? "Not available for this trigger" : ""}
        >
          Monitor
        </button>
        <button
          onClick={() => handleAction("DISMISS")}
          disabled={loading || isActionDisabled("DISMISS")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
            isActionDisabled("DISMISS")
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          title={isActionDisabled("DISMISS") ? "Not available for this trigger" : ""}
        >
          Dismiss
        </button>
        <button
          onClick={() => handleAction("UPDATE")}
          disabled={loading || isActionDisabled("UPDATE")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
            isActionDisabled("UPDATE")
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          }`}
          title={isActionDisabled("UPDATE") ? "Not available for this trigger" : ""}
        >
          Update
        </button>
        {strategyId && (
          <Link
            href={`/strategies/${strategyId}`}
            className="ml-auto text-xs font-medium text-blue-600 hover:underline"
          >
            View Strategy →
          </Link>
        )}
      </div>
    </div>
  );
}
