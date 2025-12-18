"use client";

import { formatCurrency } from "@/lib/formatters";
import type { BlotterEntry } from "@/db/queries/blotter";

// Format symbol like positions table: IBIT 260918 P45 instead of IBIT 260918P00045000
function formatSymbol(symbol: string, assetClass: string | null): string {
  if (assetClass === 'OPT') {
    // Parse symbols like "IBIT  260918P00045000" (with spaces)
    // Format: underlying expiry rightstrike -> underlying expiry right strike
    // Match: underlying (1-5 chars), optional spaces, 6-digit expiry, P or C, 8-digit strike
    const match = symbol.match(/^([A-Z]{1,5})\s+(\d{6})([CP])(\d{8})$/);
    if (match) {
      const [, underlying, expiry, right, strikeStr] = match;
      // Parse strike: "00045000" -> 45.00 -> 45
      const strike = parseFloat(strikeStr) / 1000;
      return `${underlying} ${expiry} ${right}${Math.round(strike)}`;
    }
    // Try format without spaces: "IBIT260918P00045000"
    const noSpaceMatch = symbol.match(/^([A-Z]{1,5})(\d{6})([CP])(\d{8})$/);
    if (noSpaceMatch) {
      const [, underlying, expiry, right, strikeStr] = noSpaceMatch;
      const strike = parseFloat(strikeStr) / 1000;
      return `${underlying} ${expiry} ${right}${Math.round(strike)}`;
    }
    // Try alternative format with shorter strike: "IBIT  260918P45"
    const shortStrikeMatch = symbol.match(/^([A-Z]{1,5})\s+(\d{6})([CP])(\d+)$/);
    if (shortStrikeMatch) {
      const [, underlying, expiry, right, strikeStr] = shortStrikeMatch;
      return `${underlying} ${expiry} ${right}${strikeStr}`;
    }
  }
  return symbol;
}

interface TradeDetailsCardProps {
  entry: BlotterEntry;
  // Edit mode props (for QUANTITY_CHANGE reconciliation)
  editMode?: boolean;
  selectedTradeIds?: Set<string>;
  onTradeSelect?: (tradeId: string, selected: boolean) => void;
  tradeQuantities?: Map<string, number>;
  onQuantityChange?: (tradeId: string, quantity: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

export function TradeDetailsCard({ 
  entry,
  editMode = false,
  selectedTradeIds = new Set(),
  onTradeSelect,
  tradeQuantities,
  onQuantityChange,
  onSelectAll,
  onDeselectAll,
}: TradeDetailsCardProps) {
  const tradeDetails = entry.tradeDetails;
  
  if (!tradeDetails || tradeDetails.length === 0) {
    return null;
  }

  const hasExchange = tradeDetails.some((t) => t.exchange);
  const allSelected = editMode && tradeDetails.length > 0 && tradeDetails.every(t => selectedTradeIds.has(t.id));
  const someSelected = editMode && tradeDetails.some(t => selectedTradeIds.has(t.id)) && !allSelected;

  return (
    <div className="space-y-2">
      {/* Headers */}
      <div className="flex items-center gap-4 text-xs font-medium text-slate-600 pb-1 border-b border-slate-300/50">
        {editMode && (
          <div className="w-8 flex items-center justify-center">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = someSelected;
                }
              }}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectAll?.();
                } else {
                  onDeselectAll?.();
                }
              }}
              className="h-4 w-4 cursor-pointer"
            />
          </div>
        )}
        <div className="flex-[1.5] min-w-0">Symbol</div>
        <div className="flex-1 text-right">Quantity</div>
        <div className="flex-1 text-right">Price</div>
        <div className="flex-1 text-right">Gross</div>
        <div className="flex-1 text-right">Fees</div>
        <div className="flex-1 text-right">Net</div>
        <div className="flex-1 text-right">Exchange</div>
        <div className="flex-1 text-center">Side</div>
      </div>
        {/* Trade Rows */}
        {tradeDetails.map((trade) => {
          const isSelected = editMode ? selectedTradeIds.has(trade.id) : true;
          const displayQuantity = editMode && tradeQuantities?.has(trade.id) 
            ? tradeQuantities.get(trade.id)! 
            : trade.quantity;
          
          return (
            <div key={trade.id} className={`flex items-center gap-4 text-sm ${editMode && !isSelected ? 'opacity-50' : ''}`}>
              {editMode && (
                <div className="w-8 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onTradeSelect?.(trade.id, e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                </div>
              )}
              <div className="flex-[1.5] min-w-0">
                <span className="font-medium text-slate-900 font-mono text-xs">
                  {formatSymbol(trade.symbol, trade.assetClass)}
                </span>
              </div>
              <div className="flex-1 text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={displayQuantity}
                    onChange={(e) => onQuantityChange?.(trade.id, parseFloat(e.target.value) || 0)}
                    className="w-full text-right text-slate-900 border border-slate-300 rounded px-1.5 py-0.5 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <span className="text-slate-900">
                    {displayQuantity > 0 ? "+" : ""}
                    {displayQuantity}
                  </span>
                )}
              </div>
              <div className="flex-1 text-right text-slate-600">
                {trade.price.toFixed(2)}
              </div>
              <div className="flex-1 text-right text-slate-600">
                {trade.grossAmount !== null ? formatCurrency(trade.grossAmount) : "—"}
              </div>
              <div className="flex-1 text-right text-slate-600">
                {trade.fees !== null ? formatCurrency(trade.fees) : "—"}
              </div>
              <div className="flex-1 text-right font-medium text-slate-900">
                {trade.netAmount !== null ? formatCurrency(trade.netAmount) : "—"}
              </div>
              <div className="flex-1 text-right text-slate-500 text-xs">
                {trade.exchange || "—"}
              </div>
              <div className="flex-1 text-center">
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                    trade.side === "BUY"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {trade.side}
                </span>
              </div>
            </div>
          );
        })}
        {/* Totals Row */}
        {tradeDetails.length > 1 && (
          <div className="flex items-center gap-4 text-sm pt-2 border-t border-slate-300/50">
            {editMode && <div className="w-8"></div>}
            <div className="flex-[1.5] min-w-0">
              <span className="font-semibold text-slate-700">Total</span>
            </div>
            <div className="flex-1 text-right">
              <span className="font-semibold text-slate-900">
                {(() => {
                  const total = editMode && tradeQuantities
                    ? tradeDetails
                        .filter(t => selectedTradeIds.has(t.id))
                        .reduce((sum, t) => sum + (tradeQuantities.get(t.id) ?? t.quantity), 0)
                    : tradeDetails.reduce((sum, t) => sum + t.quantity, 0);
                  return total > 0 ? "+" : "";
                })()}
                {(() => {
                  return editMode && tradeQuantities
                    ? tradeDetails
                        .filter(t => selectedTradeIds.has(t.id))
                        .reduce((sum, t) => sum + (tradeQuantities.get(t.id) ?? t.quantity), 0)
                    : tradeDetails.reduce((sum, t) => sum + t.quantity, 0);
                })()}
              </span>
            </div>
            <div className="flex-1"></div>
            <div className="flex-1 text-right font-semibold text-slate-900">
              {formatCurrency(
                tradeDetails.reduce((sum, t) => sum + (t.grossAmount || 0), 0)
              )}
            </div>
            <div className="flex-1 text-right font-semibold text-slate-900">
              {formatCurrency(
                tradeDetails.reduce((sum, t) => sum + (t.fees || 0), 0)
              )}
            </div>
            <div className="flex-1 text-right font-semibold text-slate-900">
              {formatCurrency(
                tradeDetails.reduce((sum, t) => sum + (t.netAmount || 0), 0)
              )}
            </div>
            <div className="flex-1"></div>
            <div className="flex-1"></div>
          </div>
        )}
    </div>
  );
}

