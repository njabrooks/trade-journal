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
  if (position.quantity && position.avgPrice && position.multiplier) {
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
      <div className="text-sm text-slate-400 py-4">Loading positions...</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-rose-600 py-4">Error: {error}</div>
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
    <div className="overflow-x-auto border border-slate-300 rounded-lg bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left border-r border-slate-200">Asset</th>
            <th className="px-3 py-2 text-left border-r border-slate-200">Symbol</th>
            <th className="px-3 py-2 text-right border-r border-slate-200">Quantity</th>
            <th className="px-3 py-2 text-right border-r border-slate-200">Mark Price</th>
            <th className="px-3 py-2 text-right border-r border-slate-200">Position Value</th>
            <th className="px-3 py-2 text-right border-r border-slate-200">Cost Basis Price</th>
            <th className="px-3 py-2 text-right border-r border-slate-200">Cost Basis Money</th>
            <th className="px-3 py-2 text-right border-r border-slate-200">% NAV</th>
            <th className="px-3 py-2 text-right">Unrealized P&L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const costBasisMoney = calculateCostBasisMoney(pos);
            const percentOfNAV = calculatePercentOfNAV(pos);

            return (
              <tr key={pos.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="px-3 py-2 text-left text-slate-700 border-r border-slate-100">
                  {pos.assetClass || "—"}
                </td>
                <td className="px-3 py-2 text-left font-mono text-xs text-slate-900 border-r border-slate-100">
                  {formatSymbol(pos)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-100">
                  {pos.quantity.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-100">
                  {formatCurrency(pos.spot, 'USD', 2)}
                </td>
                <td className="px-3 py-2 text-right font-medium text-slate-900 border-r border-slate-100">
                  {formatCurrency(Math.abs(pos.absNotional || 0))}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-100">
                  {formatCurrency(pos.avgPrice, 'USD', 2)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-100">
                  {formatCurrency(costBasisMoney)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-100">
                  {formatPercent(percentOfNAV)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-medium",
                    pos.unrealizedPnl && pos.unrealizedPnl >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  )}
                >
                  {formatCurrency(pos.unrealizedPnl)}
                </td>
              </tr>
            );
          })}
          {showAggregation && (
            <tr className="border-t-2 border-slate-400 bg-slate-100 font-semibold">
              <td className="px-3 py-2 text-left text-slate-700 border-r border-slate-200">—</td>
              <td className="px-3 py-2 text-left text-slate-700 border-r border-slate-200">Total</td>
              <td className="px-3 py-2 text-right text-slate-900 border-r border-slate-200">
                {totals.quantity.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-200">—</td>
              <td className="px-3 py-2 text-right text-slate-900 border-r border-slate-200">
                {formatCurrency(totals.absNotional)}
              </td>
              <td className="px-3 py-2 text-right text-slate-700 border-r border-slate-200">—</td>
              <td className="px-3 py-2 text-right text-slate-900 border-r border-slate-200">
                {formatCurrency(totals.costBasisMoney)}
              </td>
              <td className="px-3 py-2 text-right text-slate-900 border-r border-slate-200">
                {formatPercent(totalPercentOfNAV)}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right",
                  totals.unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {formatCurrency(totals.unrealizedPnl)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

