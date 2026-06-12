"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChartLine } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface SnapshotThesis {
  thesisId: string;
  title: string;
  ticker: string | null;
  latestCumulative: number;
  confidence: string;
}

interface SnapshotData {
  totals: {
    cumulative: number;
    realized: number;
    unrealized: number;
    thesisCount: number;
  };
  top: SnapshotThesis[];
  bottom: SnapshotThesis[];
}

function ThesisLine({ thesis }: { thesis: SnapshotThesis }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <Link
        href={`/asset-theses/${thesis.thesisId}/overview`}
        className="min-w-0 truncate hover:underline"
      >
        {thesis.ticker && (
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
            {thesis.ticker}
          </span>
        )}
        {thesis.title}
      </Link>
      <span
        className={`shrink-0 font-mono text-xs tabular-nums ${
          thesis.latestCumulative >= 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {formatCurrency(thesis.latestCumulative)}
        {thesis.confidence !== "full" && (
          <span className="ml-1 text-amber-500" title="Realized history incomplete — partial view">
            *
          </span>
        )}
      </span>
    </div>
  );
}

/** Morning-screen performance module — links into the /performance section. */
export function PerformanceSnapshot() {
  const [data, setData] = useState<SnapshotData | null>(null);

  useEffect(() => {
    fetch("/api/performance/snapshot")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ChartLine className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Performance</h3>
        <Link
          href="/performance"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Full attribution →
        </Link>
      </div>

      <p
        className={`text-2xl font-semibold tabular-nums ${
          data.totals.cumulative >= 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {formatCurrency(data.totals.cumulative)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Cumulative across {data.totals.thesisCount} asset theses ·{" "}
        {formatCurrency(data.totals.realized)} realized
      </p>

      {(data.top.length > 0 || data.bottom.length > 0) && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          {data.top.map((t) => (
            <ThesisLine key={t.thesisId} thesis={t} />
          ))}
          {data.bottom.length > 0 && (
            <div className="border-t border-dashed pt-1.5">
              {data.bottom.map((t) => (
                <ThesisLine key={t.thesisId} thesis={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
