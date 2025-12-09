import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StrategyTabs } from "@/components/layout/StrategyTabs";
import { PlaybookSidebar } from "@/components/strategies/PlaybookSidebar";
import { TriageActionButtons } from "@/components/triage/TriageActionButtons";
import { PositionList } from "@/components/triage/PositionList";
import { Badge } from "@/components/ui/badge";
import { getStrategyDetail } from "@/db/queries/strategies";
import { getTriageQueueForStrategy } from "@/db/queries/triage";
import { formatCurrency, formatDateShort, formatPercent } from "@/lib/formatters";

interface TriagePageProps {
  params: Promise<{ strategyId: string }>;
  searchParams?: Promise<{
    severity?: string;
    context?: string;
  }>;
}

const SEVERITY_FILTERS = ["all", "urgent", "attention", "monitor", "info", "pending", "complete"] as const;
const CONTEXT_FILTERS = ["all", "strategy", "position", "underlying", "account"] as const;

export default async function TriagePage({ params, searchParams }: TriagePageProps) {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;

  const searchParamsResolved = await searchParams;
  const severityFilter = (searchParamsResolved?.severity ?? "all").toLowerCase();
  const contextFilter = (searchParamsResolved?.context ?? "all").toLowerCase();

  const queue = await getTriageQueueForStrategy(strategyId, {
    severity: severityFilter,
    contextLevel: contextFilter,
  });

  // Count by severity
  const severityCounts = {
    urgent: queue.records.filter((r) => r.severity === "urgent").length,
    attention: queue.records.filter((r) => r.severity === "attention").length,
    monitor: queue.records.filter((r) => r.severity === "monitor").length,
    info: queue.records.filter((r) => r.severity === "info").length,
    pending: queue.records.filter((r) => r.severity === "pending").length,
    complete: queue.records.filter((r) => r.severity === "complete").length,
  };

  // Count by context
  const contextCounts = {
    strategy: queue.records.filter((r) => r.contextLevel === "strategy").length,
    position: queue.records.filter((r) => r.contextLevel === "position").length,
    underlying: queue.records.filter((r) => r.contextLevel === "underlying").length,
    account: queue.records.filter((r) => r.contextLevel === "account").length,
  };

  return (
    <DashboardShell
      activeNav="strategies"
      title={
        <div className="flex items-center gap-4">
          <span>{strategy.label ?? strategy.strategyKey}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {strategy.strategyKey} · {strategy.accountLabel ?? strategy.accountBrokerId ?? "Unassigned"}
          </span>
        </div>
      }
      tabs={<StrategyTabs strategyId={strategyId} />}
    >
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FilterGroup
            label="Severity"
            options={SEVERITY_FILTERS}
            active={severityFilter}
            paramKey="severity"
            params={{ severity: severityFilter, context: contextFilter }}
            counts={severityCounts}
            strategyId={strategyId}
          />
          <FilterGroup
            label="Context"
            options={CONTEXT_FILTERS}
            active={contextFilter}
            paramKey="context"
            params={{ severity: severityFilter, context: contextFilter }}
            counts={contextCounts}
            strategyId={strategyId}
          />
          <span className="ml-auto text-xs text-slate-400">
            {queue.records.length} flags
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_28rem] items-start">
        <section className="grid gap-4">
          {queue.records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">
              No triage flags match the selected filters.
            </div>
          ) : (
            queue.records.map((record) => (
              <article
                key={record.id}
                className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                {/* Title and Header Row */}
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {record.symbol}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {record.recommendedAction || "Review"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <SeverityTag severity={record.severity} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {record.contextLevel}
                    </span>
                    <span className="text-slate-400">
                      {formatDateShort(record.snapshotDate)} · {record.dte ?? "—"} DTE
                    </span>
                  </div>
                </div>

                {/* Positions List */}
                <PositionList
                  positionId={record.positionId}
                  strategyId={record.strategyId}
                />

                {/* Notes */}
                {record.notes && (
                  <p className="mt-3 text-sm text-slate-600">{record.notes}</p>
                )}

                {/* Metrics Grid */}
                <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Abs notional</dt>
                    <dd className="font-medium">{formatCurrency(record.absNotional)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Unrealized</dt>
                    <dd
                      className={
                        record.unrealizedPnl && record.unrealizedPnl >= 0
                          ? "font-medium text-emerald-600"
                          : "font-medium text-rose-600"
                      }
                    >
                      {formatCurrency(record.unrealizedPnl)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">% NAV</dt>
                    <dd className="font-medium">{formatPercent(record.pctNavAbsNotional)}</dd>
                  </div>
                </dl>

                {/* Action Buttons */}
                <TriageActionButtons
                  triageId={record.id}
                  contextLevel={record.contextLevel}
                  recommendedAction={record.recommendedAction}
                  strategyId={record.strategyId}
                  positionId={record.positionId}
                  severity={record.severity}
                />
              </article>
            ))
          )}
        </section>

        <PlaybookSidebar
          strategy={{
            strategyType: strategy.strategyType,
            templateLabel: strategy.templateLabel,
            underlyingTicker: strategy.underlyingTicker,
            openedAt: strategy.openedAt,
            status: strategy.status,
          }}
          currentStateCode={detail.currentStateCode}
          currentPlaybookItem={detail.currentPlaybookItem}
          strategyMetadata={{
            thesis: strategy.thesis,
            profitRules: strategy.profitRules,
            defenseRules: strategy.defenseRules,
            timeRules: strategy.timeRules,
          }}
        />
      </div>
    </DashboardShell>
  );
}

function FilterGroup({
  label,
  options,
  active,
  paramKey,
  params,
  counts,
  strategyId,
}: {
  label: string;
  options: readonly string[];
  active: string;
  paramKey: "severity" | "context";
  params: { severity: string; context: string };
  counts?: Record<string, number>;
  strategyId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const count = counts?.[option];
          return (
            <Link
              key={option}
              href={buildFilterHref({
                ...params,
                [paramKey]: option,
                strategyId,
              })}
              className={`rounded-full px-3 py-1 font-medium ${
                active === option
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option}
              {count !== undefined && count > 0 && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function buildFilterHref({
  severity,
  context,
  strategyId,
}: {
  severity: string;
  context: string;
  strategyId: string;
}) {
  const params = new URLSearchParams();
  const resolvedSeverity = severity || "all";
  const resolvedContext = context || "all";

  if (resolvedSeverity !== "all") {
    params.set("severity", resolvedSeverity);
  }

  if (resolvedContext !== "all") {
    params.set("context", resolvedContext);
  }

  const query = params.toString();
  return `/strategies/${strategyId}/triage${query ? `?${query}` : ""}`;
}

function SeverityTag({ severity }: { severity: string | null }) {
  const normalized = severity ?? "info";
  const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    urgent: "destructive",
    attention: "secondary",
    monitor: "secondary",
    info: "outline",
    pending: "secondary",
    complete: "secondary",
  };
  
  const classNameMap: Record<string, string> = {
    urgent: "bg-rose-100 text-rose-700 border-rose-200",
    attention: "bg-amber-100 text-amber-700 border-amber-200",
    monitor: "bg-blue-100 text-blue-700 border-blue-200",
    info: "bg-slate-200 text-slate-700 border-slate-300",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    complete: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  
  return (
    <Badge
      variant={variantMap[normalized] ?? "outline"}
      className={`text-[11px] font-medium ${classNameMap[normalized] ?? classNameMap.info}`}
    >
      {normalized}
    </Badge>
  );
}
