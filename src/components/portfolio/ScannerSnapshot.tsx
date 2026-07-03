"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Check, ShieldCheck, X } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";

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

interface AdvisorLeg {
  action: string;
  strike: number;
  expiry: string;
  mid: number;
}

interface AdvisorRecommendation {
  id: string;
  scenario: string;
  ticker: string;
  exposureUsd: number | null;
  pctNav: number | null;
  structure: { type: string; legs: AdvisorLeg[] };
  metrics: {
    costPct?: number;
    premiumYieldPct?: number;
    yieldOnCollateralPct?: number;
    protectionLevel?: number;
    dte?: number;
  };
  rationale: string;
}

/** Lane C — per-scenario hit-rate tallies from the outcome scoring pass. */
interface AdvisorScenarioSummary {
  scenario: string;
  acted: number;
  expired: number;
  dismissed: number;
  scored: number;
  hitRate: number | null;
}

function summaryLine(s: AdvisorScenarioSummary | undefined): string | null {
  if (!s) return null;
  const total = s.acted + s.expired + s.dismissed;
  if (total === 0) return null;
  const parts = [`${s.acted} acted`, `${s.expired} expired`, `${s.dismissed} dismissed`];
  if (s.hitRate !== null) parts.push(`${Math.round(s.hitRate * 100)}% hit`);
  return parts.join(" · ");
}

const STRUCTURE_LABELS: Record<string, string> = {
  protective_put: "put",
  put_spread: "put spread",
  covered_call: "covered call",
  cash_secured_put: "cash-secured put",
};

const SCENARIO_LABELS: Record<string, string> = {
  hedge: "Hedge",
  income: "Income",
  put_entry: "Put entry",
  opportunistic: "Opportunistic",
};

function describeStructure(rec: AdvisorRecommendation): string {
  const legs = rec.structure?.legs ?? [];
  const expiry = legs[0]?.expiry ? formatDateShort(legs[0].expiry) : "";
  const strikes = legs.map((l) => l.strike).join("/");
  const kind = STRUCTURE_LABELS[rec.structure?.type] ?? rec.structure?.type ?? "";
  // one headline number per scenario: cost (hedge) or yield (income/put-entry)
  const pct =
    rec.metrics?.costPct ?? rec.metrics?.premiumYieldPct ?? rec.metrics?.yieldOnCollateralPct;
  const pctLabel = pct != null ? ` · ${(pct * 100).toFixed(1)}%` : "";
  return `${strikes} ${kind} ${expiry}${pctLabel}`;
}

const TOP_N = 5;

/**
 * Morning-screen scanner module — top cheap-vol hits from the latest daily
 * scan. The options-advisor recommendations slot in here when W7 lands.
 */
export function ScannerSnapshot() {
  const [data, setData] = useState<ScannerTodayData | null>(null);
  const [recs, setRecs] = useState<AdvisorRecommendation[]>([]);
  const [summary, setSummary] = useState<AdvisorScenarioSummary[]>([]);

  useEffect(() => {
    fetch("/api/vol-curve/scanner-today")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
    fetch("/api/advisor/recommendations")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        setRecs(d?.recommendations ?? []);
        setSummary(d?.summary ?? []);
      })
      .catch(() => {});
  }, []);

  const updateRec = useCallback(async (id: string, status: "dismissed" | "acted") => {
    setRecs((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/advisor/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
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

      {/* Advisor recommendations (D11), grouped by scenario */}
      {recs.length > 0 && (
        <div className="mb-4 space-y-3 border-b pb-4">
          {[...new Set(recs.map((r) => r.scenario))].map((scenario) => {
            const hitLine = summaryLine(summary.find((s) => s.scenario === scenario));
            return (
              <div key={scenario} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Advisor — {SCENARIO_LABELS[scenario] ?? scenario}
                  </span>
                  {hitLine && (
                    <span
                      className="ml-auto text-[10px] tabular-nums text-muted-foreground"
                      title="How past recommendations in this scenario resolved (last 180 days); hit rate is over scored acted structures"
                    >
                      {hitLine}
                    </span>
                  )}
                </div>
                {recs
                  .filter((r) => r.scenario === scenario)
                  .map((rec) => (
                    <div key={rec.id} className="flex items-start gap-2 text-sm">
                      <span className="w-14 shrink-0 font-mono text-xs font-medium">
                        {rec.ticker}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span title={rec.rationale}>{describeStructure(rec)}</span>
                        {rec.exposureUsd !== null && rec.exposureUsd > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            on {formatCurrency(rec.exposureUsd)}
                            {rec.pctNav !== null && ` (${(rec.pctNav * 100).toFixed(1)}% NAV)`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRec(rec.id, "acted")}
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600 dark:hover:text-emerald-400"
                        title="Record action — I traded this (writes a trade_action journal entry)"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRec(rec.id, "dismissed")}
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

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
