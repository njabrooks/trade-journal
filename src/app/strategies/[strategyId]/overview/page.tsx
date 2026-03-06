import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategySidebar } from '@/components/strategies/StrategySidebar';
import { StrategyOverviewCharts } from '@/components/strategies/StrategyOverviewCharts';
import { StrategySignalsSection } from '@/components/signals/StrategySignalsSection';
import { getCachedStrategyDetail } from '@/db/queries/cached';
import { getTriageQueueForStrategy } from '@/db/queries/triage';
import { db } from '@/db';
import { signals, triageRecords } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { formatCurrency } from '@/lib/formatters';
import { EntityStatusBadge } from '@/components/ui/badge';

interface OverviewPageProps {
  params: Promise<{ strategyId: string }>;
}

export async function generateMetadata({ params }: OverviewPageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getCachedStrategyDetail(strategyId);

  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Overview`,
  };
}

export default async function StrategyOverviewPage({ params }: OverviewPageProps) {
  const { strategyId } = await params;

  const [detail, triageData, strategySignals, pendingDefineSignals] = await Promise.all([
    getCachedStrategyDetail(strategyId),
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

  const { strategy, liveMetrics } = detail;
  const openPositionCount = liveMetrics.openPositionsCount;
  const showDefinePrompt =
    pendingDefineSignals.length > 0 && pendingDefineSignals[0].status !== 'done';

  const statusBadge = <EntityStatusBadge status={strategy.status} />;

  return (
    <EntityDetailLayout
      title={strategy.label ?? strategy.strategyKey}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Strategy
          <span className="font-mono text-muted-foreground">
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
            closedAt: strategy.closedAt,
            status: strategy.status,
            direction: strategy.direction,
            assetThesisId: strategy.assetThesisId,
          }}
          openPositionsCount={openPositionCount}
          triageCount={triageData.records.length}
          signalsCount={strategySignals.length}
          linkedMacroTheses={strategy.linkedMacroTheses.map((mt) => ({ id: mt.id, title: mt.title }))}
          linkedAssetThesis={strategy.assetThesisId ? { id: strategy.assetThesisId, title: strategy.assetViewTitle || 'Asset Thesis', ticker: strategy.underlyingTicker } : null}
        />
      }
    >

      {/* Metric Cards (live from positions) + Performance Chart (historical snapshots) */}
      <StrategyOverviewCharts
        metricsTimeline={detail.metricsTimeline}
        liveMetrics={liveMetrics}
      />

      {/* Open Positions */}
      <EntitySection title={`Open Positions (${detail.openPositions.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2 pr-4">Account</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Mkt Value</th>
                <th className="py-2">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {detail.openPositions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No open positions assigned to this strategy.
                  </td>
                </tr>
              ) : (
                <>
                  {detail.openPositions.map((position) => (
                    <tr key={position.id}>
                      <td className="py-2 pr-4 font-medium text-foreground">
                        {position.symbol}
                        {position.expiry ? ` · ${position.expiry}` : ''}
                      </td>
                      <td className="py-2 pr-4 text-xs">{position.accountLabel ?? '—'}</td>
                      <td className="py-2 pr-4">{position.quantity}</td>
                      <td className="py-2 pr-4">{formatCurrency(position.marketValue ?? null)}</td>
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
                  ))}
                  <tr className="border-t-2 border-border font-semibold text-foreground">
                    <td className="py-2 pr-4" colSpan={2}>Total</td>
                    <td className="py-2 pr-4">
                      {detail.openPositions.reduce((sum, p) => sum + (p.quantity ?? 0), 0)}
                    </td>
                    <td className="py-2 pr-4">
                      {formatCurrency(detail.openPositions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0))}
                    </td>
                    <td className="py-2">
                      {(() => {
                        const totalPnl = detail.openPositions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
                        return (
                          <span className={totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatCurrency(totalPnl)}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </EntitySection>

      {/* Trades */}
      <EntitySection title={`Trades (${detail.trades.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Account</th>
                <th className="py-2 pr-4">Side</th>
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Avg Price</th>
                <th className="py-2">Gross</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {detail.trades.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No trades linked to this strategy.
                  </td>
                </tr>
              ) : (
                detail.trades.map((trade, i) => (
                  <tr key={`${trade.tradeDate}-${trade.accountLabel}-${trade.side}-${trade.symbol}-${i}`}>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {trade.tradeDate
                        ? new Date(trade.tradeDate).toLocaleDateString('en-GB')
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs">{trade.accountLabel ?? '—'}</td>
                    <td className="py-2 pr-4 font-medium">{trade.side}</td>
                    <td className="py-2 pr-4">{trade.symbol}</td>
                    <td className="py-2 pr-4">{trade.totalQuantity}</td>
                    <td className="py-2 pr-4">{formatCurrency(trade.avgPrice)}</td>
                    <td className="py-2">{formatCurrency(trade.totalGross ?? null)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {detail.trades.length > 0 && (
              <tfoot>
                <tr className="border-t border-border font-medium text-foreground">
                  <td className="py-2 pr-4" colSpan={4}>Total</td>
                  <td className="py-2 pr-4">
                    {detail.trades.reduce((sum, t) => sum + t.totalQuantity, 0).toFixed(5).replace(/\.?0+$/, '')}
                  </td>
                  <td className="py-2 pr-4">
                    {(() => {
                      const totalQty = detail.trades.reduce((sum, t) => sum + t.totalQuantity, 0);
                      const totalGross = detail.trades.reduce((sum, t) => sum + (t.totalGross ?? 0), 0);
                      return totalQty !== 0 ? formatCurrency(Math.abs(totalGross / totalQty)) : '—';
                    })()}
                  </td>
                  <td className="py-2">
                    {formatCurrency(detail.trades.reduce((sum, t) => sum + (t.totalGross ?? 0), 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </EntitySection>

      {/* Signals */}
      <EntitySection title={`Signals (${strategySignals.length})`}>
        <StrategySignalsSection
          strategyId={strategyId}
          strategyKey={strategy.strategyKey}
          underlyingTicker={strategy.underlyingTicker || undefined}
          signals={strategySignals}
          showDefinePrompt={showDefinePrompt}
        />
      </EntitySection>
    </EntityDetailLayout>
  );
}

