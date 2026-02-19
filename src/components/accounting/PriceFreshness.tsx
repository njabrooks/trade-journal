"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface PriceGapData {
  total: number;
  current: number;
  stale: number;
  critical: number;
  neverPriced: number;
  freshness: number;
  staleAssets: { ticker: string; assetClass: string; lastPriceDate: string; gapDays: number }[];
  criticalAssets: { ticker: string; assetClass: string; lastPriceDate: string; gapDays: number }[];
}

export function PriceFreshness() {
  const [data, setData] = useState<PriceGapData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/accounting/price-gaps")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const barSegments = [
    { label: "Current", count: data.current, color: "oklch(0.7 0.18 150)" },
    { label: "Stale", count: data.stale, color: "oklch(0.75 0.2 80)" },
    { label: "Critical", count: data.critical, color: "oklch(0.65 0.22 25)" },
    { label: "Never", count: data.neverPriced, color: "oklch(0.6 0.1 240)" },
  ];

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">
          Price Freshness
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.total} market-tier assets
        </span>
      </div>

      {/* Stacked bar */}
      <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full">
        {barSegments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.label}
              className="transition-all"
              style={{
                width: `${(seg.count / data.total) * 100}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label}: ${seg.count}`}
            />
          ) : null
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {barSegments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{seg.count}</span>
          </div>
        ))}
      </div>

      {/* Freshness percentage */}
      <div className="mt-3 text-2xl font-semibold tabular-nums">
        {data.freshness}%{" "}
        <span className="text-sm font-normal text-muted-foreground">
          current
        </span>
      </div>
    </div>
  );
}
