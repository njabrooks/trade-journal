'use client';

import { useEffect, useState } from 'react';
import type { Signal } from '@/db/schema';
import { TradingViewMiniChart } from './TradingViewMiniChart';
import { SignalSnapshotChart } from './SignalSnapshotChart';
import { SignalMilestoneCard } from './SignalMilestoneCard';
import { AssessmentTimeline } from './AssessmentTimeline';
import {
  ASSESSMENT_LEVELS,
  SOURCE_LABELS,
  formatSnapshotValue,
} from './signal-constants';

interface Snapshot {
  id: string;
  snapshotDate: string;
  observedValue: string | null;
  thresholdValue: string | null;
  pctToThreshold: string | null;
  unit: string | null;
  assessment: string | null;
  evidenceSummary: string | null;
  dataSource: string;
}

interface SignalProgressCardProps {
  signal: Signal;
  evidenceCount?: number;
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const color =
    clamped >= 90 ? 'bg-emerald-500' :
    clamped >= 60 ? 'bg-blue-500' :
    clamped >= 30 ? 'bg-amber-500' :
    'bg-zinc-400';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-10 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export function SignalProgressCard({ signal, evidenceCount }: SignalProgressCardProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/signals/${signal.id}/snapshots?days=90`)
      .then(res => res.json())
      .then(data => {
        setSnapshots(data.snapshots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [signal.id]);

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    );
  }

  // Separate quantitative and qualitative snapshots.
  // Exclude price_history_* data sources — these are raw price backfill data
  // used for correlation computation, not actual signal observations.
  // Also filter to only the primary data source (the most recent one) to avoid
  // mixing incompatible units in the chart.
  const allQuant = snapshots.filter(s =>
    s.observedValue !== null && !s.dataSource.startsWith('price_history')
  );
  const primarySource = allQuant[0]?.dataSource;
  const quantitative = primarySource
    ? allQuant.filter(s => s.dataSource === primarySource)
    : allQuant;
  const qualitative = snapshots.filter(s => s.assessment !== null);

  const latestQuant = quantitative[0];
  const latestQual = qualitative[0];

  const hasData = quantitative.length > 0 || qualitative.length > 0;

  // Determine if this is a strategy price signal with a TradingView symbol
  const details = signal.explicitDetails as Record<string, unknown> | null;
  const tvSymbol = details?.tvSymbol as string | undefined;
  const isStrategyPrice = !!tvSymbol;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      {/* Header: data source badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {latestQuant && (
          <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
            {SOURCE_LABELS[latestQuant.dataSource] || latestQuant.dataSource}
          </span>
        )}
        {latestQual && (
          <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-purple-500/15 text-purple-600 dark:text-purple-400">
            Thesis Monitor
          </span>
        )}
        {!hasData && (
          <span className="text-xs text-muted-foreground">No tracking data yet</span>
        )}
      </div>

      {/* Quantitative: current value -> threshold with progress bar */}
      {latestQuant && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-mono font-medium">
              {formatSnapshotValue(latestQuant.observedValue, latestQuant.unit)}
            </span>
            <span className="text-xs text-muted-foreground">
              / {formatSnapshotValue(latestQuant.thresholdValue, latestQuant.unit)}
            </span>
          </div>
          <ProgressBar pct={parseFloat(latestQuant.pctToThreshold || '0')} />
          {latestQuant.evidenceSummary && (
            <p className="text-xs text-muted-foreground truncate">
              {latestQuant.evidenceSummary}
            </p>
          )}
        </div>
      )}

      {/* Chart section: depends on signal type */}
      {isStrategyPrice ? (
        /* Strategy price signal: TradingView embed */
        <TradingViewMiniChart
          symbol={tvSymbol}
          height={350}
        />
      ) : latestQuant?.unit === 'status' ? (
        /* Status/milestone signal: checklist card */
        <SignalMilestoneCard
          triggered={parseFloat(latestQuant.observedValue || '0') >= 1}
          lastChecked={latestQuant.snapshotDate}
          evidenceSummary={latestQuant.evidenceSummary || latestQual?.evidenceSummary || null}
          latestAssessment={latestQual?.assessment || null}
          signalType={signal.type}
        />
      ) : quantitative.length >= 2 ? (
        /* Thesis quantitative: Recharts chart */
        <SignalSnapshotChart
          snapshots={quantitative.map(s => ({
            date: s.snapshotDate,
            observed: parseFloat(s.observedValue || '0'),
            threshold: parseFloat(s.thresholdValue || '0'),
          }))}
          unit={latestQuant?.unit || ''}
          signalType={signal.type}
          direction={(details?.direction as 'up_to_threshold' | 'down_to_threshold' | undefined)}
          height={140}
        />
      ) : null}

      {/* Qualitative: assessment timeline */}
      {qualitative.length > 0 && (
        <AssessmentTimeline
          assessments={qualitative.map(s => ({
            date: s.snapshotDate,
            assessment: s.assessment || 'neutral',
            summary: s.evidenceSummary,
          }))}
        />
      )}

      {/* Fallback for qualitative-only signals without timeline data */}
      {!quantitative.length && qualitative.length === 0 && latestQual && (
        <div className="space-y-1">
          {latestQual.assessment && (
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${ASSESSMENT_LEVELS[latestQual.assessment]?.dotColor || 'bg-zinc-400'}`} />
              <span className={`text-xs font-medium ${ASSESSMENT_LEVELS[latestQual.assessment]?.textColor || ''}`}>
                {ASSESSMENT_LEVELS[latestQual.assessment]?.label || latestQual.assessment}
              </span>
            </div>
          )}
          {latestQual.evidenceSummary && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {latestQual.evidenceSummary}
            </p>
          )}
        </div>
      )}

      {/* Supporting claims badge */}
      {evidenceCount != null && evidenceCount > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-violet-500/15 text-violet-600 dark:text-violet-400">
            {evidenceCount} supporting {evidenceCount === 1 ? 'claim' : 'claims'}
          </span>
        </div>
      )}

      {/* Timestamp */}
      {hasData && (
        <p className="text-xs text-muted-foreground">
          Updated {new Date((latestQuant || latestQual)!.snapshotDate).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      )}
    </div>
  );
}
