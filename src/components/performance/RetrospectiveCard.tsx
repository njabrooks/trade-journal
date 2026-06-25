import Link from 'next/link';
import { LifecycleBadge } from '@/components/ui/lifecycle-badge';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { ConfidenceBadge } from './ConfidenceBadge';
import { BeliefBadge, ExecutionBadge } from './ExecutionBadge';
import type { ThesisPerformanceSummary } from '@/db/queries/thesisPerformance';

/**
 * "Was I right, did it pay" card for a resolved thesis (D10), on two axes
 * (docs/v2/07 §4d): the BELIEF verdict (outcome) and the EXECUTION verdict
 * (did we capture the available P&L — MFE/MAE/capture from retrospectiveMetrics).
 */
function compact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '+';
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${abs.toFixed(0)}`;
}

export function RetrospectiveCard({ thesis }: { thesis: ThesisPerformanceSummary }) {
  const href =
    thesis.thesisType === 'asset'
      ? `/asset-theses/${thesis.thesisId}/overview`
      : `/macro-theses/${thesis.thesisId}/overview`;

  const closedAt = thesis.actualOutcomeDate ?? thesis.updatedAt;
  const openedAt = thesis.firstSnapshotDate ?? thesis.createdAt;
  const durationDays = Math.max(
    0,
    Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 86_400_000)
  );

  const paid = thesis.latestCumulative >= 0;
  const m = thesis.retrospectiveMetrics;
  const captured =
    m && !m.neverInProfit && m.captureRatio != null && m.captureRatio > 0
      ? `captured ${Math.round(m.captureRatio * 100)}%`
      : m && !m.neverInProfit
        ? 'gave back the move'
        : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Link href={href} className="font-medium leading-snug hover:underline">
          {thesis.ticker && (
            <span className="mr-1.5 font-mono text-muted-foreground">{thesis.ticker}</span>
          )}
          {thesis.title}
        </Link>
        <LifecycleBadge phase={thesis.status} size="sm" showTooltip={false} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="capitalize">{thesis.thesisType} thesis</span>
        {thesis.direction && <span className="capitalize">{thesis.direction}</span>}
        <span>
          {formatDateShort(openedAt)} → {formatDateShort(closedAt)} ({durationDays}d)
        </span>
      </div>

      {/* Two axes: belief (outcome) + execution (capture quality) */}
      {(thesis.outcome || m?.executionQuality) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
          {thesis.outcome && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground">Belief</span>
              <BeliefBadge outcome={thesis.outcome} />
            </span>
          )}
          {m?.executionQuality && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground">·</span>
              <ExecutionBadge quality={m.executionQuality} />
            </span>
          )}
        </div>
      )}

      <div className="flex items-baseline gap-2">
        <span
          className={`text-2xl font-semibold ${paid ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {formatCurrency(thesis.latestCumulative)}
        </span>
        <ConfidenceBadge confidence={thesis.confidence} />
        {thesis.strategyCount === 0 && (
          <span className="text-xs text-muted-foreground">never expressed in a strategy</span>
        )}
      </div>

      {/* Excursion strip — the execution axis at a glance */}
      {m && m.pointCount > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {m.neverInProfit ? (
            <span>Never in profit</span>
          ) : (
            <>
              <span>
                Peak <span className="font-mono text-emerald-600">{compact(m.mfe)}</span>
              </span>
              {captured && (
                <>
                  <span>·</span>
                  <span className="font-medium text-foreground">{captured}</span>
                </>
              )}
            </>
          )}
          {!m.neverUnderwater && (
            <>
              <span>·</span>
              <span>
                drawdown <span className="font-mono text-rose-600">{compact(m.mae)}</span>
              </span>
            </>
          )}
        </p>
      )}

      {thesis.strategyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatCurrency(thesis.latestRealized)} realized ·{' '}
          {formatCurrency(thesis.latestUnrealized)} unrealized · {thesis.strategyCount}{' '}
          {thesis.strategyCount === 1 ? 'strategy' : 'strategies'}
        </p>
      )}

      {thesis.outcomeNotes && (
        <p className="line-clamp-3 text-xs text-muted-foreground">{thesis.outcomeNotes}</p>
      )}
    </div>
  );
}
