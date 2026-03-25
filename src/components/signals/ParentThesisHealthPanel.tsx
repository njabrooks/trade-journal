'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { formatSnapshotValue } from './signal-constants';

interface ParentSignalHealth {
  signalId: string;
  type: string;
  statement: string;
  importance: string;
  category: string;
  latestSnapshot: {
    observedValue: string | null;
    thresholdValue: string | null;
    pctToThreshold: string | null;
    unit: string | null;
    snapshotDate: string;
    dataSource: string;
  } | null;
}

interface ParentHealthData {
  thesis: {
    id: string;
    title: string;
    status: string;
    confidenceLevel: string;
    direction: string;
  };
  signals: ParentSignalHealth[];
  summary: {
    totalActive: number;
    confirmationCount: number;
    invalidationCount: number;
    nearThresholdCount: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  monitoring: 'text-emerald-600 dark:text-emerald-400',
  developing: 'text-blue-600 dark:text-blue-400',
  draft: 'text-muted-foreground',
  complete: 'text-muted-foreground',
  rejected: 'text-red-600 dark:text-red-400',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-blue-600 dark:text-blue-400',
  low: 'text-amber-600 dark:text-amber-400',
  exploratory: 'text-muted-foreground',
};

function pctColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-blue-500';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-zinc-400';
}

export function ParentThesisHealthPanel({ parentThesisId }: { parentThesisId: string }) {
  const [data, setData] = useState<ParentHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/theses/${parentThesisId}/signal-health`)
      .then(r => r.json())
      .then(d => setData(d as ParentHealthData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [parentThesisId]);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Loading parent thesis health...</div>
      </div>
    );
  }

  if (!data?.thesis) return null;

  const { thesis, signals, summary } = data;
  const thesisUrl = `/macro-theses/${thesis.id}`;

  // Signals with pct_to_threshold > 50% — worth showing detail
  const noteworthySignals = signals.filter(s => {
    const pct = s.latestSnapshot?.pctToThreshold;
    return pct != null && Number(pct) > 50;
  });

  const hasRisk = summary.nearThresholdCount > 0;

  return (
    <div className={`bg-card rounded-lg border ${hasRisk ? 'border-amber-500/40' : ''}`}>
      <div className="px-4 py-3 border-b bg-muted/30 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Parent Thesis Health</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cascade risk from parent thesis signal proximity
            </p>
          </div>
        </div>
        {hasRisk && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {summary.nearThresholdCount} near threshold
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Thesis info */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Link href={thesisUrl} className="text-sm font-medium text-foreground hover:underline flex items-center gap-1.5 group">
              {thesis.title}
              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-foreground shrink-0" />
            </Link>
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            <span className={STATUS_COLORS[thesis.status] || 'text-muted-foreground'}>
              {thesis.status}
            </span>
            <span className={CONFIDENCE_COLORS[thesis.confidenceLevel] || 'text-muted-foreground'}>
              {thesis.confidenceLevel} confidence
            </span>
          </div>
        </div>

        {/* Signal summary */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{summary.totalActive} active signal{summary.totalActive !== 1 ? 's' : ''}</span>
          {summary.invalidationCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-orange-500" />
              {summary.invalidationCount} invalidation
            </span>
          )}
          {summary.confirmationCount > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-blue-500" />
              {summary.confirmationCount} confirmation
            </span>
          )}
        </div>

        {/* Noteworthy signals (pct > 50%) */}
        {noteworthySignals.length > 0 && (
          <div className="space-y-2">
            {noteworthySignals.map((sig) => {
              const pct = Number(sig.latestSnapshot!.pctToThreshold);
              const isInvalidation = sig.type === 'invalidation';
              return (
                <Link
                  key={sig.signalId}
                  href={`/signals/${sig.signalId}`}
                  className="block rounded-md border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          isInvalidation
                            ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {isInvalidation ? <AlertTriangle className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                          {sig.type}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{sig.importance}</span>
                      </div>
                      <p className="text-xs text-foreground line-clamp-2">{sig.statement}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-xs font-mono">
                        <span className="text-foreground">
                          {formatSnapshotValue(sig.latestSnapshot!.observedValue, sig.latestSnapshot!.unit)}
                        </span>
                        <span className="text-muted-foreground">
                          {' / '}
                          {formatSnapshotValue(sig.latestSnapshot!.thresholdValue, sig.latestSnapshot!.unit)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pctColor(pct)}`}
                        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* No noteworthy signals message */}
        {noteworthySignals.length === 0 && summary.totalActive > 0 && (
          <p className="text-xs text-muted-foreground">
            No parent signals above 50% proximity to threshold.{' '}
            <Link href={thesisUrl} className="underline hover:text-foreground">
              View all signals
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
