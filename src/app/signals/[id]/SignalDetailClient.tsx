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
} from 'lucide-react';
import { SignalCumulativeScoreChart } from '@/components/signals/SignalCumulativeScoreChart';
import { SignalLog } from '@/components/signals/SignalLog';
import type { DayScore } from '@/components/signals/SignalCumulativeScoreChart';
import type { SignalLogEntry } from '@/components/signals/SignalLog';
import type { SignalWithContext } from '@/db/queries/signals';

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

const TYPE_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  confirmation: {
    label: 'Confirmation',
    cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  invalidation: {
    label: 'Invalidation',
    cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  warning: {
    label: 'Invalidation',
    cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  completion: {
    label: 'Completion',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    icon: <Target className="w-3 h-3" />,
  },
};

const IMPORTANCE_CONFIG: Record<string, string> = {
  critical:    'bg-destructive/15 text-destructive',
  significant: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  supporting:  'bg-muted text-muted-foreground',
};

const STATUS_CONFIG: Record<string, { cls: string; icon: React.ReactNode }> = {
  draft:    { cls: 'bg-muted text-muted-foreground', icon: <Clock className="w-3 h-3" /> },
  active:   { cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: <Eye className="w-3 h-3" /> },
  complete: { cls: 'bg-muted text-muted-foreground', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { cls: 'bg-destructive/15 text-destructive', icon: <Archive className="w-3 h-3" /> },
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

  const typeConfig = TYPE_CONFIG[signal.type] ?? TYPE_CONFIG.confirmation;
  const statusConfig = STATUS_CONFIG[signal.status] ?? STATUS_CONFIG.active;
  const importanceCls = IMPORTANCE_CONFIG[signal.importance] ?? IMPORTANCE_CONFIG.supporting;

  const explicitDetails = signal.explicitDetails as {
    metric?: string;
    threshold?: string;
    dataSources?: string[];
    monitoringFrequency?: string;
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
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeConfig.cls}`}>
                {typeConfig.icon}
                {typeConfig.label}
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
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.cls}`}>
            {statusConfig.icon}
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

      {/* Trigger criteria (data_driven only) */}
      {signal.category === 'data_driven' && explicitDetails && (
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Trigger Criteria</h3>
          <dl className="space-y-2 text-sm">
            {explicitDetails.metric && (
              <div>
                <dt className="text-muted-foreground">Metric</dt>
                <dd className="text-foreground font-medium">{explicitDetails.metric}</dd>
              </div>
            )}
            {explicitDetails.threshold && (
              <div>
                <dt className="text-muted-foreground">Threshold</dt>
                <dd className="text-foreground font-mono">{explicitDetails.threshold}</dd>
              </div>
            )}
            {explicitDetails.dataSources && explicitDetails.dataSources.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Data Sources</dt>
                <dd className="text-foreground">{explicitDetails.dataSources.join(', ')}</dd>
              </div>
            )}
            {explicitDetails.monitoringFrequency && (
              <div>
                <dt className="text-muted-foreground">Monitoring Frequency</dt>
                <dd className="text-foreground">{explicitDetails.monitoringFrequency}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Conviction Trend */}
      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-foreground">Conviction Trend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daily qualitative evidence score. +1 strengthening, −1 weakening, 0 neutral.
          </p>
        </div>
        <div className="p-4">
          {isLoadingScores ? (
            <div className="text-sm text-muted-foreground py-4">Loading...</div>
          ) : (
            <SignalCumulativeScoreChart scores={dailyScores} />
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
