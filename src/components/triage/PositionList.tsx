"use client";

import { useEffect, useState } from "react";
import { formatPosition } from "@/lib/formatters";

interface Position {
  id: string;
  assetClass: string | null;
  quantity: number;
  underlyingTicker: string | null;
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
}

interface PositionListProps {
  positionId?: string | null;
  strategyId?: string | null;
}

export function PositionList({ positionId, strategyId }: PositionListProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!positionId && !strategyId) {
      setLoading(false);
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
      <div className="mt-3 text-xs text-slate-400">Loading positions...</div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 text-xs text-rose-600">Error: {error}</div>
    );
  }

  if (positions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-1">
      {positions.map((pos) => (
        <div
          key={pos.id}
          className="text-xs font-mono text-slate-700"
        >
          {formatPosition(
            pos.assetClass,
            pos.quantity,
            pos.underlyingTicker,
            pos.expiry,
            pos.strike,
            pos.optionRight
          )}
        </div>
      ))}
    </div>
  );
}

