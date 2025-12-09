"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPosition } from "@/lib/formatters";

interface TriageActionButtonsProps {
  triageId: string;
  contextLevel: string;
  recommendedAction: string | null;
  strategyId: string | null;
  positionId?: string | null;
  severity?: string | null;
  onActionComplete?: () => void;
}

interface TradePosition {
  id: string | null; // null for new positions
  symbol: string;
  assetClass: string | null;
  conid: number | null;
  expiry: string | null;
  strike: number | null;
  optionRight: string | null; // 'C' | 'P'
  side: string | null; // 'LONG' | 'SHORT'
  quantity: number; // negative for closing
  underlyingTicker: string | null;
}

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

export function TriageActionButtons({
  triageId,
  contextLevel,
  recommendedAction,
  strategyId,
  positionId,
  severity,
  onActionComplete,
}: TriageActionButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [notes, setNotes] = useState("");
  const [monitorDays, setMonitorDays] = useState(7);
  
  // Trade form state
  const [tradePositions, setTradePositions] = useState<TradePosition[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  
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

  // Quantity change form state
  const [tradeReason, setTradeReason] = useState("");
  const [tradeStage, setTradeStage] = useState<string>("");
  const [quantityChangeMetadata, setQuantityChangeMetadata] = useState({
    thesis: "",
    profitRules: "",
    defenseRules: "",
    timeRules: "",
  });

  const availableActions = getAvailableActions(recommendedAction, severity ?? null);

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

  // Load positions when TRADE action is selected
  useEffect(() => {
    if (selectedAction === "TRADE" && showActionForm && tradePositions.length === 0 && (positionId || strategyId)) {
      loadPositions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAction, showActionForm]);

  // Extract auto-detected trade stage from notes when QUANTITY_CHANGE form is shown
  useEffect(() => {
    if (showActionForm && selectedAction === "UPDATE" && recommendedAction === "QUANTITY_CHANGE" && !tradeStage && notes) {
      // Try to extract trade stage from notes if it contains "Trade stage:"
      // This would be set by the triage computation
      const stageMatch = notes.match(/Trade stage: (\w+)/i);
      if (stageMatch) {
        setTradeStage(stageMatch[1].toLowerCase());
      }
    }
  }, [showActionForm, selectedAction, recommendedAction, notes, tradeStage]);

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

  const loadPositions = async () => {
    setLoadingPositions(true);
    try {
      let url = "";
      if (positionId) {
        url = `/api/positions?positionId=${positionId}`;
      } else if (strategyId) {
        url = `/api/positions?strategyId=${strategyId}`;
      } else {
        setError("No position or strategy ID available");
        setLoadingPositions(false);
        return;
      }

      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load positions");
      }

      const data = await response.json();
      
      // Handle error response
      if (data.error) {
        throw new Error(data.error);
      }
      
      const positionsList = Array.isArray(data) ? data : [data];
      
      // Ensure we have at least one position
      if (positionsList.length === 0) {
        throw new Error("No positions found");
      }

      // Initialize trade positions with opposite quantities (closing by default)
      const initialPositions: TradePosition[] = positionsList.map((pos: any) => ({
        id: pos.id,
        symbol: pos.symbol || "",
        assetClass: pos.assetClass,
        conid: pos.conid,
        expiry: pos.expiry || "",
        strike: pos.strike,
        optionRight: pos.optionRight,
        side: pos.side,
        quantity: -pos.quantity, // Exact opposite to close position
        underlyingTicker: pos.underlyingTicker || null,
      }));

      setTradePositions(initialPositions);
    } catch (err) {
      setError("Failed to load positions");
      console.error("Failed to load positions:", err);
    } finally {
      setLoadingPositions(false);
    }
  };

  const handleAction = async (actionType: ActionType) => {
    if (!availableActions.includes(actionType)) return;
    setSelectedAction(actionType);
    setShowActionForm(true);
    // Reset trade positions when opening trade form
    if (actionType === "TRADE") {
      setTradePositions([]);
      // Set default trade stage to "close" since default quantities close positions
      setTradeStage("close");
      setTradeReason(""); // Reset trade reason
    }
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
      } else if (selectedAction === "UPDATE" && recommendedAction === "QUANTITY_CHANGE") {
        // Validate required fields
        if (!tradeReason || !tradeStage) {
          setError("Trade reason and trade stage are required");
          setLoading(false);
          return;
        }

        // Store trade reason and stage in body
        body.tradeReason = tradeReason;
        body.tradeStage = tradeStage;
        
        // If opening trade, also update strategy metadata if strategyId exists
        if (tradeStage === "open" && strategyId) {
          const metadataToUpdate: any = {};
          if (quantityChangeMetadata.thesis) metadataToUpdate.thesis = quantityChangeMetadata.thesis;
          if (quantityChangeMetadata.profitRules) metadataToUpdate.profitRules = quantityChangeMetadata.profitRules;
          if (quantityChangeMetadata.defenseRules) metadataToUpdate.defenseRules = quantityChangeMetadata.defenseRules;
          if (quantityChangeMetadata.timeRules) metadataToUpdate.timeRules = quantityChangeMetadata.timeRules;

          if (Object.keys(metadataToUpdate).length > 0) {
            const strategyResponse = await fetch("/api/strategies", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: strategyId,
                ...metadataToUpdate,
              }),
            });

            if (!strategyResponse.ok) {
              console.warn("Failed to update strategy metadata, continuing with blotter entry");
            }
          }
        }

        // Combine notes with metadata if provided
        let notesParts = [tradeReason];
        if (tradeStage === "open" && quantityChangeMetadata.thesis) {
          notesParts.push(`Thesis: ${quantityChangeMetadata.thesis}`);
        }
        body.notes = notesParts.join("\n\n");
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
      } else if (selectedAction === "TRADE") {
        // TRADE action - include trade reason and stage (required)
        if (!tradeReason || !tradeStage) {
          setError("Trade reason and trade stage are required");
          setLoading(false);
          return;
        }
        body.tradeReason = tradeReason;
        body.tradeStage = tradeStage;
        
        // Include trade positions in the action
        body.tradePositions = tradePositions;
        
        // Build notes from trade positions if notes not provided
        if (!notes.trim() && tradePositions.length > 0) {
          const tradeSummary = tradePositions
            .map((pos) => {
              if (pos.assetClass === "OPT") {
                return `${pos.symbol} ${pos.quantity > 0 ? "+" : ""}${pos.quantity} (${pos.strike} ${pos.optionRight} ${pos.expiry})`;
              } else {
                return `${pos.symbol} ${pos.quantity > 0 ? "+" : ""}${pos.quantity}`;
              }
            })
            .join(", ");
          body.notes = `Trade: ${tradeSummary}`;
        } else if (notes.trim()) {
          body.notes = notes.trim();
        }
      } else {
        // Standard action handling (MONITOR, DISMISS)
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
      setTradePositions([]);
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

      // Refresh the page to show updated state (severity override, etc.)
      router.refresh();

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
    setTradePositions([]);
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

  const updateTradePosition = (index: number, field: keyof TradePosition, value: any) => {
    const updated = [...tradePositions];
    updated[index] = { ...updated[index], [field]: value };
    setTradePositions(updated);
  };

  const addTradePosition = () => {
    setTradePositions([
      ...tradePositions,
      {
        id: null,
        symbol: "",
        assetClass: null,
        conid: null,
        expiry: null,
        strike: null,
        optionRight: null,
        side: null,
        quantity: 0,
        underlyingTicker: null,
      },
    ]);
  };

  const removeTradePosition = (index: number) => {
    setTradePositions(tradePositions.filter((_, i) => i !== index));
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

  // Render quantity change form (for QUANTITY_CHANGE)
  if (showActionForm && selectedAction === "UPDATE" && recommendedAction === "QUANTITY_CHANGE") {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-900">Record Trade Metadata</h4>
          <p className="mt-1 text-xs text-slate-600">
            Capture the reason and details for the quantity change detected. This will create a blotter entry.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Trade Reason *
            </label>
            <textarea
              value={tradeReason}
              onChange={(e) => setTradeReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows={3}
              placeholder="Explain why this trade was made..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Trade Stage *
            </label>
            <select
              value={tradeStage}
              onChange={(e) => setTradeStage(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              required
            >
              <option value="">Select trade stage...</option>
              <option value="open">Open</option>
              <option value="close">Close</option>
              <option value="hedge">Hedge</option>
              <option value="roll">Roll</option>
              <option value="reduce">Reduce</option>
              <option value="add">Add</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Auto-detected from quantity change pattern (editable)
            </p>
          </div>

          {/* Optional metadata fields for opening trades */}
          {tradeStage === "open" && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Thesis (Optional)
                </label>
                <textarea
                  value={quantityChangeMetadata.thesis}
                  onChange={(e) =>
                    setQuantityChangeMetadata({ ...quantityChangeMetadata, thesis: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="Entry thesis and reasoning..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Profit Rules (Optional)
                  </label>
                  <textarea
                    value={quantityChangeMetadata.profitRules}
                    onChange={(e) =>
                      setQuantityChangeMetadata({
                        ...quantityChangeMetadata,
                        profitRules: e.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    rows={2}
                    placeholder="When to take profits..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Defense Rules (Optional)
                  </label>
                  <textarea
                    value={quantityChangeMetadata.defenseRules}
                    onChange={(e) =>
                      setQuantityChangeMetadata({
                        ...quantityChangeMetadata,
                        defenseRules: e.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    rows={2}
                    placeholder="How to defend the position..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Time Rules (Optional)
                </label>
                <textarea
                  value={quantityChangeMetadata.timeRules}
                  onChange={(e) =>
                    setQuantityChangeMetadata({
                      ...quantityChangeMetadata,
                      timeRules: e.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="Time-based exit criteria..."
                />
              </div>
            </>
          )}

          {error && <div className="text-xs text-rose-600">{error}</div>}

          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={loading || !tradeReason || !tradeStage}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Recording..." : "Record Trade"}
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

  // Trade action form
  if (showActionForm && selectedAction === "TRADE") {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-900">Record Trade Decision</h4>
          <p className="mt-1 text-xs text-slate-600">
            Specify the details of the trade. Default is to close positions (negative quantities).
          </p>
        </div>

        {loadingPositions ? (
          <div className="text-sm text-slate-500">Loading positions...</div>
        ) : (
          <div className="space-y-4">
            {tradePositions.map((pos, index) => {
              const isOption = pos.assetClass === "OPT";
              return (
                <div key={index} className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-mono text-slate-700">
                      {formatPosition(
                        pos.assetClass,
                        pos.quantity,
                        pos.underlyingTicker,
                        pos.expiry,
                        pos.strike,
                        pos.optionRight
                      )}
                    </div>
                    {tradePositions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTradePosition(index)}
                        className="text-xs text-rose-600 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-6 gap-2 items-end">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                        Asset Class
                      </label>
                      <select
                        value={pos.assetClass || ""}
                        onChange={(e) => updateTradePosition(index, "assetClass", e.target.value || null)}
                        className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                      >
                        <option value="">—</option>
                        <option value="STK">STK</option>
                        <option value="OPT">OPT</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        value={pos.quantity}
                        onChange={(e) => updateTradePosition(index, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                        Underlying *
                      </label>
                      <input
                        type="text"
                        value={pos.underlyingTicker || ""}
                        onChange={(e) => updateTradePosition(index, "underlyingTicker", e.target.value || null)}
                        className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                        required
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-medium mb-0.5 ${isOption ? 'text-slate-600' : 'text-slate-400'}`}>
                        Expiry
                      </label>
                      <input
                        type="date"
                        value={pos.expiry || ""}
                        onChange={(e) => updateTradePosition(index, "expiry", e.target.value || null)}
                        disabled={!isOption}
                        className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-medium mb-0.5 ${isOption ? 'text-slate-600' : 'text-slate-400'}`}>
                        Strike
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={pos.strike ?? ""}
                        onChange={(e) => updateTradePosition(index, "strike", e.target.value ? parseFloat(e.target.value) : null)}
                        disabled={!isOption}
                        className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-medium mb-0.5 ${isOption ? 'text-slate-600' : 'text-slate-400'}`}>
                        P/C
                      </label>
                      <select
                        value={pos.optionRight || ""}
                        onChange={(e) => updateTradePosition(index, "optionRight", e.target.value || null)}
                        disabled={!isOption}
                        className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">—</option>
                        <option value="C">C</option>
                        <option value="P">P</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}

            {contextLevel === "strategy" && (
              <button
                type="button"
                onClick={addTradePosition}
                className="w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                + Add Position
              </button>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Trade Reason *
              </label>
              <textarea
                value={tradeReason}
                onChange={(e) => setTradeReason(e.target.value)}
                placeholder="Explain why this trade is being made..."
                rows={2}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Trade Stage *
              </label>
              <select
                value={tradeStage}
                onChange={(e) => setTradeStage(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                required
              >
                <option value="">Select trade stage...</option>
                <option value="open">Open</option>
                <option value="close">Close</option>
                <option value="hedge">Hedge</option>
                <option value="roll">Roll</option>
                <option value="reduce">Reduce</option>
                <option value="add">Add</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about the trade..."
                rows={2}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            </div>

            {error && <div className="text-xs text-rose-600">{error}</div>}

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={loading || tradePositions.length === 0 || tradePositions.some(p => !p.underlyingTicker || p.quantity === 0) || !tradeReason || !tradeStage}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Confirming..." : "Confirm Trade"}
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

  // Standard action form (MONITOR, DISMISS)
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
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any relevant notes..."
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
