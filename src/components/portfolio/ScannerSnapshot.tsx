"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { formatDateShort } from "@/lib/formatters";

interface ScannerSnapshotRow {
  id: string;
  ticker: string;
  regime: string | null;
  cheapnessScore: number | null;
  ivPercentile252: number | null;
  ivRv20Ratio: number | null;
  hasOpenPosition: boolean | null;
  /** comes back as a joined string from the API; older shapes used an array */
  thesisTitles: string | string[] | null;
}

interface ScannerTodayData {
  run: { id: string; runDate: string; status: string } | null;
  snapshots: ScannerSnapshotRow[];
}

const TOP_N = 5;

/**
 * Morning-screen scanner module — top cheap-vol hits from the latest daily
 * scan. The options-advisor recommendations slot in here when W7 lands.
 */
export function ScannerSnapshot() {
  const [data, setData] = useState<ScannerTodayData | null>(null);

  useEffect(() => {
    fetch("/api/vol-curve/scanner-today")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data?.run || data.snapshots.length === 0) return null;

  const cheapHits = data.snapshots
    .filter((s) => s.regime === "cheap" && s.cheapnessScore !== null)
    .sort((a, b) => (b.cheapnessScore ?? 0) - (a.cheapnessScore ?? 0))
    .slice(0, TOP_N);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Options Scanner</h3>
        <span className="text-xs text-muted-foreground">
          {formatDateShort(data.run.runDate)}
        </span>
        <Link
          href="/vol-curve"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Full scan →
        </Link>
      </div>

      {cheapHits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cheap-vol hits in the latest scan.
        </p>
      ) : (
        <div className="space-y-1.5">
          {cheapHits.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-14 font-mono text-xs font-medium">{s.ticker}</span>
              <span className="text-xs text-muted-foreground">
                IV%ile {s.ivPercentile252 !== null ? Math.round(s.ivPercentile252) : "—"}
                {s.ivRv20Ratio !== null && ` · IV/RV ${s.ivRv20Ratio.toFixed(2)}`}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {s.hasOpenPosition && (
                  <span
                    className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"
                    title="Open position on this underlying"
                  >
                    held
                  </span>
                )}
                {s.thesisTitles && s.thesisTitles.length > 0 && (
                  <span
                    className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400"
                    title={Array.isArray(s.thesisTitles) ? s.thesisTitles.join(", ") : s.thesisTitles}
                  >
                    thesis
                  </span>
                )}
                <span className="font-mono text-xs tabular-nums">
                  {s.cheapnessScore !== null ? s.cheapnessScore.toFixed(0) : "—"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
