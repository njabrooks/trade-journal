'use client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(date: string | Date): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatValue(observed: number | null, threshold: number | null, pct: number | null, unit: string | null): string {
  if (pct !== null) {
    const pctStr = `${pct.toFixed(1)}%`;
    if (observed !== null && threshold !== null) {
      const fmt = (n: number) => n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(1)}B`
        : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
        : n < 0.01 ? n.toFixed(6)
        : n.toFixed(2);
      const unitLabel = unit && unit !== 'USD' && unit !== 'BTC_RATIO' ? ` ${unit}` : '';
      return `${fmt(observed)} → ${fmt(threshold)}${unitLabel} (${pctStr})`;
    }
    return pctStr;
  }
  return '—';
}

const SOURCE_CONFIG: Record<string, { label: string; cls: string }> = {
  daily_synthesis: { label: 'Daily Rollup', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  thesis_monitor:  { label: 'Thesis Monitor', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  world_monitor:   { label: 'World Monitor', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  qualitative:     { label: 'Research', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  defillama:       { label: 'DeFiLlama', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  derived:         { label: 'Derived', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  economic_calendar: { label: 'Econ. Calendar', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

function getSourceConfig(dataSource: string): { label: string; cls: string } {
  if (dataSource in SOURCE_CONFIG) return SOURCE_CONFIG[dataSource];
  if (dataSource.startsWith('price_history_')) {
    const ticker = dataSource.replace('price_history_', '').toUpperCase();
    return { label: `Price (${ticker})`, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' };
  }
  return { label: dataSource, cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' };
}

const ASSESSMENT_CONFIG: Record<string, { label: string; cls: string }> = {
  neutral:       { label: 'Neutral',       cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  strengthening: { label: 'Strengthening', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  weakening:     { label: 'Weakening',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  confirmed:     { label: 'Confirmed',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  invalidated:   { label: 'Invalidated',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
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
}

interface SignalLogProps {
  entries: SignalLogEntry[];
}

export function SignalLog({ entries }: SignalLogProps) {
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
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const src = getSourceConfig(entry.dataSource);
            const isDailySynthesis = entry.dataSource === 'daily_synthesis';
            const assessment = entry.assessment ? ASSESSMENT_CONFIG[entry.assessment] : null;
            const hasQuantitative = entry.pctToThreshold !== null;

            return (
              <tr
                key={entry.id ?? i}
                className={`border-b border-border/50 ${isDailySynthesis ? 'bg-slate-50/60 dark:bg-slate-900/30' : 'hover:bg-muted/30'}`}
              >
                {/* Date */}
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(entry.snapshotDate)}
                </td>

                {/* Source */}
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${src.cls}`}>
                    {isDailySynthesis && <span className="mr-1">★</span>}
                    {src.label}
                  </span>
                </td>

                {/* Assessment or quantitative value */}
                <td className="px-3 py-2">
                  {assessment ? (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${assessment.cls}`}>
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
                  {entry.evidenceSummary ? (
                    <p className="line-clamp-2 leading-relaxed">{entry.evidenceSummary}</p>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
