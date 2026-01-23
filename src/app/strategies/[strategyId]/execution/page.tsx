import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategySidebar } from '@/components/strategies/StrategySidebar';
import { UnifiedTriageBrowser } from '@/components/triage/UnifiedTriageBrowser';
import { getStrategyDetail } from '@/db/queries/strategies';
import { getUnifiedTriageQueue } from '@/db/queries/triage';
import { db } from '@/db';
import { signals } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { EntityStatusBadge } from '@/components/ui/badge';

interface ExecutionPageProps {
  params: Promise<{ strategyId: string }>;
}

export async function generateMetadata({ params }: ExecutionPageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Execution`,
  };
}

export default async function StrategyExecutionPage({ params }: ExecutionPageProps) {
  const { strategyId } = await params;

  const [detail, strategySignals, triageResult] = await Promise.all([
    getStrategyDetail(strategyId),
    db
      .select()
      .from(signals)
      .where(and(eq(signals.entityType, 'strategy'), eq(signals.strategyId, strategyId))),
    // Fetch strategy-specific triage records using unified query
    getUnifiedTriageQueue({ strategyId, includeAll: true }),
  ]);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;
  const latestMetrics = detail.metricsTimeline.at(-1);
  const openPositionCount = latestMetrics?.numOpenPositions ?? detail.openPositions.length ?? 0;

  const statusBadge = <EntityStatusBadge status={strategy.status} />;

  return (
    <EntityDetailLayout
      title={strategy.label ?? strategy.strategyKey}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Strategy
          <span className="font-mono text-muted-foreground">({strategy.strategyKey})</span>
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
            direction: strategy.direction,
            assetThesisId: strategy.assetThesisId,
          }}
          openPositionsCount={openPositionCount}
          triageCount={triageResult.records.length}
          signalsCount={strategySignals.length}
          linkedMacroTheses={strategy.linkedMacroTheses.map((mt) => ({ id: mt.id, title: mt.title }))}
          linkedAssetThesis={strategy.assetThesisId ? { id: strategy.assetThesisId, title: strategy.assetViewTitle || 'Asset Thesis', ticker: strategy.underlyingTicker } : null}
        />
      }
    >
      {/* Triage Queue */}
      <EntitySection title="Triage Queue">
        <UnifiedTriageBrowser
          records={triageResult.records}
          counts={triageResult.counts}
          strategyId={strategyId}
        />
      </EntitySection>
    </EntityDetailLayout>
  );
}
