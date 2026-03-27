'use client';

import { useState, useEffect } from 'react';
import { SignalCumulativeScoreChart } from './SignalCumulativeScoreChart';
import { SignalSnapshotChart } from './SignalSnapshotChart';
import { SignalMilestoneCard } from './SignalMilestoneCard';
import type { DayScore } from './SignalCumulativeScoreChart';
import { ASSESSMENT_LEVELS, SOURCE_LABELS, formatSnapshotValue } from './signal-constants';
import type { Signal } from '@/db/schema';

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

interface SignalExpandedCardsProps {
  signal: Signal;
}

export function SignalExpandedCards({ signal }: SignalExpandedCardsProps) {
  const [dailyScores, setDailyScores] = useState<DayScore[]>([]);
  const [isLoadingScores, setIsLoadingScores] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(true);

  useEffect(() => {
    fetch(`/api/signals/${signal.id}/daily-scores`)
      .then(r => r.json())
      .then(data => setDailyScores(data.scores || []))
      .catch(() => {})
      .finally(() => setIsLoadingScores(false));

    fetch(`/api/signals/${signal.id}/snapshots?days=10000`)
      .then(r => r.json())
      .then(data => setSnapshots((data.snapshots || []) as Snapshot[]))
      .catch(() => {})
      .finally(() => setIsLoadingSnapshots(false));
  }, [signal.id]);

  const explicitDetails = signal.explicitDetails as {
    metric?: string;
    label?: string;
    threshold?: string;
    dataSource?: string;
    endpoint?: string;
    direction?: string;
    thresholdDirection?: string;
    checkFrequency?: string;
    conditions?: Array<{ label?: string; metric?: string; dataSource?: string }>;
  } | null;

  const isLoading = isLoadingScores || isLoadingSnapshots;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-2">Loading...</div>;
  }

  // === Classify snapshot data ===
  const allQuant = snapshots.filter(s =>
    s.observedValue !== null && !s.dataSource.startsWith('price_history')
  );
  const latestQual = snapshots.filter(s => s.assessment !== null)[0];

  const quantGroups = new Map<string, Snapshot[]>();
  for (const s of allQuant) {
    if (!quantGroups.has(s.dataSource)) quantGroups.set(s.dataSource, []);
    quantGroups.get(s.dataSource)!.push(s);
  }
  const quantGroupEntries = Array.from(quantGroups.entries())
    .filter(([src]) => src !== 'thesis_monitor');

  const primarySourceKey = explicitDetails?.dataSource;
  const primaryGroup = primarySourceKey && quantGroups.has(primarySourceKey)
    ? quantGroups.get(primarySourceKey)!
    : quantGroupEntries[0]?.[1] || [];
  const latestQuant = primaryGroup[0];
  const latestAny = latestQuant || latestQual;

  const sourceLabelMap = new Map<string, string>();
  if (explicitDetails?.label) {
    sourceLabelMap.set(explicitDetails.dataSource || 'primary', explicitDetails.label);
  }
  if (explicitDetails?.conditions) {
    for (const cond of explicitDetails.conditions) {
      if (cond.label && cond.dataSource) {
        const normalizedLabel = cond.label.replace(/\s+/g, '_').toLowerCase().slice(0, 40);
        sourceLabelMap.set(`${cond.dataSource}:${normalizedLabel}`, cond.label);
      }
    }
  }

  const hasTimeSeries = primaryGroup.length >= 2 && latestQuant?.unit !== 'status';
  const hasStatusQuant = latestQuant?.unit === 'status';
  const displayMode = hasTimeSeries ? 'quantitative'
    : (hasStatusQuant || latestAny) ? 'milestone'
    : 'none';

  return (
    <div className="space-y-3">
      {/* === Card 1: Status Summary (quantitative mode) === */}
      {displayMode === 'quantitative' && latestQuant && (
        <>
          <div className="bg-background rounded-md border p-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[160px] space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-semibold text-foreground">
                    {formatSnapshotValue(String(latestQuant.observedValue), latestQuant.unit)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {formatSnapshotValue(String(latestQuant.thresholdValue), latestQuant.unit)}
                  </span>
                </div>
                {latestQuant.pctToThreshold != null && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
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
                    <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                      {Number(latestQuant.pctToThreshold).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
              {latestQual?.assessment && (() => {
                const level = ASSESSMENT_LEVELS[latestQual.assessment];
                return level ? (
                  <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${level.bgColor} ${level.borderColor}`}>
                    <div className={`w-2 h-2 rounded-full ${level.dotColor}`} />
                    <span className={`text-xs font-medium ${level.textColor}`}>{level.label}</span>
                  </div>
                ) : null;
              })()}
              {latestAny && (
                <span className="text-xs text-muted-foreground">
                  {new Date(latestAny.snapshotDate).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              )}
            </div>
          </div>

          {/* === Card 2: Quantitative Charts === */}
          {quantGroupEntries.map(([groupSource, groupSnapshots]) => {
            const groupLabel = sourceLabelMap.get(groupSource)
              || SOURCE_LABELS[groupSource]
              || groupSource;
            const groupLatest = groupSnapshots[0];
            const thresholdDir = explicitDetails?.thresholdDirection;
            const chartDirection = thresholdDir === 'below' ? 'down_to_threshold' as const
              : (explicitDetails as Record<string, unknown>)?.direction as 'up_to_threshold' | 'down_to_threshold' | undefined;

            return (
              <div key={groupSource} className="bg-background rounded-md border">
                <div className="px-3 py-2 border-b flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">{groupLabel}</h4>
                    <p className="text-xs text-muted-foreground">
                      {formatSnapshotValue(String(groupLatest?.observedValue), groupLatest?.unit)} → {formatSnapshotValue(String(groupLatest?.thresholdValue), groupLatest?.unit)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {SOURCE_LABELS[groupSource.split(':')[0]] || groupSource.split(':')[0]}
                  </span>
                </div>
                <div className="p-3">
                  <SignalSnapshotChart
                    snapshots={groupSnapshots.map(s => ({
                      date: s.snapshotDate,
                      observed: Number(s.observedValue) || 0,
                      threshold: Number(s.thresholdValue) || 0,
                    }))}
                    unit={groupLatest?.unit || ''}
                    signalType={signal.type as 'confirmation' | 'invalidation' | 'completion'}
                    direction={chartDirection}
                    height={160}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* === Milestone mode === */}
      {displayMode === 'milestone' && latestAny && (
        <SignalMilestoneCard
          triggered={hasStatusQuant ? Number(latestQuant!.observedValue) >= 1 : false}
          lastChecked={latestAny.snapshotDate}
          evidenceSummary={latestQual?.evidenceSummary || latestQuant?.evidenceSummary || null}
          latestAssessment={latestQual?.assessment || null}
          signalType={signal.type as 'confirmation' | 'invalidation' | 'completion'}
        />
      )}

      {/* === Card 3: Qualitative Tracking === */}
      <div className="bg-background rounded-md border">
        <div className="px-3 py-2 border-b">
          <h4 className="text-xs font-semibold text-foreground">Qualitative Tracking</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cumulative conviction score. +1 strengthening, −1 weakening, 0 neutral.
          </p>
        </div>
        <div className="p-3">
          {isLoadingScores ? (
            <div className="text-xs text-muted-foreground py-2">Loading...</div>
          ) : (
            <SignalCumulativeScoreChart
              scores={dailyScores}
              signalType={signal.type as 'confirmation' | 'invalidation' | 'completion'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
