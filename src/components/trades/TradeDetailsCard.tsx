"use client";

import { formatCurrency } from "@/lib/formatters";
import type { TradeDetail } from "@/types/trades";

interface TradeDetailsCardProps {
  /** Array of trade details to display */
  tradeDetails: TradeDetail[] | null;
  /** Enable edit mode with checkboxes and quantity editing */
  editMode?: boolean;
  /** Set of selected trade IDs (for edit mode) */
  selectedTradeIds?: Set<string>;
  /** Callback when a trade is selected/deselected */
  onTradeSelect?: (tradeId: string, selected: boolean) => void;
  /** Map of trade ID to edited quantity (for edit mode) */
  tradeQuantities?: Map<string, number>;
  /** Callback when quantity is changed */
  onQuantityChange?: (tradeId: string, quantity: number) => void;
  /** Callback to select all trades */
  onSelectAll?: () => void;
  /** Callback to deselect all trades */
  onDeselectAll?: () => void;
}

/**
 * TradeDetailsCard - Displays trade details with optional edit mode
 *
 * Used in triage workflows to show and select trades for processing.
 */
export function TradeDetailsCard({
  tradeDetails,
  editMode = false,
  selectedTradeIds = new Set(),
  onTradeSelect,
  tradeQuantities,
  onQuantityChange,
  onSelectAll,
  onDeselectAll,
}: TradeDetailsCardProps) {
  if (!tradeDetails || tradeDetails.length === 0) {
    return (
      <div className="text-sm text-slate-500 py-2">
        No trade details available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Trade Executions ({tradeDetails.length})
        </p>
        {editMode && (onSelectAll || onDeselectAll) && (
          <div className="flex gap-2">
            {onSelectAll && (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Select All
              </button>
            )}
            {onDeselectAll && (
              <button
                type="button"
                onClick={onDeselectAll}
                className="text-xs text-slate-500 hover:text-slate-600"
              >
                Deselect All
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {tradeDetails.map((trade) => {
          const isSelected = selectedTradeIds.has(trade.id);
          const displayQuantity = tradeQuantities?.get(trade.id) ?? trade.quantity;
          const sideColor = trade.side === "BUY" ? "text-emerald-600" : "text-rose-600";

          return (
            <div
              key={trade.id}
              className={`rounded-md border p-3 ${
                editMode && isSelected
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {editMode && onTradeSelect && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onTradeSelect(trade.id, e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-slate-900">
                        {trade.symbol}
                      </span>
                      <span className={`text-xs font-medium ${sideColor}`}>
                        {trade.side}
                      </span>
                      {trade.assetClass && (
                        <span className="text-xs text-slate-400">
                          {trade.assetClass}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(trade.tradeDate).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="mt-1 flex items-center gap-4 text-sm">
                    {editMode && onQuantityChange ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">Qty:</span>
                        <input
                          type="number"
                          value={displayQuantity}
                          onChange={(e) => onQuantityChange(trade.id, parseFloat(e.target.value) || 0)}
                          className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm"
                        />
                      </div>
                    ) : (
                      <span className="text-slate-700">
                        Qty: <span className="font-medium">{displayQuantity}</span>
                      </span>
                    )}

                    <span className="text-slate-700">
                      @ <span className="font-medium">{formatCurrency(trade.price)}</span>
                    </span>

                    {trade.netAmount !== null && (
                      <span className="text-slate-500">
                        Net: {formatCurrency(trade.netAmount)}
                      </span>
                    )}

                    {trade.fees !== null && trade.fees !== 0 && (
                      <span className="text-slate-400 text-xs">
                        Fees: {formatCurrency(trade.fees)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
