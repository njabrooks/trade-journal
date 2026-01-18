import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategySidebar } from '@/components/strategies/StrategySidebar';
import { Sparkline } from '@/components/charts/Sparkline';
import { getStrategyDetail } from '@/db/queries/strategies';
import { getTriageQueueForStrategy } from '@/db/queries/triage';
import { db } from '@/db';
import { signals } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { formatCurrency, formatDateLabel, formatPercent } from '@/lib/formatters';
import { EntityStatusBadge } from '@/components/ui/badge';

interface OverviewPageProps {
  params: Promise<{ strategyId: string }>;
}

export async function generateMetadata({ params }: OverviewPageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Overview`,
  };
}

export default async function StrategyOverviewPage({ params }: OverviewPageProps) {
  const { strategyId } = await params;

  const [detail, triageData, strategySignals] = await Promise.all([
    getStrategyDetail(strategyId),
    getTriageQueueForStrategy(strategyId, {}),
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

  const pnlSparkline = detail.metricsTimeline.map((point) => ({
    label: formatDateLabel(point.snapshotDate),
    value: point.totalUnrealizedPnl,
  }));

  const notionalSparkline = detail.metricsTimeline.map((point) => ({
    label: formatDateLabel(point.snapshotDate),
    value: point.totalAbsNotional,
  }));

  const statusBadge = <EntityStatusBadge status={strategy.status} />;

  return (
    <EntityDetailLayout
      title={strategy.label ?? strategy.strategyKey}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Strategy
          <span className="font-mono text-slate-600">
            ({strategy.strategyKey})
          </span>
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

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Abs Notional" value={formatCurrency(latestMetrics?.totalAbsNotional ?? null)} />
        <Metric
          label="Unrealized PnL"
          value={formatCurrency(latestMetrics?.totalUnrealizedPnl ?? null)}
          valueClass={
            latestMetrics && (latestMetrics.totalUnrealizedPnl ?? 0) >= 0
              ? 'text-emerald-600'
              : 'text-rose-600'
          }
        />
        <Metric label="Pct NAV" value={formatPercent(latestMetrics?.pctNavAbsNotional ?? null)} />
        <Metric label="Open Positions" value={openPositionCount.toString()} />
      </div>

      {/* PnL Timeline */}
      <EntitySection title="Performance">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-slate-500">PnL Timeline</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatCurrency(latestMetrics?.totalUnrealizedPnl ?? null)}
            </p>
          </div>
          <span className="text-xs text-slate-400">{pnlSparkline.length} pts</span>
        </div>
        <div className="h-32">
          <Sparkline data={pnlSparkline} stroke="#0ea5e9" />
        </div>
        <div className="mt-6 border-t pt-4">
          <p className="text-sm font-medium text-slate-500">Abs Notional</p>
          <div className="mt-2 h-32">
            <Sparkline data={notionalSparkline} stroke="#2563eb" />
          </div>
        </div>
      </EntitySection>

      {/* Open Positions */}
      <EntitySection title={`Open Positions (${detail.openPositions.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Abs Notional</th>
                <th className="py-2">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {detail.openPositions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No open positions assigned to this strategy.
                  </td>
                </tr>
              ) : (
                detail.openPositions.map((position) => (
                  <tr key={position.id}>
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      {position.symbol}
                      {position.expiry ? ` · ${position.expiry}` : ''}
                    </td>
                    <td className="py-2 pr-4">{position.quantity}</td>
                    <td className="py-2 pr-4">{formatCurrency(position.absNotional ?? null)}</td>
                    <td className="py-2">
                      <span
                        className={
                          position.unrealizedPnl && position.unrealizedPnl >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }
                      >
                        {formatCurrency(position.unrealizedPnl ?? null)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </EntitySection>

      {/* Recent Trades */}
      <EntitySection title={`Recent Trades (${detail.recentTrades.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Side</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2">Gross</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {detail.recentTrades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No trades linked to this strategy.
                  </td>
                </tr>
              ) : (
                detail.recentTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {trade.tradeDate
                        ? new Date(trade.tradeDate).toLocaleDateString('en-GB')
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 font-medium">{trade.side}</td>
                    <td className="py-2 pr-4">{trade.quantity}</td>
                    <td className="py-2 pr-4">{trade.price.toFixed(2)}</td>
                    <td className="py-2 pr-4">{trade.symbol}</td>
                    <td className="py-2">{formatCurrency(trade.grossAmount ?? null)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </EntitySection>
    </EntityDetailLayout>
  );
}

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClass ?? 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
