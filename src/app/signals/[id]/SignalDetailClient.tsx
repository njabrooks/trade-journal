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
} from 'lucide-react';
import { SignalCumulativeScoreChart } from '@/components/signals/SignalCumulativeScoreChart';
import { SignalSnapshotChart } from '@/components/signals/SignalSnapshotChart';
import { SignalMilestoneCard } from '@/components/signals/SignalMilestoneCard';
import { SignalLog } from '@/components/signals/SignalLog';
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

function entityTypeBadge(entity: SignalWithContext['entities'][number]): { label: string; cls: string } {
  if (entity.entityType === 'strategy') return { label: 'Strategy', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' };
  if (entity.thesisType === 'macro') return { label: 'Macro Thesis', cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' };
  return { label: 'Asset Thesis', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' };
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
    fetch(`/api/signals/${signal.id}/snapshots?days=90`)
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
    threshold?: string;
    dataSources?: string[];
    monitoringFrequency?: string;
    dataSource?: string;
    endpoint?: string;
    direction?: string;
    display_type?: string;
    calculation?: string;
    conditions?: Array<{ label?: string; metric?: string }>;
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
                const badge = entityTypeBadge(entity);
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                    {entity.entityTitle && (
                      <span className="font-normal opacity-80">— {entity.entityTitle}</span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>


      {/* Signal Status + Tracking */}
      {(() => {
        // Classify snapshot data
        const allQuant = snapshots.filter(s =>
          s.observedValue !== null && !s.dataSource.startsWith('price_history')
        );
        const primarySource = allQuant[0]?.dataSource;
        const quantitative = primarySource
          ? allQuant.filter(s => s.dataSource === primarySource)
          : allQuant;
        const latestQuant = quantitative[0];
        const latestQual = snapshots.filter(s => s.assessment !== null)[0];
        const latestAny = latestQuant || latestQual;

        // Determine signal display mode:
        // - 'quantitative': has numeric time-series data (unit != 'status')
        // - 'milestone': has status-type quant data OR qualitative-only (binary event)
        // - 'none': no data at all
        const hasTimeSeries = quantitative.length >= 2 && latestQuant?.unit !== 'status';
        const hasStatusQuant = latestQuant?.unit === 'status';
        const displayMode = hasTimeSeries ? 'quantitative'
          : (hasStatusQuant || latestAny) ? 'milestone'
          : 'none';

        if (displayMode === 'none') return null;

        // Source link and metric name (for quantitative mode)
        const sourceKey = explicitDetails?.dataSource || latestQuant?.dataSource;
        const sourceLabel = sourceKey ? (SOURCE_LABELS[sourceKey] || sourceKey) : null;
        const sourceUrl = explicitDetails?.endpoint || null;
        const metricName = explicitDetails?.metricName
          || explicitDetails?.conditions?.[0]?.label
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

                {/* Quantitative Tracking Chart */}
                <div className="bg-card rounded-lg border">
                  <div className="px-4 py-3 border-b flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Quantitative Tracking</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {metricName || 'Observed value vs. threshold over time'}
                      </p>
                    </div>
                    {sourceLabel && (
                      <div className="flex items-center gap-1.5">
                        {sourceUrl ? (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {sourceLabel}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground">
                            {sourceLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <SignalSnapshotChart
                      snapshots={quantitative.map(s => ({
                        date: s.snapshotDate,
                        observed: Number(s.observedValue) || 0,
                        threshold: Number(s.thresholdValue) || 0,
                      }))}
                      unit={latestQuant.unit || ''}
                      signalType={signal.type}
                      direction={(signal.explicitDetails as Record<string, unknown>)?.direction as 'up_to_threshold' | 'down_to_threshold' | undefined}
                      height={200}
                    />
                  </div>
                </div>
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
              {snapshots.length} {snapshots.length === 1 ? 'entry' : 'entries'}, last 90 days
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
