import { getMacroThesisById, getLinkedAssetViewsForThesis, getLinkedStrategiesForThesis } from '@/db/queries/macroTheses';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface ThesisDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ThesisDetailPage({ params }: ThesisDetailPageProps) {
  const { id } = await params;
  const [thesis, linkedViews, linkedStrategies] = await Promise.all([
    getMacroThesisById(id),
    getLinkedAssetViewsForThesis(id),
    getLinkedStrategiesForThesis(id),
  ]);

  if (!thesis) {
    notFound();
  }

  return (
    <DashboardShell
      title={thesis.title}
      subtitle="Macro Thesis Detail"
      activeNav="theses"
    >
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Overview</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Thesis Type</dt>
              <dd className="mt-1 text-sm text-slate-900">{thesis.thesisType}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Time Horizon</dt>
              <dd className="mt-1 text-sm text-slate-900">{thesis.timeHorizon ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Confidence Level</dt>
              <dd className="mt-1 text-sm text-slate-900">{thesis.confidenceLevel ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Status</dt>
              <dd className="mt-1">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  thesis.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  thesis.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-200 text-slate-700'
                }`}>
                  {thesis.status}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {thesis.description ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Description</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{thesis.description}</p>
          </div>
        ) : null}

        {thesis.notes !== null && thesis.notes !== undefined ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Notes</h3>
            <pre className="text-sm text-slate-700 whitespace-pre-wrap">
              {JSON.stringify(thesis.notes, null, 2)}
            </pre>
          </div>
        ) : null}

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Linked Asset Views ({linkedViews.length})</h3>
          {linkedViews.length === 0 ? (
            <p className="text-sm text-slate-500">No asset views linked to this thesis yet.</p>
          ) : (
            <div className="space-y-2">
              {linkedViews.map((view) => (
                <div key={view.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                  <div className="flex-1">
                    <Link href={`/asset-views/${view.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                      {view.title}
                    </Link>
                    {view.underlyingTicker && (
                      <span className="ml-2 text-xs text-slate-500">({view.underlyingTicker})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {view.confidenceLevel && (
                      <span className="text-slate-600">{view.confidenceLevel}</span>
                    )}
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      view.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      view.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {view.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Linked Strategies ({linkedStrategies.length})</h3>
          {linkedStrategies.length === 0 ? (
            <p className="text-sm text-slate-500">No strategies linked to this thesis yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b">
                    <th className="pb-2">Strategy</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Account</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linkedStrategies.map((strategy) => (
                    <tr key={strategy.id} className="hover:bg-slate-50">
                      <td className="py-2">
                        <Link href={`/strategies/${strategy.id}/triage`} className="text-blue-600 hover:text-blue-800 font-medium">
                          {strategy.label || strategy.strategyKey}
                        </Link>
                      </td>
                      <td className="py-2 text-slate-600">{strategy.strategyType || '—'}</td>
                      <td className="py-2 text-slate-600">{strategy.accountLabel || strategy.accountBrokerId || '—'}</td>
                      <td className="py-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          strategy.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                          strategy.status === 'closed' ? 'bg-slate-200 text-slate-700' :
                          strategy.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {strategy.status}
                        </span>
                      </td>
                      <td className="py-2 text-slate-600">
                        {strategy.openedAt ? new Date(strategy.openedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
