import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { MacroThesisPerformance } from '@/db/queries/thesisPerformance';

/**
 * Per-asset-thesis contribution table under a macro thesis (D8 drill-down:
 * macro → asset). Full-credit exposure view — disclosed by the parent chart.
 */
export function MacroAssetBreakdownTable({
  assetTheses,
}: {
  assetTheses: MacroThesisPerformance['assetTheses'];
}) {
  if (assetTheses.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Asset thesis</th>
            <th className="px-4 py-2 text-right font-medium">Strategies</th>
            <th className="px-4 py-2 text-right font-medium">Realized</th>
            <th className="px-4 py-2 text-right font-medium">Cumulative PnL</th>
          </tr>
        </thead>
        <tbody>
          {assetTheses.map((t) => (
            <tr key={t.assetThesisId} className="border-b last:border-0">
              <td className="px-4 py-2">
                <Link
                  href={`/asset-theses/${t.assetThesisId}/overview`}
                  className="font-medium hover:underline"
                >
                  {t.ticker && <span className="mr-1.5 font-mono text-muted-foreground">{t.ticker}</span>}
                  {t.title ?? 'Untitled'}
                </Link>
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{t.strategyCount}</td>
              <td className="px-4 py-2 text-right">
                <span className="inline-flex items-center gap-1.5">
                  <ConfidenceBadge confidence={t.confidence} />
                  <span
                    className={`font-mono tabular-nums ${t.latestRealized >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {formatCurrency(t.latestRealized)}
                  </span>
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <span
                  className={`font-mono tabular-nums ${t.latestCumulative >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
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
