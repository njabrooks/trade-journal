'use client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(date: string | Date): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Postgres numeric fields arrive as strings over JSON — coerce safely
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function formatValue(observed: unknown, threshold: unknown, pct: unknown, unit: string | null): string {
  const pctNum = toNum(pct);
  if (pctNum !== null) {
    const pctStr = `${pctNum.toFixed(1)}%`;
    const obs = toNum(observed);
    const thr = toNum(threshold);
    if (obs !== null && thr !== null) {
      const fmt = (n: number) => n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(1)}B`
        : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
        : n < 0.01 ? n.toFixed(6)
        : n.toFixed(2);
      const unitLabel = unit && unit !== 'USD' && unit !== 'BTC_RATIO' ? ` ${unit}` : '';
      return `${fmt(obs)} → ${fmt(thr)}${unitLabel} (${pctStr})`;
    }
    return pctStr;
  }
  return '—';
}

// For thesis_monitor summaries, extract the bolded key phrase (the actual assessment verdict)
// rather than showing the full repetitive paragraph.
function extractNote(summary: string | null, dataSource: string): string | null {
  if (!summary) return null;
  if (dataSource === 'thesis_monitor') {
    const match = summary.match(/\*\*([^*]+)\*\*/);
    if (match) return match[1];
  }
  return summary;
}

const SOURCE_CONFIG: Record<string, { label: string; cls: string }> = {
  daily_synthesis: { label: 'Daily Rollup', cls: 'bg-muted text-muted-foreground' },
  thesis_monitor:  { label: 'Thesis Monitor', cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  world_monitor:   { label: 'World Monitor', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  qualitative:     { label: 'Research', cls: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  research_routing: { label: 'Research', cls: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  defillama:       { label: 'DeFiLlama', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  derived:         { label: 'Derived', cls: 'bg-muted text-muted-foreground' },
  economic_calendar: { label: 'Econ. Calendar', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

function getSourceConfig(dataSource: string): { label: string; cls: string } {
  if (dataSource in SOURCE_CONFIG) return SOURCE_CONFIG[dataSource];
  if (dataSource.startsWith('price_history_')) {
    const ticker = dataSource.replace('price_history_', '').toUpperCase();
    return { label: `Price (${ticker})`, cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' };
  }
  return { label: dataSource, cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' };
}

const ASSESSMENT_CONFIG: Record<string, { label: string; cls: string }> = {
  neutral:       { label: 'Neutral',       cls: 'bg-muted text-muted-foreground' },
  strengthening: { label: 'Strengthening', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  weakening:     { label: 'Weakening',     cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  confirmed:     { label: 'Confirmed',     cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  invalidated:   { label: 'Invalidated',   cls: 'bg-destructive/15 text-destructive' },
};

export interface SignalLogEntry {
  id: string;
  snapshotDate: string | Date;
  dataSource: string;
  assessment: string | null;
  evidenceSummary: string | null;
  observedValue: number | null;
  thresholdValue: number | null;
  pctToThreshold: number | null;
  unit: string | null;
  status: string;
  claimId: string | null;
}

interface SignalLogProps {
  entries: SignalLogEntry[];
  onReject?: (snapshotId: string) => void;
}

export function SignalLog({ entries, onReject }: SignalLogProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground py-8">
        No observations recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[480px]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="text-left font-medium px-3 py-2 w-28">Date</th>
            <th className="text-left font-medium px-3 py-2 w-36">Source</th>
            <th className="text-left font-medium px-3 py-2 w-40">Assessment / Value</th>
            <th className="text-left font-medium px-3 py-2">Note</th>
            {onReject && <th className="text-right font-medium px-3 py-2 w-16"></th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const src = getSourceConfig(entry.dataSource);
            const isDailySynthesis = entry.dataSource === 'daily_synthesis';
            const isPending = entry.status === 'pending';
            const isRejected = entry.status === 'rejected';
            const assessment = entry.assessment ? ASSESSMENT_CONFIG[entry.assessment] : null;
            const hasQuantitative = entry.pctToThreshold !== null;

            return (
              <tr
                key={entry.id ?? i}
                className={`border-b border-border/50 ${
                  isRejected
                    ? 'opacity-40 line-through'
                    : isPending
                    ? 'border-l-2 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20'
                    : isDailySynthesis
                    ? 'bg-slate-50/60 dark:bg-slate-900/30'
                    : 'hover:bg-muted/30'
                }`}
              >
                {/* Date */}
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(entry.snapshotDate)}
                </td>

                {/* Source */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${src.cls}`}>
                      {isDailySynthesis && <span className="mr-1">★</span>}
                      {src.label}
                    </span>
                    {isPending && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        Pending
                      </span>
                    )}
                  </div>
                </td>

                {/* Assessment or quantitative value */}
                <td className="px-3 py-2">
                  {assessment ? (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${assessment.cls}`}>
                      {assessment.label}
                    </span>
                  ) : hasQuantitative ? (
                    <span className="text-xs font-mono text-foreground">
                      {formatValue(entry.observedValue, entry.thresholdValue, entry.pctToThreshold, entry.unit)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Note */}
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-0">
                  {(() => {
                    const note = extractNote(entry.evidenceSummary, entry.dataSource);
                    return note ? (
                      <p className="line-clamp-2 leading-relaxed">{note}</p>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    );
                  })()}
                </td>

                {/* Dismiss action */}
                {onReject && (
                  <td className="px-3 py-2 text-right">
                    {isPending && (
                      <button
                        onClick={() => onReject(entry.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        title="Dismiss this observation"
                      >
                        Dismiss
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
