import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { ClientHierarchyBreadcrumb } from '@/components/ui/ClientHierarchyBreadcrumb';
import { StrategySignalsSection } from '@/components/signals/StrategySignalsSection';
import { getStrategyDetail } from '@/db/queries/strategies';
import { db } from '@/db';
import { signals, triageRecords } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

interface SignalsPageProps {
  params: Promise<{ strategyId: string }>;
}

export async function generateMetadata({ params }: SignalsPageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Signals`,
  };
}

export default async function SignalsPage({ params }: SignalsPageProps) {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;

  // Fetch signals for this strategy
  const strategySignals = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.entityType, 'strategy'),
        eq(signals.strategyId, strategyId)
      )
    )
    .orderBy(signals.createdAt);

  // Check if DEFINE_SIGNALS triage is pending
  const pendingDefineSignals = await db
    .select()
    .from(triageRecords)
    .where(
      and(
        eq(triageRecords.strategyId, strategyId),
        eq(triageRecords.recommendedAction, 'DEFINE_SIGNALS')
      )
    )
    .limit(1);

  const showDefinePrompt =
    pendingDefineSignals.length > 0 &&
    pendingDefineSignals[0].severity !== 'complete';

  return (
    <DashboardShell
      activeNav="strategies"
      title={
        <div className="flex items-center gap-4">
          <span>{strategy.label ?? strategy.strategyKey}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {strategy.strategyKey} · {strategy.accountLabel ?? strategy.accountBrokerId ?? 'Unassigned'}
          </span>
        </div>
      }
      tabs={<StrategyTabs strategyId={strategyId} />}
    >
      {/* Enhanced Hierarchy Breadcrumb */}
      <ClientHierarchyBreadcrumb
        macroThesis={
          strategy.linkedMacroTheses.length > 0
            ? { id: strategy.linkedMacroTheses[0].id, title: strategy.linkedMacroTheses[0].title }
            : null
        }
        assetView={
          strategy.assetThesisId
            ? { id: strategy.assetThesisId, title: strategy.assetViewTitle || 'Asset Thesis' }
            : null
        }
        strategy={{
          id: strategy.id,
          title: strategy.label || strategy.strategyKey,
        }}
        currentLevel="strategy"
      />

      <div className="max-w-4xl">
        <StrategySignalsSection
          strategyId={strategyId}
          strategyKey={strategy.strategyKey}
          underlyingTicker={strategy.underlyingTicker || undefined}
          signals={strategySignals}
          showDefinePrompt={showDefinePrompt}
        />

        {/* Information Box */}
        <div className="mt-6 bg-slate-50 rounded-lg p-4 border border-slate-200">
          <h4 className="text-sm font-medium text-slate-700 mb-2">About Strategy Signals</h4>
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
            Price conditions require TradingView webhook integration. Position metrics (DTE, PnL%, sigma)
            are evaluated during triage computation.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
