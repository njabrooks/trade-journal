import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StrategyTabs } from "@/components/layout/StrategyTabs";
import { PlaybookSidebar } from "@/components/strategies/PlaybookSidebar";
import { TriageActionButtons } from "@/components/triage/TriageActionButtons";
import { PositionList } from "@/components/triage/PositionList";
import { TriageFilters } from "@/components/triage/TriageFilters";
import { Badge } from "@/components/ui/badge";
import { getStrategyDetail } from "@/db/queries/strategies";
import { getTriageQueueForStrategy } from "@/db/queries/triage";
import { formatCurrency, formatDateShort, formatPercent } from "@/lib/formatters";
import { ALL_SEVERITIES, ALL_CONTEXTS, ALL_TRIGGERS } from "@/lib/constants/triage";

interface TriagePageProps {
  params: Promise<{ strategyId: string }>;
  searchParams?: Promise<{
    severity?: string | string[];
    contextLevel?: string | string[];
    context?: string | string[]; // Legacy support
    recommendedAction?: string | string[];
    trigger?: string | string[]; // Legacy support
  }>;
}

export default async function TriagePage({ params, searchParams }: TriagePageProps) {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;

  const searchParamsResolved = await searchParams;
  
  // Parse multi-select filters (can be string or string[])
  const severityParam = searchParamsResolved?.severity;
  const severityFilter = Array.isArray(severityParam)
    ? severityParam
    : severityParam && severityParam !== "all"
    ? [severityParam]
    : [];
  
  const contextParam = searchParamsResolved?.contextLevel || searchParamsResolved?.context;
  const contextFilter = Array.isArray(contextParam)
    ? contextParam
    : contextParam && contextParam !== "all"
    ? [contextParam]
    : [];
  
  // URL uses "recommendedAction" and supports legacy "trigger"
  const triggerParam = searchParamsResolved?.recommendedAction || searchParamsResolved?.trigger;
  const triggerFilter = Array.isArray(triggerParam) 
    ? triggerParam 
    : triggerParam 
    ? [triggerParam] 
    : [];

  // Get all records first to extract unique values for dropdowns
  const allRecords = await getTriageQueueForStrategy(strategyId, {});

  // Use all available options (not just ones that exist in records)
  const allSeverities = [...ALL_SEVERITIES];
  const allContexts = [...ALL_CONTEXTS];
  const allTriggers = [...ALL_TRIGGERS];

  // Calculate counts for all options
  const severityCounts: Record<string, number> = {};
  allSeverities.forEach((severity) => {
    severityCounts[severity] = allRecords.records.filter(
      (r) => r.severity === severity
    ).length;
  });

  const contextCounts: Record<string, number> = {};
  allContexts.forEach((context) => {
    contextCounts[context] = allRecords.records.filter(
      (r) => r.contextLevel === context
    ).length;
  });

  const triggerCounts: Record<string, number> = {};
  allTriggers.forEach((trigger) => {
    triggerCounts[trigger] = allRecords.records.filter(
      (r) => r.recommendedAction === trigger
    ).length;
  });

  // Now get filtered records
  const queue = await getTriageQueueForStrategy(strategyId, {
    severity: severityFilter.length > 0 ? severityFilter : undefined,
    contextLevel: contextFilter.length > 0 ? contextFilter : undefined,
    recommendedAction: triggerFilter.length > 0 ? triggerFilter : undefined,
  });

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
      <div className="border-b bg-white px-6 py-4 -mx-4 -mt-4">
        <TriageFilters
          severityFilter={severityFilter}
          contextFilter={contextFilter}
          triggerFilter={triggerFilter}
          strategyFilter={[]}
          allSeverities={allSeverities}
          allContexts={allContexts}
          allTriggers={allTriggers}
          allStrategies={[]}
          severityCounts={severityCounts}
          contextCounts={contextCounts}
          triggerCounts={triggerCounts}
          strategyCounts={{}}
          totalFlags={queue.records.length}
          basePath={`/strategies/${strategyId}/triage`}
        />
      </div>

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
