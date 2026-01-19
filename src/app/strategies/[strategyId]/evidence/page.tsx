import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategySidebar } from '@/components/strategies/StrategySidebar';
import { StrategySignalsSection } from '@/components/signals/StrategySignalsSection';
import { getStrategyDetail } from '@/db/queries/strategies';
import { getTriageQueueForStrategy } from '@/db/queries/triage';
import { db } from '@/db';
import { signals, triageRecords } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { EntityStatusBadge } from '@/components/ui/badge';

interface EvidencePageProps {
  params: Promise<{ strategyId: string }>;
}

export async function generateMetadata({ params }: EvidencePageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Evidence`,
  };
}

export default async function StrategyEvidencePage({ params }: EvidencePageProps) {
  const { strategyId } = await params;

  const [detail, triageData, strategySignals, pendingDefineSignals] = await Promise.all([
    getStrategyDetail(strategyId),
    getTriageQueueForStrategy(strategyId, {}),
    db
      .select()
      .from(signals)
      .where(and(eq(signals.entityType, 'strategy'), eq(signals.strategyId, strategyId)))
      .orderBy(signals.createdAt),
    db
      .select()
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.recommendedAction, 'DEFINE_SIGNALS')
        )
      )
      .limit(1),
  ]);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;
  const latestMetrics = detail.metricsTimeline.at(-1);
  const openPositionCount = latestMetrics?.numOpenPositions ?? detail.openPositions.length ?? 0;

  const showDefinePrompt =
    pendingDefineSignals.length > 0 && pendingDefineSignals[0].status !== 'done';

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
          triageCount={triageData.records.length}
          signalsCount={strategySignals.length}
          linkedMacroTheses={strategy.linkedMacroTheses.map((mt) => ({ id: mt.id, title: mt.title }))}
          linkedAssetThesis={strategy.assetThesisId ? { id: strategy.assetThesisId, title: strategy.assetViewTitle || 'Asset Thesis', ticker: strategy.underlyingTicker } : null}
        />
      }
    >

      {/* Signals Section */}
      <EntitySection title={`Signals (${strategySignals.length})`}>
        <StrategySignalsSection
          strategyId={strategyId}
          strategyKey={strategy.strategyKey}
          underlyingTicker={strategy.underlyingTicker || undefined}
          signals={strategySignals}
          showDefinePrompt={showDefinePrompt}
        />
      </EntitySection>

      {/* Information Box */}
      <EntitySection title="About Strategy Signals">
        <p className="text-sm text-slate-600">
          Signals define trigger conditions for your strategy. When conditions are met, a triage
          record is created with the recommended action.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 font-medium">Take Profit</span>
            <span>signals trigger when favorable conditions are met (e.g., price targets, profit %)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-600 font-medium">Risk Alert</span>
            <span>signals trigger for risk management (e.g., stop loss, DTE thresholds)</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Price conditions require TradingView webhook integration. Position metrics (DTE, PnL%,
          sigma) are evaluated during triage computation.
        </p>
      </EntitySection>
    </EntityDetailLayout>
  );
}
