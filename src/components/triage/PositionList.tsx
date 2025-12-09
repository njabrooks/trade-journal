"use client";

import { useEffect, useState, useRef } from "react";
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
  const fetchingRef = useRef(false);
  const lastFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!positionId && !strategyId) {
      setLoading(false);
      lastFetchKeyRef.current = null;
      return;
    }

    // Create a unique key for this fetch
    const fetchKey = positionId ? `position-${positionId}` : `strategy-${strategyId}`;
    
    // Skip if we're already fetching or have already fetched the same data
    if (lastFetchKeyRef.current === fetchKey) {
      if (fetchingRef.current) {
        return; // Already fetching, skip
      }
      // Already fetched this key, no need to refetch (positions are historical snapshot data)
      setLoading(false);
      return;
    }

    // Reset if the key changed (new position/strategy)
    if (lastFetchKeyRef.current !== null && lastFetchKeyRef.current !== fetchKey) {
      setPositions([]);
      setError(null);
    }

    const fetchPositions = async () => {
      fetchingRef.current = true;
      lastFetchKeyRef.current = fetchKey;
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
          fetchingRef.current = false;
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
        lastFetchKeyRef.current = null; // Reset on error so we can retry
      } finally {
        setLoading(false);
        fetchingRef.current = false;
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

