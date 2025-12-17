"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  assetClass: string | null;
  symbol: string;
  underlyingTicker: string | null;
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
  quantity: number;
  spot: number | null; // MarkPrice
  absNotional: number | null; // PositionValue
  avgPrice: number | null; // CostBasisPrice
  multiplier: number | null;
  unrealizedPnl: number | null; // FifoPnlUnrealized
  nav: number | null; // For PercentOfNAV calculation
  snapshotDate: string; // For DTE calculation
}

interface TriagePositionsTableProps {
  positionId?: string | null;
  strategyId?: string | null;
  accountId: string;
  snapshotDate: string;
}

function formatSymbol(position: Position): string {
  if (position.assetClass === 'OPT' && position.underlyingTicker) {
    // Format: TSLA 260618 C350 (with space before put/call)
    const expiry = position.expiry ? position.expiry.replace(/-/g, '').slice(2) : '';
    const strike = position.strike ? Math.round(position.strike).toString() : '';
    const right = position.optionRight || '';
    return `${position.underlyingTicker} ${expiry} ${right}${strike}`;
  }
  return position.symbol;
}

function calculateCostBasisMoney(position: Position): number | null {
  if (position.quantity != null && position.avgPrice != null && position.multiplier != null) {
    return Math.abs(position.quantity * position.avgPrice * position.multiplier);
  }
  return null;
}

function calculatePercentOfNAV(position: Position): number | null {
  if (position.absNotional && position.nav && position.nav > 0) {
    return (Math.abs(position.absNotional) / position.nav) * 100;
  }
  return null;
}

function calculateDTE(expiry: string | null, snapshotDate: string): number | null {
  if (!expiry) return null;
  const expiryDate = new Date(expiry + 'T00:00:00Z');
  const snapshotDateObj = new Date(snapshotDate + 'T00:00:00Z');
  const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : null;
}

export function TriagePositionsTable({
  positionId,
  strategyId,
  accountId,
  snapshotDate,
}: TriagePositionsTableProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!positionId && !strategyId) {
      setLoading(false);
      setPositions([]);
      return;
    }

    const fetchPositions = async () => {
      setLoading(true);
      setError(null);

      try {
        let url = "";
        if (positionId) {
          url = `/api/positions?positionId=${positionId}`;
        } else if (strategyId) {
          url = `/api/positions?strategyId=${strategyId}`;
        } else {
          setLoading(false);
          return;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to load positions");
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }

        const positionsList = Array.isArray(data) ? data : [data];
        setPositions(positionsList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load positions");
      } finally {
        setLoading(false);
      }
    };

    fetchPositions();
  }, [positionId, strategyId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Positions
        </p>
        <div className="text-sm text-slate-400">Loading positions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Positions
        </p>
        <div className="text-sm text-rose-600">{error}</div>
      </div>
    );
  }

  if (positions.length === 0) {
    return null;
  }

  // Calculate totals for aggregation row
  const totals = positions.reduce(
    (acc, pos) => {
      const costBasis = calculateCostBasisMoney(pos);
      return {
        quantity: acc.quantity + pos.quantity,
        absNotional: acc.absNotional + Math.abs(pos.absNotional || 0),
        costBasisMoney: acc.costBasisMoney + (costBasis || 0),
        unrealizedPnl: acc.unrealizedPnl + (pos.unrealizedPnl || 0),
      };
    },
    { quantity: 0, absNotional: 0, costBasisMoney: 0, unrealizedPnl: 0 }
  );

  const totalPercentOfNAV = positions[0]?.nav && positions[0].nav > 0
    ? (totals.absNotional / positions[0].nav) * 100
    : null;

  const showAggregation = positions.length > 1;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
        Positions
      </p>
      <div className="space-y-2">
        {/* Headers */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600 pb-1 border-b border-slate-300/50">
          <div className="flex-[1.5] min-w-0">Symbol</div>
          <div className="flex-1 text-right">Quantity</div>
          <div className="flex-1 text-right">Mark Price</div>
          <div className="flex-1 text-right">Position Value</div>
          <div className="flex-1 text-right">Cost Basis</div>
          <div className="flex-1 text-right">% NAV</div>
          <div className="flex-1 text-right">DTE</div>
          <div className="flex-1 text-right">Unrealized P&L</div>
        </div>
        {/* Position Rows */}
        {positions.map((pos) => {
          const costBasisMoney = calculateCostBasisMoney(pos);
          const percentOfNAV = calculatePercentOfNAV(pos);
          const dte = calculateDTE(pos.expiry, pos.snapshotDate || snapshotDate);

          return (
            <div key={pos.id} className="flex items-center gap-4 text-sm">
              <div className="flex-[1.5] min-w-0">
                <span className="font-medium text-slate-900 font-mono text-xs">{formatSymbol(pos)}</span>
              </div>
              <div className="flex-1 text-right">
                <span className="text-slate-900">
                  {pos.quantity.toLocaleString()}
                </span>
              </div>
              <div className="flex-1 text-right text-slate-600">
                {pos.spot !== null && pos.spot !== undefined
                  ? formatCurrency(pos.spot, 'USD', 2)
                  : "—"}
              </div>
              <div className="flex-1 text-right font-medium text-slate-900">
                {formatCurrency(Math.abs(pos.absNotional || 0))}
              </div>
              <div className="flex-1 text-right text-slate-600">
                {costBasisMoney !== null ? formatCurrency(costBasisMoney) : "—"}
              </div>
              <div className="flex-1 text-right text-slate-600">
                {percentOfNAV !== null ? formatPercent(percentOfNAV) : "—"}
              </div>
              <div className="flex-1 text-right text-slate-600">
                {dte !== null ? `${dte} DTE` : "—"}
              </div>
              <div
                className={cn(
                  "flex-1 text-right font-medium",
                  pos.unrealizedPnl && pos.unrealizedPnl >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                )}
              >
                {pos.unrealizedPnl !== null && pos.unrealizedPnl !== undefined
                  ? formatCurrency(pos.unrealizedPnl)
                  : "—"}
              </div>
            </div>
          );
        })}
        {/* Totals Row */}
        {showAggregation && (
          <div className="flex items-center gap-4 text-sm pt-2 border-t border-slate-300/50">
            <div className="flex-[1.5] min-w-0">
              <span className="font-semibold text-slate-700">Total</span>
            </div>
            <div className="flex-1 text-right">
              <span className="font-semibold text-slate-900">
                {totals.quantity.toLocaleString()}
              </span>
            </div>
            <div className="flex-1"></div>
            <div className="flex-1 text-right font-semibold text-slate-900">
              {formatCurrency(totals.absNotional)}
            </div>
            <div className="flex-1 text-right font-semibold text-slate-900">
              {formatCurrency(totals.costBasisMoney)}
            </div>
            <div className="flex-1 text-right font-semibold text-slate-900">
              {formatPercent(totalPercentOfNAV)}
            </div>
            <div className="flex-1"></div>
            <div
              className={cn(
                "flex-1 text-right font-semibold",
                totals.unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {formatCurrency(totals.unrealizedPnl)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

