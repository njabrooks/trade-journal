'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  Target,
  Clock,
  Eye,
  Archive,
  Scale,
  ArrowLeft,
  ExternalLink,
  Settings2,
  Activity,
  FileText,
  Zap,
} from 'lucide-react';
import { EntityBadge } from '@/components/ui/entity-badge';
import { SignalCumulativeScoreChart } from '@/components/signals/SignalCumulativeScoreChart';
import { SignalSnapshotChart } from '@/components/signals/SignalSnapshotChart';
import { SignalMilestoneCard } from '@/components/signals/SignalMilestoneCard';
import { SignalLog } from '@/components/signals/SignalLog';
import { ParentThesisHealthPanel } from '@/components/signals/ParentThesisHealthPanel';
import type { DayScore } from '@/components/signals/SignalCumulativeScoreChart';
import type { SignalLogEntry } from '@/components/signals/SignalLog';
import type { SignalWithContext } from '@/db/queries/signals';
import {
  SIGNAL_TYPE_COLORS,
  IMPORTANCE_CONFIG,
  STATUS_COLORS,
  ASSESSMENT_LEVELS,
  SOURCE_LABELS,
  formatSnapshotValue,
} from '@/components/signals/signal-constants';

interface Snapshot {
  id: string;
  snapshotDate: string;
  assessment: string | null;
  evidenceSummary: string | null;
  dataSource: string;
  observedValue: number | null;
  thresholdValue: number | null;
  pctToThreshold: number | null;
  unit: string | null;
  status: string;
  claimId: string | null;
  intelligenceItemId?: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  confirmation: <CheckCircle2 className="w-3 h-3" />,
  invalidation: <AlertTriangle className="w-3 h-3" />,
  warning:      <AlertTriangle className="w-3 h-3" />,
  completion:   <Target className="w-3 h-3" />,
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft:    <Clock className="w-3 h-3" />,
  active:   <Eye className="w-3 h-3" />,
  complete: <CheckCircle2 className="w-3 h-3" />,
  rejected: <Archive className="w-3 h-3" />,
};

/** Parse a checkFrequency string like "daily", "weekly", "4h" into milliseconds */
function parseFrequencyMs(freq: string | undefined): number | null {
  if (!freq) return null;
  const lower = freq.toLowerCase().trim();
  if (lower === 'daily' || lower === '1d') return 24 * 60 * 60 * 1000;
  if (lower === 'weekly' || lower === '1w') return 7 * 24 * 60 * 60 * 1000;
  if (lower === 'monthly') return 30 * 24 * 60 * 60 * 1000;
  const match = lower.match(/^(\d+)\s*(h|d|w)$/);
  if (match) {
    const n = parseInt(match[1]);
    if (match[2] === 'h') return n * 60 * 60 * 1000;
    if (match[2] === 'd') return n * 24 * 60 * 60 * 1000;
    if (match[2] === 'w') return n * 7 * 24 * 60 * 60 * 1000;
  }
  return null;
}

/** Determine data source health: green/amber/red based on snapshot freshness vs expected frequency */
function getDataSourceHealth(
  latestSnapshotDate: string | Date | null,
  checkFrequency: string | undefined,
): { color: string; dotCls: string; label: string } | null {
  const intervalMs = parseFrequencyMs(checkFrequency);
  if (!intervalMs || !latestSnapshotDate) return null;
  const age = Date.now() - new Date(latestSnapshotDate).getTime();
  if (age <= intervalMs * 1.5) return { color: 'green', dotCls: 'bg-emerald-500', label: 'Healthy' };
  if (age <= intervalMs * 3) return { color: 'amber', dotCls: 'bg-amber-500', label: 'Overdue' };
  return { color: 'red', dotCls: 'bg-red-500', label: 'Stale' };
}

interface SignalDetailClientProps {
  signal: SignalWithContext;
}

export function SignalDetailClient({ signal }: SignalDetailClientProps) {
  const [dailyScores, setDailyScores] = useState<DayScore[]>([]);
  const [isLoadingScores, setIsLoadingScores] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    fetch(`/api/signals/${signal.id}/daily-scores`)
      .then(r => r.json())
      .then(data => setDailyScores(data.scores || []))
      .catch(() => {})
      .finally(() => setIsLoadingScores(false));
  }, [signal.id]);

  useEffect(() => {
    fetch(`/api/signals/${signal.id}/snapshots?days=10000`)
      .then(r => r.json())
      .then(data => setSnapshots((data.snapshots || []) as Snapshot[]))
      .catch(() => {});
  }, [signal.id]);

  const typeColors = SIGNAL_TYPE_COLORS[signal.type] ?? SIGNAL_TYPE_COLORS.confirmation;
  const typeIcon = TYPE_ICONS[signal.type] ?? TYPE_ICONS.confirmation;
  const statusCls = STATUS_COLORS[signal.status] ?? STATUS_COLORS.active;
  const statusIcon = STATUS_ICONS[signal.status] ?? STATUS_ICONS.active;
  const importanceCls = IMPORTANCE_CONFIG[signal.importance] ?? IMPORTANCE_CONFIG.supporting;

  const explicitDetails = signal.explicitDetails as {
    metric?: string;
    metricName?: string;
    label?: string;
    threshold?: string;
    dataSources?: string[];
    monitoringFrequency?: string;
    dataSource?: string;
    endpoint?: string;
    direction?: string;
    thresholdDirection?: string;
    display_type?: string;
    calculation?: string;
    checkFrequency?: string;
    conditions?: Array<{ label?: string; metric?: string; dataSource?: string }>;
  } | null;

  const linkedEntities = signal.entities.filter(e => e.entityLink);

  return (
    <div className="space-y-6">
      {/* Back links */}
      <div className="flex flex-wrap gap-3">
        {linkedEntities.length > 0 ? (
          linkedEntities.map((entity, i) => (
            <Link
              key={i}
              href={entity.entityLink!}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              {entity.entityTitle || 'Back'}
            </Link>
          ))
        ) : (
          <Link href="/signals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            All Signals
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {/* Badges */}
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeColors.cls}`}>
                {typeIcon}
                {typeColors.label}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${importanceCls}`}>
                {signal.importance}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                <Scale className="w-3 h-3" />
                {signal.category.replace('_', ' ')}
              </span>
            </div>

            {/* Statement */}
            <h1 className="text-xl font-semibold text-foreground mb-2">{signal.statement}</h1>

            {/* Notes */}
            {signal.notes && (
              <p className="text-muted-foreground whitespace-pre-wrap">{signal.notes}</p>
            )}
          </div>

          {/* Status */}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusCls}`}>
            {statusIcon}
            {signal.status}
          </span>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-sm text-muted-foreground flex-wrap">
          <span>Created: {new Date(signal.createdAt).toLocaleDateString('en-GB')}</span>
          {signal.updatedAt.getTime() !== signal.createdAt.getTime() && (
            <span>Updated: {new Date(signal.updatedAt).toLocaleDateString('en-GB')}</span>
          )}
          {/* Linked entities */}
          {signal.entities.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {signal.entities.map((entity, i) => {
                const entityType = entity.entityType === 'strategy' ? 'strategy'
                  : entity.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
                return (
                  <EntityBadge
                    key={i}
                    entityType={entityType as 'macro_thesis' | 'asset_thesis' | 'strategy'}
                    id={entity.thesisId || entity.strategyId || ''}
                    title={entity.entityTitle || 'Unknown'}
                    status={entity.entityStatus || undefined}
                    href={entity.entityLink || undefined}
                    size="sm"
                  />
                );
              })}
            </div>
          )}
          {/* Articulation provenance */}
          {signal.sourceSection && (
            <span className="text-xs text-muted-foreground">
              Derived from:{' '}
              {signal.sourceSection === 'key_driver' && `Key Driver #${(signal.sourceDriverIndex ?? 0) + 1}`}
              {signal.sourceSection === 'key_assumption' && `Key Assumption #${(signal.sourceDriverIndex ?? 0) + 1}`}
              {signal.sourceSection === 'timeframe' && 'Timeframe'}
              {signal.sourceSection === 'dependency' && `Dependency #${(signal.sourceDriverIndex ?? 0) + 1}`}
            </span>
          )}
        </div>
      </div>


      {/* Price Target Ladder (for consolidated strategy signals) */}
      {(() => {
        const details = signal.explicitDetails as Record<string, unknown> | null;
        if (details?.signalKind !== 'strategy_price_ladder') return null;
        const targets = (details.targets as Array<{
          label: string;
          price: number;
          denomination: string;
          positionPct: number | null;
          conditionType: string;
          status: string;
        }>) || [];
        if (targets.length === 0) return null;

        const tpTargets = targets.filter(t => t.conditionType === 'price_above');
        const slTargets = targets.filter(t => t.conditionType === 'price_below');

        function fmtPrice(price: number, denom: string) {
          if (denom === 'USD') return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
          return price.toPrecision(6);
        }

        return (
          <div className="bg-card rounded-lg border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">Price Target Ladder</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tpTargets.length} take-profit{slTargets.length > 0 ? `, ${slTargets.length} stop-loss` : ''}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Label</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 text-right font-medium">Position %</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...tpTargets, ...slTargets].map((target, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{target.label}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        target.conditionType === 'price_above'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}>
                        {target.conditionType === 'price_above' ? 'TP' : 'SL'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {fmtPrice(target.price, target.denomination)}
                      {target.denomination === 'BTC' && (
                        <span className="text-muted-foreground ml-1 text-xs">BTC</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {target.positionPct ? `${target.positionPct}%` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs ${
                        target.status === 'complete'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      }`}>
                        {target.status === 'complete'
                          ? <><CheckCircle2 className="w-3 h-3" /> Hit</>
                          : <><Clock className="w-3 h-3" /> Active</>
                        }
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Setup Completeness Card */}
      {(() => {
        const hasDataSource = !!explicitDetails;
        const snapshotCount = snapshots.length;
        const lastEvaluated = snapshots[0]?.snapshotDate
          ? new Date(snapshots[0].snapshotDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : null;
        const isJudgment = signal.category === 'judgment';
        const showSetupCard = isJudgment && !hasDataSource;

        // Data source health for configured signals
        const health = hasDataSource
          ? getDataSourceHealth(
              snapshots[0]?.snapshotDate || null,
              (explicitDetails as { checkFrequency?: string })?.checkFrequency,
            )
          : null;

        if (!showSetupCard && !health) return null;

        return (
          <div className="bg-card rounded-lg border p-4">
            {showSetupCard && (
              <div className="flex items-start gap-3">
                <Settings2 className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-foreground">Signal setup</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Statement defined
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-muted-foreground" /> No data source
                    </span>
                    <span className="flex items-center gap-1.5">
                      {snapshotCount > 0
                        ? <><Zap className="w-3 h-3 text-amber-500" /> {snapshotCount} evidence snapshot{snapshotCount !== 1 ? 's' : ''}</>
                        : <><Clock className="w-3 h-3 text-muted-foreground" /> No evidence yet</>
                      }
                    </span>
                    <span className="flex items-center gap-1.5">
                      {lastEvaluated
                        ? <><Activity className="w-3 h-3 text-blue-500" /> Last: {lastEvaluated}</>
                        : <><Clock className="w-3 h-3 text-muted-foreground" /> Never evaluated</>
                      }
                    </span>
                  </div>
                  <Link
                    href={`/signals/${signal.id}/configure`}
                    className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Settings2 className="w-3 h-3" />
                    Configure Data Source
                  </Link>
                </div>
              </div>
            )}
            {health && (
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${health.dotCls}`} />
                <span className="text-muted-foreground">Data source: <span className="font-medium text-foreground">{health.label}</span></span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Parent Thesis Health Panel (for cascade signals) */}
      {(() => {
        const details = signal.explicitDetails as Record<string, unknown> | null;
        const parentThesisId = details?.parentThesisId as string | undefined;
        if (!parentThesisId || details?.dataSource !== 'internal_db') return null;
        return <ParentThesisHealthPanel parentThesisId={parentThesisId} />;
      })()}

      {/* Signal Status + Tracking */}
      {(() => {
        // Classify snapshot data — group by data_source for multi-condition signals
        const allQuant = snapshots.filter(s =>
          s.observedValue !== null && !s.dataSource.startsWith('price_history')
        );
        const latestQual = snapshots.filter(s => s.assessment !== null)[0];

        // Group quantitative snapshots by data_source
        const quantGroups = new Map<string, Snapshot[]>();
        for (const s of allQuant) {
          const key = s.dataSource;
          if (!quantGroups.has(key)) quantGroups.set(key, []);
          quantGroups.get(key)!.push(s);
        }
        // Filter to groups that exclude thesis_monitor qualitative data
        const quantGroupEntries = Array.from(quantGroups.entries())
          .filter(([src]) => src !== 'thesis_monitor');

        // Primary group is the one matching explicitDetails.dataSource, or the largest group
        const primarySourceKey = explicitDetails?.dataSource;
        const primaryGroup = primarySourceKey && quantGroups.has(primarySourceKey)
          ? quantGroups.get(primarySourceKey)!
          : quantGroupEntries[0]?.[1] || [];
        const latestQuant = primaryGroup[0];
        const latestAny = latestQuant || latestQual;

        // Build label map for each data source from explicitDetails
        const sourceLabelMap = new Map<string, string>();
        if (explicitDetails?.label) {
          sourceLabelMap.set(explicitDetails.dataSource || 'primary', explicitDetails.label);
        }
        if (explicitDetails?.conditions) {
          for (const cond of explicitDetails.conditions) {
            if (cond.label && cond.dataSource) {
              // The collector appends the normalized label to the data source key
              const normalizedLabel = cond.label.replace(/\s+/g, '_').toLowerCase().slice(0, 40);
              sourceLabelMap.set(`${cond.dataSource}:${normalizedLabel}`, cond.label);
            }
          }
        }

        // Determine signal display mode
        const hasTimeSeries = primaryGroup.length >= 2 && latestQuant?.unit !== 'status';
        const hasStatusQuant = latestQuant?.unit === 'status';
        const displayMode = hasTimeSeries ? 'quantitative'
          : (hasStatusQuant || latestAny) ? 'milestone'
          : 'none';

        if (displayMode === 'none') return null;

        // Source link and metric name (for quantitative mode)
        const sourceKey = explicitDetails?.dataSource || latestQuant?.dataSource;
        const sourceLabel = sourceKey ? (SOURCE_LABELS[sourceKey] || sourceKey) : null;
        const sourceUrl = explicitDetails?.endpoint || null;
        const metricName = explicitDetails?.label
          || explicitDetails?.metricName
          || explicitDetails?.calculation
          || null;

        return (
          <>
            {/* === Quantitative mode: value summary + time-series chart === */}
            {displayMode === 'quantitative' && latestQuant && (
              <>
                {/* Status Summary Card */}
                <div className="bg-card rounded-lg border p-4">
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex-1 min-w-[200px] space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-mono font-semibold text-foreground">
                          {formatSnapshotValue(String(latestQuant.observedValue), latestQuant.unit)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          / {formatSnapshotValue(String(latestQuant.thresholdValue), latestQuant.unit)}
                        </span>
                      </div>
                      {latestQuant.pctToThreshold != null && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                Number(latestQuant.pctToThreshold) >= 90 ? 'bg-emerald-500' :
                                Number(latestQuant.pctToThreshold) >= 60 ? 'bg-blue-500' :
                                Number(latestQuant.pctToThreshold) >= 30 ? 'bg-amber-500' :
                                'bg-zinc-400'
                              }`}
                              style={{ width: `${Math.min(Math.max(Number(latestQuant.pctToThreshold), 0), 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-mono text-muted-foreground w-12 text-right">
                            {Number(latestQuant.pctToThreshold).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                    {latestQual?.assessment && (() => {
                      const level = ASSESSMENT_LEVELS[latestQual.assessment];
                      return level ? (
                        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${level.bgColor} ${level.borderColor}`}>
                          <div className={`w-2.5 h-2.5 rounded-full ${level.dotColor}`} />
                          <span className={`text-sm font-medium ${level.textColor}`}>{level.label}</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="text-xs text-muted-foreground">
                      Updated {new Date(latestAny!.snapshotDate).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>

                {/* Quantitative Tracking Charts — one per data source group */}
                {quantGroupEntries.map(([groupSource, groupSnapshots]) => {
                  const groupLabel = sourceLabelMap.get(groupSource)
                    || SOURCE_LABELS[groupSource]
                    || groupSource;
                  const groupLatest = groupSnapshots[0];
                  const thresholdDir = explicitDetails?.thresholdDirection;
                  // Map thresholdDirection to chart direction prop
                  const chartDirection = thresholdDir === 'below' ? 'down_to_threshold' as const
                    : (explicitDetails as Record<string, unknown>)?.direction as 'up_to_threshold' | 'down_to_threshold' | undefined;

                  return (
                    <div key={groupSource} className="bg-card rounded-lg border">
                      <div className="px-4 py-3 border-b flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            {groupLabel}
                            {(() => {
                              const h = getDataSourceHealth(
                                groupLatest?.snapshotDate || null,
                                explicitDetails?.checkFrequency,
                              );
                              return h ? (
                                <span className={`w-2 h-2 rounded-full ${h.dotCls}`} title={h.label} />
                              ) : null;
                            })()}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Current: {formatSnapshotValue(String(groupLatest?.observedValue), groupLatest?.unit)} — Threshold: {formatSnapshotValue(String(groupLatest?.thresholdValue), groupLatest?.unit)}
                          </p>
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground">
                          {SOURCE_LABELS[groupSource.split(':')[0]] || groupSource.split(':')[0]}
                        </span>
                      </div>
                      <div className="p-4">
                        <SignalSnapshotChart
                          snapshots={groupSnapshots.map(s => ({
                            date: s.snapshotDate,
                            observed: Number(s.observedValue) || 0,
                            threshold: Number(s.thresholdValue) || 0,
                          }))}
                          unit={groupLatest?.unit || ''}
                          signalType={signal.type}
                          direction={chartDirection}
                          height={200}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* === Milestone mode: binary event status === */}
            {displayMode === 'milestone' && (
              <SignalMilestoneCard
                triggered={hasStatusQuant ? Number(latestQuant!.observedValue) >= 1 : false}
                lastChecked={latestAny!.snapshotDate}
                evidenceSummary={latestQual?.evidenceSummary || latestQuant?.evidenceSummary || null}
                latestAssessment={latestQual?.assessment || null}
                signalType={signal.type}
              />
            )}
          </>
        );
      })()}

      {/* Qualitative Tracking */}
      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-foreground">Qualitative Tracking</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cumulative conviction score from narrative evidence. +1 strengthening, −1 weakening, 0 neutral.
          </p>
        </div>
        <div className="p-4">
          {isLoadingScores ? (
            <div className="text-sm text-muted-foreground py-4">Loading...</div>
          ) : (
            <SignalCumulativeScoreChart scores={dailyScores} signalType={signal.type} />
          )}
        </div>
      </div>

      {/* Signal Log */}
      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-foreground">
            Signal Log
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {snapshots.length} {snapshots.length === 1 ? 'entry' : 'entries'}
            </span>
          </h3>
        </div>
        <SignalLog
          entries={snapshots.map((s): SignalLogEntry => ({
            id: s.id,
            snapshotDate: s.snapshotDate,
            dataSource: s.dataSource,
            assessment: s.assessment,
            evidenceSummary: s.evidenceSummary,
            observedValue: s.observedValue,
            thresholdValue: s.thresholdValue,
            pctToThreshold: s.pctToThreshold,
            unit: s.unit,
            status: s.status,
            claimId: s.claimId,
            intelligenceItemId: s.intelligenceItemId ?? undefined,
          }))}
          onReject={async (snapshotId) => {
            await fetch(`/api/signals/snapshots/${snapshotId}/reject`, { method: 'PATCH' });
            setSnapshots(prev => prev.map(snap =>
              snap.id === snapshotId ? { ...snap, status: 'rejected' } : snap
            ));
          }}
        />
      </div>
    </div>
  );
}
