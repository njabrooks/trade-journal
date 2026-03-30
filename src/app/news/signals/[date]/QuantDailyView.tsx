'use client';

import Link from 'next/link';
import { ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuantDailySummary, QuantDailySnapshot } from '@/db/queries/quantDaily';

const ASSESSMENT_STYLES: Record<string, string> = {
  strengthening: 'bg-green-500/15 text-green-600 dark:text-green-400',
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  weakening: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  invalidated: 'bg-red-500/15 text-red-600 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
};

const IMPORTANCE_STYLES: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  significant: 'text-amber-600 dark:text-amber-400',
  supporting: 'text-muted-foreground',
};

const TYPE_STYLES: Record<string, string> = {
  confirmation: 'bg-green-500/10 text-green-600 dark:text-green-400',
  invalidation: 'bg-red-500/10 text-red-600 dark:text-red-400',
  completion: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

function formatValue(value: number | null, unit: string | null): string {
  if (value === null) return '—';
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1e12) formatted = `${(value / 1e12).toFixed(1)}T`;
  else if (abs >= 1e9) formatted = `${(value / 1e9).toFixed(1)}B`;
  else if (abs >= 1e6) formatted = `${(value / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) formatted = `${(value / 1e3).toFixed(1)}K`;
  else formatted = value % 1 === 0 ? String(value) : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function SnapshotRow({ s }: { s: QuantDailySnapshot }) {
  const thesisHref = s.thesisId && s.thesisType
    ? `/${s.thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${s.thesisId}`
    : null;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-start px-4 py-3 border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
      {/* Signal info */}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Link href={`/signals/${s.signalId}`} className="text-sm font-medium text-foreground hover:underline truncate">
            {s.signalStatement}
          </Link>
          <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded whitespace-nowrap', TYPE_STYLES[s.signalType] || 'bg-muted text-muted-foreground')}>
            {s.signalType}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {s.ticker && (
            <span className="font-mono font-semibold text-foreground">{s.ticker}</span>
          )}
          {thesisHref && s.thesisTitle ? (
            <Link href={thesisHref} className="hover:underline truncate">
              {s.thesisTitle}
            </Link>
          ) : s.thesisTitle ? (
            <span className="truncate">{s.thesisTitle}</span>
          ) : null}
          {s.dataSource && (
            <span className="text-muted-foreground/60">{s.dataSource}</span>
          )}
        </div>
        {s.evidenceSummary && (
          <p className="text-xs text-muted-foreground/80 line-clamp-2">{s.evidenceSummary}</p>
        )}
      </div>

      {/* Observed / Threshold */}
      <div className="text-right font-mono text-xs space-y-0.5 min-w-[80px]">
        <div className="font-semibold text-foreground">{formatValue(s.observedValue, s.unit)}</div>
        {s.thresholdValue !== null && (
          <div className="text-muted-foreground">/ {formatValue(s.thresholdValue, s.unit)}</div>
        )}
      </div>

      {/* % to threshold */}
      <div className="min-w-[60px] text-right">
        {s.pctToThreshold !== null ? (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-xs font-mono font-medium',
            s.pctToThreshold >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {s.pctToThreshold >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(s.pctToThreshold).toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Assessment */}
      <div className="min-w-[90px] text-right">
        {s.assessment ? (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', ASSESSMENT_STYLES[s.assessment] || ASSESSMENT_STYLES.neutral)}>
            {s.assessment}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

export function QuantDailyView({ summary }: { summary: QuantDailySummary }) {
  const ac = summary.assessmentCounts;
  const countBadges = [
    { label: 'strengthening', value: ac.strengthening, style: ASSESSMENT_STYLES.strengthening },
    { label: 'confirmed', value: ac.confirmed, style: ASSESSMENT_STYLES.confirmed },
    { label: 'weakening', value: ac.weakening, style: ASSESSMENT_STYLES.weakening },
    { label: 'invalidated', value: ac.invalidated, style: ASSESSMENT_STYLES.invalidated },
    { label: 'neutral', value: ac.neutral, style: ASSESSMENT_STYLES.neutral },
  ].filter((c) => c.value > 0);

  // Group snapshots by thesis for readability
  const byThesis = new Map<string, QuantDailySnapshot[]>();
  for (const s of summary.snapshots) {
    const key = s.thesisTitle || 'Unlinked Signals';
    if (!byThesis.has(key)) byThesis.set(key, []);
    byThesis.get(key)!.push(s);
  }

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-3 border-b">
        {countBadges.map((c) => (
          <span key={c.label} className={`px-2 py-0.5 text-xs font-medium rounded ${c.style}`}>
            {c.value} {c.label}
          </span>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">
          {summary.snapshots.length} observations
        </span>
      </div>

      {/* Snapshots grouped by thesis */}
      {[...byThesis.entries()].map(([thesis, snapshots]) => (
        <div key={thesis}>
          <div className="px-4 pt-3 pb-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{thesis}</h3>
          </div>
          {snapshots.map((s) => (
            <SnapshotRow key={s.id} s={s} />
          ))}
        </div>
      ))}
    </div>
  );
}
