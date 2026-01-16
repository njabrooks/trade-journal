"use client";

import { useState, useEffect } from "react";
import { TradeDetailsCard } from "@/components/trades/TradeDetailsCard";
import type { TradeDetail } from "@/types/trades";

interface UnmatchedTradeExecution {
  blotterId?: string;
  blotterActionId?: string;
  conid: number;
  ticker: string;
  actionDate: string;
  qtyChange: number;
  premiumChange: number;
  tradeIds?: string[];
  tradeCount?: number;
}

interface UnmatchedTradesCardProps {
  unmatchedTradeExecutions: UnmatchedTradeExecution[];
  // Edit mode props (for QUANTITY_CHANGE reconciliation)
  editMode?: boolean;
  selectedTradeIds?: Set<string>;
  onTradeSelect?: (tradeId: string, selected: boolean) => void;
  tradeQuantities?: Map<string, number>;
  onQuantityChange?: (tradeId: string, quantity: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

export function UnmatchedTradesCard({
  unmatchedTradeExecutions,
  editMode = false,
  selectedTradeIds = new Set(),
  onTradeSelect,
  tradeQuantities,
  onQuantityChange,
  onSelectAll,
  onDeselectAll,
}: UnmatchedTradesCardProps) {
  const [tradeDetails, setTradeDetails] = useState<TradeDetail[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Collect all tradeIds from all unmatched trade executions
  useEffect(() => {
    const allTradeIds = new Set<string>();
    unmatchedTradeExecutions.forEach((execution) => {
      if (execution.tradeIds && Array.isArray(execution.tradeIds)) {
        execution.tradeIds.forEach((id: string) => allTradeIds.add(id));
      }
    });

    if (allTradeIds.size === 0) {
      setLoading(false);
      return;
    }

    // Fetch trade details from trades table
    fetch(`/api/trades?ids=${Array.from(allTradeIds).join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data)) {
          // Format trades first
          const formatted = data.map((trade: any) => ({
            id: trade.id,
            symbol: trade.symbol,
            side: trade.side,
            quantity: Number(trade.quantity) || 0,
            price: Number(trade.price) || 0,
            grossAmount: trade.grossAmount ? Number(trade.grossAmount) : null,
            netAmount: trade.netAmount ? Number(trade.netAmount) : null,
            fees: trade.fees ? Number(trade.fees) : null,
            assetClass: trade.assetClass ?? null,
            exchange: trade.exchange ?? null,
            orderType: trade.orderType ?? null,
            currency: trade.currency ?? null,
            tradeDate: trade.tradeDate,
          }));

          // Aggregate by symbol
          const aggregatedBySymbol = new Map<string, {
            id: string; // Use first trade's ID or comma-separated IDs
            symbol: string;
            side: string;
            quantity: number;
            price: number;
            grossAmount: number | null;
            netAmount: number | null;
            fees: number | null;
            assetClass: string | null;
            exchange: string | null;
            orderType: string | null;
            currency: string | null;
            tradeDate: string;
          }>();

          for (const trade of formatted) {
            const existing = aggregatedBySymbol.get(trade.symbol);
            
            if (existing) {
              // Aggregate quantities (signed: positive for BUY, negative for SELL)
              const qtyAbs = Math.abs(Number(trade.quantity) || 0);
              const qty = trade.side === 'BUY' ? qtyAbs : -qtyAbs;
              const existingQtyAbs = Math.abs(existing.quantity);
              const existingQty = existing.side === 'BUY' ? existingQtyAbs : -existingQtyAbs;
              const netQty = existingQty + qty;
              
              // Update aggregated values
              existing.quantity = netQty;
              existing.side = netQty > 0 ? 'BUY' : netQty < 0 ? 'SELL' : existing.side;
              
              // Aggregate amounts
              existing.grossAmount = (existing.grossAmount || 0) + (trade.grossAmount || 0);
              existing.netAmount = (existing.netAmount || 0) + (trade.netAmount || 0);
              existing.fees = (existing.fees || 0) + (trade.fees || 0);
              
              // Calculate average price: aggregated proceeds / aggregated quantity
              // Use absolute values: |aggregated grossAmount| / |aggregated quantity|
              const absNetQty = Math.abs(netQty);
              const absGrossAmount = Math.abs(existing.grossAmount || 0);
              if (absNetQty > 0 && absGrossAmount > 0) {
                existing.price = absGrossAmount / absNetQty;
              } else if (absNetQty > 0) {
                // Fallback: use netAmount if grossAmount is not available
                const absNetAmount = Math.abs(existing.netAmount || 0);
                if (absNetAmount > 0) {
                  existing.price = absNetAmount / absNetQty;
                }
              }
              
              // Update ID to include all trade IDs
              existing.id = `${existing.id},${trade.id}`;
            } else {
              // First trade for this symbol
              const qtyAbs = Math.abs(Number(trade.quantity) || 0);
              const qty = trade.side === 'BUY' ? qtyAbs : -qtyAbs;
              
              aggregatedBySymbol.set(trade.symbol, {
                id: trade.id,
                symbol: trade.symbol,
                side: trade.side,
                quantity: qty,
                price: Number(trade.price) || 0,
                grossAmount: trade.grossAmount,
                netAmount: trade.netAmount,
                fees: trade.fees,
                assetClass: trade.assetClass,
                exchange: trade.exchange,
                orderType: trade.orderType,
                currency: trade.currency,
                tradeDate: trade.tradeDate,
              });
            }
          }

          // Convert map to array
          const aggregated = Array.from(aggregatedBySymbol.values());
          setTradeDetails(aggregated);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch trade details:", err);
        setLoading(false);
      });
  }, [unmatchedTradeExecutions]);

  if (!unmatchedTradeExecutions || unmatchedTradeExecutions.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Unmatched Trade Executions
        </p>
        <div className="text-sm text-slate-500">Loading trade details...</div>
      </div>
    );
  }

  if (!tradeDetails || tradeDetails.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Unmatched Trade Executions
        </p>
        <div className="text-sm text-slate-500">No trade details available</div>
      </div>
    );
  }

  return (
    <TradeDetailsCard
      tradeDetails={tradeDetails}
      editMode={editMode}
      selectedTradeIds={selectedTradeIds}
      onTradeSelect={onTradeSelect}
      tradeQuantities={tradeQuantities}
      onQuantityChange={onQuantityChange}
      onSelectAll={onSelectAll}
      onDeselectAll={onDeselectAll}
    />
  );
}

