import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StrategyTabs } from "@/components/layout/StrategyTabs";
import { PlaybookSidebar } from "@/components/strategies/PlaybookSidebar";
import { TriageFilters } from "@/components/triage/TriageFilters";
import { TriageTableRow } from "@/components/triage/TriageTableRow";
import { SortableHeader } from "@/components/triage/SortableHeader";
import { getStrategyDetail } from "@/db/queries/strategies";
import { getTriageQueueForStrategy } from "@/db/queries/triage";
import { ALL_SEVERITIES, ALL_CONTEXTS, ALL_TRIGGERS } from "@/lib/constants/triage";

interface TriagePageProps {
  params: Promise<{ strategyId: string }>;
  searchParams?: Promise<{
    severity?: string | string[];
    contextLevel?: string | string[];
    context?: string | string[]; // Legacy support
    recommendedAction?: string | string[];
    trigger?: string | string[]; // Legacy support
    sort?: string;
    direction?: "asc" | "desc";
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

  const sortParam = searchParamsResolved?.sort;
  const directionParam = searchParamsResolved?.direction as "asc" | "desc" | undefined;

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
    sort: sortParam,
    direction: directionParam,
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
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            {queue.records.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                No triage flags match the selected filters.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <SortableHeader column="symbol" className="text-left">
                      Symbol
                    </SortableHeader>
                    <SortableHeader column="recommendedAction" className="text-left">
                      Trigger
                    </SortableHeader>
                    <SortableHeader column="severity" className="text-center">
                      Severity
                    </SortableHeader>
                    <SortableHeader column="contextLevel" className="text-center">
                      Context
                    </SortableHeader>
                    <SortableHeader column="snapshotDate" className="text-center">
                      Date
                    </SortableHeader>
                    <SortableHeader column="dte" className="text-center">
                      DTE
                    </SortableHeader>
                    <th className="px-4 py-3 text-center text-xs uppercase tracking-wide text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queue.records.map((record) => (
                    <TriageTableRow key={record.id} record={record} showStrategyColumn={false} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
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

