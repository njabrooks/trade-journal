import { getAssetViewById, getLinkedStrategiesForAssetView } from '@/db/queries/assetViews';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { EvidenceDisplay } from '@/components/research/EvidenceDisplay';

interface AssetViewDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AssetViewDetailPage({ params }: AssetViewDetailPageProps) {
  const { id } = await params;
  const [view, linkedStrategies] = await Promise.all([
    getAssetViewById(id),
    getLinkedStrategiesForAssetView(id),
  ]);

  if (!view) {
    notFound();
  }

  return (
    <DashboardShell
      title={view.title}
      subtitle="Asset View Detail"
      activeNav="asset-views"
    >
      <div className="space-y-6">
        {/* Overview Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Overview</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Underlying</dt>
              <dd className="mt-1 text-sm text-slate-900">
                {view.underlying?.ticker ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Macro Thesis</dt>
              <dd className="mt-1 text-sm text-slate-900">
                {view.macroThesis ? (
                  <Link
                    href={`/theses/${view.macroThesis.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {view.macroThesis.title}
                  </Link>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Time Horizon</dt>
              <dd className="mt-1 text-sm text-slate-900">{view.timeHorizon ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Confidence Level</dt>
              <dd className="mt-1 text-sm text-slate-900">{view.confidenceLevel ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Status</dt>
              <dd className="mt-1">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  view.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  view.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-200 text-slate-700'
                }`}>
                  {view.status}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Description & Narrative */}
        {(view.description || view.narrative) && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Description & Narrative</h3>
            {view.description && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-slate-500 mb-2">Description</h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{view.description}</p>
              </div>
            )}
            {view.narrative && (
              <div>
                <h4 className="text-sm font-medium text-slate-500 mb-2">Narrative</h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{view.narrative}</p>
              </div>
            )}
          </div>
        )}

        {/* Context Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {view.fundamentalContext && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold mb-2">Fundamental Context</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {view.fundamentalContext}
              </p>
            </div>
          )}
          {view.positioningContext && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold mb-2">Positioning Context</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {view.positioningContext}
              </p>
            </div>
          )}
          {view.regimeContext && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold mb-2">Regime Context</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {view.regimeContext}
              </p>
            </div>
          )}
        </div>

        {/* Evidence & Research */}
        <EvidenceDisplay hierarchyType="assetView" hierarchyId={id} />

        {/* Linked Strategies */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Linked Strategies ({linkedStrategies.length})</h3>
          {linkedStrategies.length === 0 ? (
            <p className="text-sm text-slate-500">No strategies linked to this asset view yet.</p>
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
