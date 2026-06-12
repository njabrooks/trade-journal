import Link from 'next/link';
import { LifecycleBadge } from '@/components/ui/lifecycle-badge';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ThesisPerformanceSummary } from '@/db/queries/thesisPerformance';

/**
 * "Was I right, did it pay" card for a completed/rejected thesis (D10).
 * Data-driven for now; the W8 retrospective job will append a narrative
 * journal entry these cards can later surface.
 */
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
        {thesis.outcome && <span className="capitalize">Outcome: {thesis.outcome}</span>}
        <span>
          {formatDateShort(openedAt)} → {formatDateShort(closedAt)} ({durationDays}d)
        </span>
      </div>

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
