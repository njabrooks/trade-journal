'use client';

import { useEffect, useState } from 'react';
import type { Signal } from '@/db/schema';

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
}

const ASSESSMENT_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  no_evidence: { label: 'No evidence', color: 'text-muted-foreground', emoji: '⚪' },
  emerging: { label: 'Emerging', color: 'text-yellow-600 dark:text-yellow-400', emoji: '🟡' },
  partial: { label: 'Partial', color: 'text-amber-600 dark:text-amber-400', emoji: '🟠' },
  strong: { label: 'Strong', color: 'text-green-600 dark:text-green-400', emoji: '🟢' },
  confirmed: { label: 'Confirmed', color: 'text-emerald-600 dark:text-emerald-400', emoji: '✅' },
};

const SOURCE_LABELS: Record<string, string> = {
  defillama: 'DefiLlama',
  hypeflows: 'HypeFlows',
  coingecko: 'CoinGecko',
  tradingview_cdp: 'TradingView',
  internal_db: 'Internal',
  thesis_monitor: 'Thesis Monitor',
  derived: 'Derived',
};

function formatValue(value: string | null, unit: string | null): string {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  if (unit === 'USD') {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  }
  if (unit === '%') return `${num.toFixed(1)}%`;
  if (unit === 'status') return num === 0 ? 'Active' : 'Triggered';
  return `${num.toFixed(2)} ${unit || ''}`.trim();
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

export function SignalProgressCard({ signal }: SignalProgressCardProps) {
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

  // Separate quantitative and qualitative snapshots
  const quantitative = snapshots.filter(s => s.observedValue !== null);
  const qualitative = snapshots.filter(s => s.assessment !== null);

  const latestQuant = quantitative[0];
  const latestQual = qualitative[0];

  const hasData = quantitative.length > 0 || qualitative.length > 0;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      {/* Header: data source badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {latestQuant && (
          <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
            {SOURCE_LABELS[latestQuant.dataSource] || latestQuant.dataSource}
          </span>
        )}
        {latestQual && (
          <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300">
            Thesis Monitor
          </span>
        )}
        {!hasData && (
          <span className="text-[10px] text-muted-foreground">No tracking data yet</span>
        )}
      </div>

      {/* Quantitative: current value → threshold with progress bar */}
      {latestQuant && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-mono font-medium">
              {formatValue(latestQuant.observedValue, latestQuant.unit)}
            </span>
            <span className="text-xs text-muted-foreground">
              / {formatValue(latestQuant.thresholdValue, latestQuant.unit)}
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

      {/* Qualitative: latest assessment */}
      {latestQual && (
        <div className="space-y-1">
          {latestQual.assessment && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs">
                {ASSESSMENT_LABELS[latestQual.assessment]?.emoji || '⚪'}
              </span>
              <span className={`text-xs font-medium ${ASSESSMENT_LABELS[latestQual.assessment]?.color || ''}`}>
                {ASSESSMENT_LABELS[latestQual.assessment]?.label || latestQual.assessment}
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

      {/* Timestamp */}
      {hasData && (
        <p className="text-[10px] text-muted-foreground">
          Updated {new Date((latestQuant || latestQual)!.snapshotDate).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      )}
    </div>
  );
}
