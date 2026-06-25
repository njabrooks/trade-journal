import {
  Flag,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Shield,
  Activity,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { BeliefBadge, ExecutionBadge } from './ExecutionBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { RetrospectiveExcursionChart } from './RetrospectiveExcursionChart';
import type { RetrospectiveView, EventSeverity, RetrospectiveEventKind } from '@/db/queries/retrospectiveView';

/**
 * The per-thesis retrospective (docs/v2/07 §4d): two-axis verdict (belief + execution),
 * the excursion metrics, the annotated P&L curve, and the process timeline that fuses
 * signal flips / advisor recs / re-underwrites / decisions onto the curve. The narrative
 * is the /thesis-review writeup.
 */
const SEVERITY_TEXT: Record<EventSeverity, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
  neutral: 'text-muted-foreground',
};

const KIND_ICON: Record<RetrospectiveEventKind, LucideIcon> = {
  open: Flag,
  close: Flag,
  mfe: TrendingUp,
  mae: TrendingDown,
  signal_verdict: Activity,
  advisor_rec: Shield,
  reunderwrite: RefreshCw,
  decision: AlertCircle,
};

function pnlClass(value: number): string {
  return value >= 0 ? 'text-emerald-600' : 'text-rose-600';
}

function MetricCell({
  label,
  value,
  valueClass,
  badge,
}: {
  label: string;
  value: string;
  valueClass?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {badge}
      </p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass ?? 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

export function RetrospectivePanel({ view }: { view: RetrospectiveView }) {
  const { excursion: m, events, executionQuality, narrative, headline, thesis } = view;
  const conf = <ConfidenceBadge confidence={m.confidence} />;

  const capturePct = m.captureRatio != null ? Math.round(m.captureRatio * 100) : null;
  const summary = m.neverInProfit
    ? 'Never in profit — the lesson is entry/sizing, not exit timing.'
    : capturePct != null && capturePct > 0
      ? `Captured ${capturePct}% of a ${formatCurrency(m.mfe)} peak${m.giveBackFromPeak ? `, gave back ${formatCurrency(m.giveBackFromPeak)}` : ''}.`
      : `Peaked at ${formatCurrency(m.mfe)} but closed at a loss — gave back the entire move.`;

  return (
    <div className="flex flex-col gap-4">
      {/* Two-axis verdict */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Belief</span>
          {thesis.outcome ? (
            <BeliefBadge outcome={thesis.outcome} />
          ) : (
            <span className="text-muted-foreground">unjudged</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Execution</span>
          {executionQuality ? (
            <ExecutionBadge quality={executionQuality} />
          ) : (
            <span className="text-muted-foreground">unrated — run /thesis-review</span>
          )}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{summary}</p>

      {/* Excursion metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCell
          label="Peak (MFE)"
          value={formatCurrency(m.mfe)}
          valueClass={pnlClass(m.mfe)}
          badge={conf}
        />
        <MetricCell
          label="Closed at"
          value={formatCurrency(m.finalCumulative)}
          valueClass={pnlClass(m.finalCumulative)}
        />
        <MetricCell
          label="Captured"
          value={m.neverInProfit ? '—' : capturePct != null && capturePct > 0 ? `${capturePct}%` : '0%'}
        />
        <MetricCell
          label="Max drawdown (MAE)"
          value={formatCurrency(m.mae)}
          valueClass={pnlClass(m.mae)}
          badge={conf}
        />
      </div>

      {/* Attribution — who carried the result (macro: by asset thesis; asset: by strategy) */}
      {view.contributors.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contribution — by {thesis.thesisType === 'macro' ? 'asset thesis' : 'strategy'}
          </p>
          <div className="flex flex-col gap-1.5">
            {view.contributors.map((c, i) => (
              <div key={`${c.label}-${i}`} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate">
                  {c.ticker && (
                    <span className="mr-1 font-mono text-xs text-muted-foreground">{c.ticker}</span>
                  )}
                  {c.label}
                </span>
                <div className="relative h-2 flex-1 rounded bg-muted/40">
                  <div
                    className={`absolute inset-y-0 left-0 rounded ${c.finalCumulative >= 0 ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                    style={{ width: `${c.pctOfGross}%` }}
                  />
                </div>
                <span
                  className={`w-20 shrink-0 text-right font-mono tabular-nums ${pnlClass(c.finalCumulative)}`}
                >
                  {formatCurrency(c.finalCumulative)}
                </span>
                <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
                  {c.pctOfGross}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Annotated excursion curve */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Cumulative P&amp;L over the hold — peak, trough, and what the process showed
        </p>
        <RetrospectiveExcursionChart combined={view.combined} excursion={m} events={events} />
      </div>

      {/* Process timeline */}
      {events.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What the process showed at each turn
          </p>
          <ol className="flex flex-col">
            {events.map((e, i) => {
              const Icon = KIND_ICON[e.kind] ?? Flag;
              return (
                <li
                  key={`${e.date}-${e.kind}-${i}`}
                  className="flex items-start gap-3 border-b border-border/60 py-1.5 last:border-0"
                >
                  <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                    {formatDateShort(e.date)}
                  </span>
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${SEVERITY_TEXT[e.severity]}`} />
                  <span className="text-sm">
                    <span className="font-medium">{e.label}</span>
                    {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Narrative */}
      {(headline || narrative) && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {headline && <p className="mb-1 text-sm font-medium">{headline}</p>}
          {narrative && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{narrative}</p>
          )}
          {view.retrospectiveAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Retrospective recorded {formatDateShort(view.retrospectiveAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
