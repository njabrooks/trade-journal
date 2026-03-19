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
}

const TYPE_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  confirmation: {
    label: 'Confirmation',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  invalidation: {
    label: 'Invalidation',
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  warning: {
    label: 'Invalidation',
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  completion: {
    label: 'Completion',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: <Target className="w-4 h-4" />,
  },
};

const IMPORTANCE_CONFIG: Record<string, string> = {
  critical:    'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  significant: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  supporting:  'bg-muted text-muted-foreground border',
};

const STATUS_CONFIG: Record<string, { cls: string; icon: React.ReactNode }> = {
  draft:    { cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300', icon: <Clock className="w-4 h-4 text-purple-400" /> },
  active:   { cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300', icon: <Eye className="w-4 h-4 text-blue-500" /> },
  complete: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
  rejected: { cls: 'bg-muted text-muted-foreground border', icon: <Archive className="w-4 h-4 text-muted-foreground" /> },
};

function entityTypeBadge(entity: SignalWithContext['entities'][number]): { label: string; cls: string } {
  if (entity.entityType === 'strategy') return { label: 'Strategy', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' };
  if (entity.thesisType === 'macro') return { label: 'Macro Thesis', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' };
  return { label: 'Asset Thesis', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' };
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
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded ${typeConfig.cls}`}>
                {typeConfig.icon}
                {typeConfig.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded border ${importanceCls}`}>
                {signal.importance}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground bg-muted rounded">
                <Scale className="w-4 h-4" />
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
          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${statusConfig.cls}`}>
            {statusConfig.icon}
            <span className="font-medium">{signal.status}</span>
          </div>
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
                  <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${badge.cls}`}>
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
          }))}
        />
      </div>
    </div>
  );
}
