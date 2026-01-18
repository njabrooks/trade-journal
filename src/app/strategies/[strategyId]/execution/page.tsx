import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategySidebar } from '@/components/strategies/StrategySidebar';
import { TriageFilters } from '@/components/triage/TriageFilters';
import { TriageTableRow } from '@/components/triage/TriageTableRow';
import { SortableHeader } from '@/components/triage/SortableHeader';
import { getStrategyDetail } from '@/db/queries/strategies';
import { getTriageQueueForStrategy } from '@/db/queries/triage';
import { db } from '@/db';
import { signals } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ALL_SEVERITIES, ALL_CONTEXTS, ALL_TRIGGERS } from '@/lib/constants/triage';
import { EntityStatusBadge } from '@/components/ui/badge';

interface ExecutionPageProps {
  params: Promise<{ strategyId: string }>;
  searchParams?: Promise<{
    severity?: string | string[];
    contextLevel?: string | string[];
    context?: string | string[]; // Legacy support
    recommendedAction?: string | string[];
    trigger?: string | string[]; // Legacy support
    sort?: string;
    direction?: 'asc' | 'desc';
  }>;
}

export async function generateMetadata({ params }: ExecutionPageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Execution`,
  };
}

export default async function StrategyExecutionPage({ params, searchParams }: ExecutionPageProps) {
  const { strategyId } = await params;

  const [detail, strategySignals] = await Promise.all([
    getStrategyDetail(strategyId),
    db
      .select()
      .from(signals)
      .where(and(eq(signals.entityType, 'strategy'), eq(signals.strategyId, strategyId))),
  ]);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;
  const latestMetrics = detail.metricsTimeline.at(-1);
  const openPositionCount = latestMetrics?.numOpenPositions ?? detail.openPositions.length ?? 0;

  const searchParamsResolved = await searchParams;

  // Parse multi-select filters (can be string or string[])
  const severityParam = searchParamsResolved?.severity;
  const severityFilter = Array.isArray(severityParam)
    ? severityParam
    : severityParam && severityParam !== 'all'
      ? [severityParam]
      : [];

  const contextParam = searchParamsResolved?.contextLevel || searchParamsResolved?.context;
  const contextFilter = Array.isArray(contextParam)
    ? contextParam
    : contextParam && contextParam !== 'all'
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
  const directionParam = searchParamsResolved?.direction as 'asc' | 'desc' | undefined;

  // Get all records first to extract unique values for dropdowns
  const allRecords = await getTriageQueueForStrategy(strategyId, {});

  // Use all available options (not just ones that exist in records)
  const allSeverities = [...ALL_SEVERITIES];
  const allContexts = [...ALL_CONTEXTS];
  const allTriggers = [...ALL_TRIGGERS];

  // Calculate counts for all options
  const severityCounts: Record<string, number> = {};
  allSeverities.forEach((severity) => {
    severityCounts[severity] = allRecords.records.filter((r) => r.severity === severity).length;
  });

  const contextCounts: Record<string, number> = {};
  allContexts.forEach((context) => {
    contextCounts[context] = allRecords.records.filter((r) => r.contextLevel === context).length;
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

  const statusBadge = <EntityStatusBadge status={strategy.status} />;

  return (
    <EntityDetailLayout
      title={strategy.label ?? strategy.strategyKey}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Strategy
          <span className="font-mono text-slate-600">({strategy.strategyKey})</span>
        </span>
      }
      statusBadge={statusBadge}
      tabs={<StrategyTabs strategyId={strategyId} />}
      activeNav="strategies"
      sidebar={
        <StrategySidebar
          strategy={{
            id: strategy.id,
            strategyKey: strategy.strategyKey,
            label: strategy.label,
            strategyType: strategy.strategyType,
            templateLabel: strategy.templateLabel,
            underlyingTicker: strategy.underlyingTicker,
            openedAt: strategy.openedAt,
            status: strategy.status,
          }}
          openPositionsCount={openPositionCount}
          triageCount={allRecords.records.length}
          signalsCount={strategySignals.length}
          linkedMacroTheses={strategy.linkedMacroTheses.map((mt) => ({ id: mt.id, title: mt.title }))}
          linkedAssetThesis={strategy.assetThesisId ? { id: strategy.assetThesisId, title: strategy.assetViewTitle || 'Asset Thesis', ticker: strategy.underlyingTicker } : null}
        />
      }
    >

      {/* Triage Filters */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
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
          basePath={`/strategies/${strategyId}/execution`}
        />
      </div>

      {/* Triage Queue */}
      <EntitySection title={`Triage Queue (${queue.records.length})`}>
        <div className="overflow-x-auto -mx-4 -mb-4">
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
      </EntitySection>
    </EntityDetailLayout>
  );
}
