import { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getAdvisorBatches, getAdvisorScenarioSummary } from "@/db/queries/advisor";
import type { AdvisorHistoryRec } from "@/db/queries/advisor";

export const metadata: Metadata = { title: "Options Advisor" };
export const dynamic = "force-dynamic";

const SCENARIO_LABELS: Record<string, string> = {
  hedge: "Hedge",
  income: "Income",
  put_entry: "Put entry",
  leap_entry: "LEAP entry",
  collar: "Collar",
  risk_reversal: "Risk reversal",
  opportunistic: "Opportunistic",
};

const STRUCTURE_LABELS: Record<string, string> = {
  protective_put: "put",
  put_spread: "put spread",
  covered_call: "covered call",
  cash_secured_put: "cash-secured put",
  long_leap_call: "LEAP call",
  collar: "collar",
  risk_reversal: "risk reversal",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  acted: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  dismissed: "bg-zinc-500/15 text-muted-foreground",
  superseded: "bg-zinc-500/15 text-muted-foreground",
  expired: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function displayStatus(rec: AdvisorHistoryRec): string {
  if (rec.status === "active" && rec.expiresAt && new Date(rec.expiresAt) < new Date()) {
    return "expired";
  }
  return rec.status;
}

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function fmtUsd(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

function structureLine(rec: AdvisorHistoryRec): string {
  const legs = rec.structure?.legs ?? [];
  const strikes = legs.map((l) => l.strike).join("/");
  const kind = STRUCTURE_LABELS[rec.structure?.type ?? ""] ?? rec.structure?.type ?? "";
  const expiry = legs[0]?.expiry ? String(legs[0].expiry) : "";
  return `${strikes} ${kind} ${expiry}`.trim();
}

function MetricGrid({ metrics }: { metrics: Record<string, number | null> | null }) {
  if (!metrics) return null;
  const entries = Object.entries(metrics).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-4">
      {entries.map(([k, v]) => (
        <div key={k} className="text-xs">
          <span className="text-muted-foreground">{k}</span>{" "}
          <span className="font-medium tabular-nums">
            {typeof v === "number" ? (Math.abs(v) < 1 ? v.toFixed(4) : v.toLocaleString()) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecCard({ rec }: { rec: AdvisorHistoryRec }) {
  const status = displayStatus(rec);
  const outcome = rec.outcome as { win?: boolean; realizedPnlPerShare?: number } | null;
  return (
    <details className="group rounded-lg border border-border bg-background/50 px-3 py-2">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold">{rec.ticker}</span>
        <span className="text-muted-foreground">{structureLine(rec)}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status] ?? "bg-muted"}`}
        >
          {status}
        </span>
        {outcome && typeof outcome.win === "boolean" && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              outcome.win
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/15 text-red-600 dark:text-red-400"
            }`}
            title="Lane C outcome score at expiry"
          >
            {outcome.win ? "win" : "loss"}
          </span>
        )}
        {rec.exposureUsd !== null && rec.exposureUsd > 0 && (
          <span className="text-xs text-muted-foreground">
            {fmtUsd(rec.exposureUsd)}
            {rec.pctNav ? ` · ${(rec.pctNav * 100).toFixed(1)}% NAV` : ""}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="mt-2 border-t border-border pt-2">
        <p className="text-sm leading-relaxed">{rec.rationale}</p>
        {(rec.structure?.legs?.length ?? 0) > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-3 font-medium">action</th>
                  <th className="pr-3 font-medium">right</th>
                  <th className="pr-3 font-medium">strike</th>
                  <th className="pr-3 font-medium">expiry</th>
                  <th className="pr-3 font-medium">mid</th>
                  <th className="pr-3 font-medium">delta</th>
                  <th className="font-medium">IV</th>
                </tr>
              </thead>
              <tbody>
                {rec.structure!.legs!.map((l, i) => (
                  <tr key={i} className="tabular-nums">
                    <td className="pr-3">{String(l.action ?? "")}</td>
                    <td className="pr-3">{String(l.right ?? "")}</td>
                    <td className="pr-3">{String(l.strike ?? "")}</td>
                    <td className="pr-3">{String(l.expiry ?? "")}</td>
                    <td className="pr-3">{l.mid != null ? String(l.mid) : "—"}</td>
                    <td className="pr-3">{l.delta != null ? Number(l.delta).toFixed(2) : "—"}</td>
                    <td>{l.iv != null ? `${(Number(l.iv) * 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <MetricGrid metrics={rec.metrics} />
        {rec.actedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Acted {fmtDateTime(rec.actedAt)}
            {outcome?.realizedPnlPerShare != null &&
              ` · realized ${Number(outcome.realizedPnlPerShare).toFixed(2)}/share at expiry`}
          </p>
        )}
      </div>
    </details>
  );
}

export default async function AdvisorPage() {
  const [batches, summary] = [await getAdvisorBatches(90), await getAdvisorScenarioSummary(180)];

  const totalRecs = batches.reduce((a, b) => a + b.recs.length, 0);

  return (
    <DashboardShell
      activeNav="advisor"
      title="Options Advisor"
      subtitle={`${batches.length} batches · ${totalRecs} recommendations in the last 90 days`}
    >
      {/* Sub-surfaces: the vol scanner feeds the advisor's vol context; strike
          reports are the per-name deep-dive. Linked here, not sidebar peers. */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/vol-curve"
          className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Vol scanner &amp; strike reports →
        </Link>
        <span className="text-xs text-muted-foreground">
          The daily 50-ticker scan supplies each recommendation&apos;s vol context; scheduled
          producers run 08:05 (six scenarios) and 15:20 (LEAP) on weekdays.
        </span>
      </div>

      {/* Lane C hit-rates */}
      {summary.length > 0 && (
        <section className="rounded-2xl border bg-card p-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Outcomes by scenario (180d, acted &amp; scored)
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {summary.map((s) => (
              <div key={s.scenario} className="tabular-nums">
                <span className="font-medium">{SCENARIO_LABELS[s.scenario] ?? s.scenario}</span>{" "}
                <span className="text-muted-foreground">
                  {s.acted} acted · {s.scored} scored
                  {s.scored > 0 ? ` · ${Math.round((s.wins / s.scored) * 100)}% win` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Batch timeline */}
      {batches.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          No advisor batches in the last 90 days — run /options-advisor or wait for the 08:05
          scheduled producer.
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => (
            <section key={batch.batchId} className="rounded-2xl border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">
                  {SCENARIO_LABELS[batch.scenario] ?? batch.scenario}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {fmtDateTime(batch.createdAt)} · {batch.recs.length} rec
                  {batch.recs.length === 1 ? "" : "s"} · source: {batch.source}
                  {batch.expiresAt ? ` · expires ${fmtDateTime(batch.expiresAt)}` : ""}
                </span>
              </div>
              <div className="space-y-2">
                {batch.recs.map((rec) => (
                  <RecCard key={rec.id} rec={rec} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
