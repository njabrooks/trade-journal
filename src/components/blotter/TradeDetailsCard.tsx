"use client";

import { formatCurrency } from "@/lib/formatters";
import type { BlotterEntry } from "@/db/queries/blotter";

interface TradeDetailsCardProps {
  entry: BlotterEntry;
}

export function TradeDetailsCard({ entry }: TradeDetailsCardProps) {
  const tradeDetails = entry.tradeDetails;
  
  if (!tradeDetails || tradeDetails.length === 0) {
    return null;
  }

  const hasExchange = tradeDetails.some((t) => t.exchange);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
        Trade Execution Details
      </p>
      <div className="space-y-2">
        {/* Headers */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600 pb-1 border-b border-slate-300/50">
          <div className="w-28">Symbol</div>
          <div className="w-20 text-center">Side</div>
          <div className="w-24 text-right">Quantity</div>
          <div className="w-24 text-right">Price</div>
          <div className="w-28 text-right">Gross</div>
          <div className="w-24 text-right">Fees</div>
          <div className="w-28 text-right">Net</div>
          {hasExchange && <div className="flex-1">Exchange</div>}
        </div>
        {/* Trade Rows */}
        {tradeDetails.map((trade) => (
          <div key={trade.id} className="flex items-center gap-4 text-sm">
            <div className="w-28">
              <span className="font-medium text-slate-900">{trade.symbol}</span>
            </div>
            <div className="w-20 text-center">
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
            <div className="w-24 text-right">
              <span className="text-slate-900">
                {trade.quantity > 0 ? "+" : ""}
                {trade.quantity}
              </span>
            </div>
            <div className="w-24 text-right text-slate-600">
              {trade.price.toFixed(2)}
            </div>
            <div className="w-28 text-right text-slate-600">
              {trade.grossAmount !== null ? formatCurrency(trade.grossAmount) : "—"}
            </div>
            <div className="w-24 text-right text-slate-600">
              {trade.fees !== null ? formatCurrency(trade.fees) : "—"}
            </div>
            <div className="w-28 text-right font-medium text-slate-900">
              {trade.netAmount !== null ? formatCurrency(trade.netAmount) : "—"}
            </div>
            {hasExchange && (
              <div className="flex-1 text-slate-500 text-xs">
                {trade.exchange || "—"}
              </div>
            )}
          </div>
        ))}
        {/* Totals Row */}
        {tradeDetails.length > 1 && (
          <div className="flex items-center gap-4 text-sm pt-2 border-t border-slate-300/50">
            <div className="w-28">
              <span className="font-semibold text-slate-700">Total</span>
            </div>
            <div className="w-20"></div>
            <div className="w-24 text-right">
              <span className="font-semibold text-slate-900">
                {tradeDetails.reduce((sum, t) => sum + t.quantity, 0) > 0 ? "+" : ""}
                {tradeDetails.reduce((sum, t) => sum + t.quantity, 0)}
              </span>
            </div>
            <div className="w-24"></div>
            <div className="w-28 text-right font-semibold text-slate-900">
              {formatCurrency(
                tradeDetails.reduce((sum, t) => sum + (t.grossAmount || 0), 0)
              )}
            </div>
            <div className="w-24 text-right font-semibold text-slate-900">
              {formatCurrency(
                tradeDetails.reduce((sum, t) => sum + (t.fees || 0), 0)
              )}
            </div>
            <div className="w-28 text-right font-semibold text-slate-900">
              {formatCurrency(
                tradeDetails.reduce((sum, t) => sum + (t.netAmount || 0), 0)
              )}
            </div>
            {hasExchange && <div className="flex-1"></div>}
          </div>
        )}
      </div>
    </div>
  );
}

