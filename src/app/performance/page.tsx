import { Metadata } from 'next';
import Link from 'next/link';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { LifecycleBadge } from '@/components/ui/lifecycle-badge';
import { ConfidenceBadge } from '@/components/performance/ConfidenceBadge';
import { RetrospectiveCard } from '@/components/performance/RetrospectiveCard';
import {
  getPerformanceOverview,
  type ThesisPerformanceSummary,
} from '@/db/queries/thesisPerformance';
import { formatCurrency } from '@/lib/formatters';

export const metadata: Metadata = {
  title: 'Performance',
};

export const dynamic = 'force-dynamic';

function pnlClass(value: number): string {
  return value >= 0 ? 'text-emerald-600' : 'text-rose-600';
}

function SummaryCard({
  label,
  value,
  valueClass,
  badge,
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  badge?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {badge}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold ${valueClass ?? 'text-foreground'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ThesisPerformanceTable({
  theses,
  basePath,
}: {
  theses: ThesisPerformanceSummary[];
  basePath: '/asset-theses' | '/macro-theses';
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Thesis</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Strategies</th>
            <th className="px-4 py-2 text-right font-medium">Realized</th>
            <th className="px-4 py-2 text-right font-medium">Unrealized</th>
            <th className="px-4 py-2 text-right font-medium">Cumulative PnL</th>
          </tr>
        </thead>
        <tbody>
          {theses.map((t) => (
            <tr key={t.thesisId} className="border-b last:border-0">
              <td className="max-w-md px-4 py-2.5">
                <Link
                  href={`${basePath}/${t.thesisId}/overview`}
                  className="font-medium hover:underline"
                >
                  {t.ticker && (
                    <span className="mr-1.5 font-mono text-muted-foreground">{t.ticker}</span>
                  )}
                  {t.title}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                <LifecycleBadge phase={t.status} size="sm" showTooltip={false} />
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{t.strategyCount}</td>
              <td className="px-4 py-2.5 text-right">
                <span className="inline-flex items-center gap-1.5">
                  <ConfidenceBadge confidence={t.confidence} />
                  <span className={`font-mono tabular-nums ${pnlClass(t.latestRealized)}`}>
                    {formatCurrency(t.latestRealized)}
                  </span>
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <span className={`font-mono tabular-nums ${pnlClass(t.latestUnrealized)}`}>
                  {formatCurrency(t.latestUnrealized)}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <span
                  className={`font-mono font-medium tabular-nums ${pnlClass(t.latestCumulative)}`}
                >
                  {formatCurrency(t.latestCumulative)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PerformancePage() {
  const overview = await getPerformanceOverview();

  // Asset-thesis totals are additive (a strategy belongs to exactly one
  // asset thesis); macro totals are NOT (full-credit exposure views).
  const totalCumulative = overview.assetTheses.reduce((s, t) => s + t.latestCumulative, 0);
  const totalRealized = overview.assetTheses.reduce((s, t) => s + t.latestRealized, 0);
  const totalUnrealized = overview.assetTheses.reduce((s, t) => s + t.latestUnrealized, 0);
  const weakestConfidence = overview.assetTheses.some((t) => t.confidence === 'no_trades')
    ? ('no_trades' as const)
    : overview.assetTheses.some((t) => t.confidence === 'partial_history')
      ? ('partial_history' as const)
      : ('full' as const);

  return (
    <DashboardShell
      activeNav="performance"
      title="Performance"
      subtitle="P&L attribution across the belief hierarchy — macro → asset → strategy"
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Cumulative PnL"
          value={formatCurrency(totalCumulative)}
          valueClass={pnlClass(totalCumulative)}
          badge={<ConfidenceBadge confidence={weakestConfidence} />}
          hint="Sum across asset theses with expressed strategies"
        />
        <SummaryCard
          label="Realized"
          value={formatCurrency(totalRealized)}
          valueClass={pnlClass(totalRealized)}
          badge={<ConfidenceBadge confidence={weakestConfidence} />}
        />
        <SummaryCard
          label="Unrealized"
          value={formatCurrency(totalUnrealized)}
          valueClass={pnlClass(totalUnrealized)}
        />
        <SummaryCard
          label="Theses with strategies"
          value={`${overview.assetTheses.length} asset · ${overview.macroTheses.length} macro`}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Macro theses</h3>
          <p className="text-xs text-muted-foreground">
            Exposure views — each linked asset thesis contributes its full P&amp;L to every macro
            it supports, so macro totals can double-count and do not sum to the portfolio.
          </p>
        </div>
        {overview.macroTheses.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No macro theses with linked performing asset theses yet.
          </p>
        ) : (
          <ThesisPerformanceTable theses={overview.macroTheses} basePath="/macro-theses" />
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Asset theses</h3>
        {overview.assetTheses.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No asset theses with snapshotted strategies yet.
          </p>
        ) : (
          <ThesisPerformanceTable theses={overview.assetTheses} basePath="/asset-theses" />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Retrospectives</h3>
          <p className="text-xs text-muted-foreground">
            Completed and rejected theses — was the call right, and did it pay.
          </p>
        </div>
        {overview.retrospectives.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No completed or rejected theses yet. Cards appear here when a thesis closes.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.retrospectives.map((t) => (
              <RetrospectiveCard key={t.thesisId} thesis={t} />
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
