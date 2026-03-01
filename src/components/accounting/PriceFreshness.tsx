"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface ProblemAsset {
  ticker: string;
  assetClass: string;
  lastPriceDate: string | null;
  gapDays: number | null;
}

interface SourceHealth {
  sourceId: string;
  label: string;
  status: "healthy" | "delayed" | "down";
  assetCount: number;
  latestDeliveryDate: string | null;
  expectedDate: string;
  problemAssets: ProblemAsset[];
}

interface PriceDeliveryData {
  checkedAt: string;
  totalMonitored: number;
  overallStatus: "healthy" | "delayed" | "down";
  sources: SourceHealth[];
  freshness: number;
}

const STATUS_CONFIG = {
  healthy: { dot: "oklch(0.7 0.18 150)", label: "Healthy" },
  delayed: { dot: "oklch(0.75 0.2 80)", label: "Delayed" },
  down: { dot: "oklch(0.65 0.22 25)", label: "Down" },
} as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "never";
  // Show just the day portion: "Feb 26"
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function PriceFreshness() {
  const [data, setData] = useState<PriceDeliveryData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/accounting/price-gaps")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const allProblems = data.sources.flatMap((s) =>
    s.problemAssets.map((a) => ({ ...a, sourceLabel: s.label })),
  );

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">
          Price Delivery Monitor
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.totalMonitored} assets tracked
        </span>
      </div>

      {/* Per-source status rows */}
      <div className="space-y-1.5">
        {data.sources.map((source) => {
          const cfg = STATUS_CONFIG[source.status];
          return (
            <div
              key={source.sourceId}
              className="flex items-center gap-2 text-sm"
            >
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: cfg.dot }}
                title={cfg.label}
              />
              <span className="min-w-0 truncate text-muted-foreground">
                {source.label}
              </span>
              <span className="ml-auto shrink-0 tabular-nums font-medium">
                {source.assetCount}
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {formatDate(source.latestDeliveryDate)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Problem assets */}
      {allProblems.length > 0 && (
        <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {allProblems.length} asset{allProblems.length !== 1 ? "s" : ""}{" "}
          behind schedule:{" "}
          <span className="font-medium text-foreground">
            {allProblems
              .slice(0, 5)
              .map((a) => a.ticker)
              .join(", ")}
            {allProblems.length > 5
              ? ` +${allProblems.length - 5} more`
              : ""}
          </span>
        </div>
      )}

      {/* Overall freshness */}
      <div className="mt-3 text-2xl font-semibold tabular-nums">
        {data.freshness}%{" "}
        <span className="text-sm font-normal text-muted-foreground">
          on schedule
        </span>
      </div>
    </div>
  );
}
