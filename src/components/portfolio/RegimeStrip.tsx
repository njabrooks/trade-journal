"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";

interface RegimeSnapshot {
  source: string; // 'cri' | 'vcg'
  band: string;
  score: number | null;
  scanTime: string;
  stale: boolean;
  vix: number | null;
  crashTriggered: boolean | null;
  regime: string | null;
}

// Calm bands render muted; anything else gets the warning treatment.
const CALM_BANDS = new Set(["LOW", "NORMAL"]);

function bandClass(band: string, stale: boolean): string {
  if (stale) return "text-muted-foreground";
  if (CALM_BANDS.has(band)) return "text-emerald-600 dark:text-emerald-400";
  if (band === "CRITICAL" || band === "PANIC") return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

/**
 * Regime strip (docs/v2/21 Phase 1) — one compact line of market-structure context
 * from radon's IB-only scanners: CRI (CTA crash-risk) + VCG (vol/credit gap).
 * Written by scripts/ingest-regime-scan.ts 3x weekdays. Ambient context only —
 * never raises decisions; elevated bands make hedge advisor scenarios timely.
 */
export function RegimeStrip() {
  const [snapshots, setSnapshots] = useState<RegimeSnapshot[]>([]);

  useEffect(() => {
    fetch("/api/dashboard/regime")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSnapshots(data?.snapshots ?? []))
      .catch(() => {});
  }, []);

  if (snapshots.length === 0) return null;

  const cri = snapshots.find((s) => s.source === "cri");
  const vcg = snapshots.find((s) => s.source === "vcg");
  const anyElevated = snapshots.some((s) => !s.stale && !CALM_BANDS.has(s.band));
  const newest = snapshots.reduce((a, b) => (a.scanTime > b.scanTime ? a : b));

  return (
    <section
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-2 text-xs ${
        anyElevated ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"
      }`}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        Regime
      </span>
      {cri && (
        <span title="Crash Risk Index — CTA deleveraging risk (VIX/VVIX/COR1M/SPX vs 100d MA)">
          CRI{" "}
          <span className={`font-medium ${bandClass(cri.band, cri.stale)}`}>
            {cri.band}
            {cri.score !== null && ` ${cri.score}`}
          </span>
          {cri.crashTriggered && (
            <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
              · CRASH TRIGGER
            </span>
          )}
          {cri.vix !== null && <span className="text-muted-foreground"> · VIX {cri.vix}</span>}
        </span>
      )}
      {vcg && (
        <span title="Volatility-Credit Gap — vol vs cash-credit divergence (risk-off early warning)">
          VCG{" "}
          <span className={`font-medium ${bandClass(vcg.band, vcg.stale)}`}>{vcg.band}</span>
          {vcg.regime && vcg.regime !== vcg.band && (
            <span className="text-muted-foreground"> · {vcg.regime.toLowerCase()}</span>
          )}
        </span>
      )}
      <span className="ml-auto text-muted-foreground">
        {newest.stale ? "⚠ stale — " : ""}
        {formatRelativeTime(newest.scanTime)}
      </span>
    </section>
  );
}
