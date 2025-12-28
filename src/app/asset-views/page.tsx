import { getAssetViewsList } from '@/db/queries/assetViews';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { CreateAssetViewButton } from '@/components/asset-views/CreateAssetViewButton';
import Link from 'next/link';

export default async function AssetViewsPage() {
  const views = await getAssetViewsList();

  return (
    <DashboardShell
      title="Asset Views"
      subtitle="Asset-specific theses and investment beliefs"
      activeNav="asset-views"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {views.length} {views.length === 1 ? 'view' : 'views'}
          </div>
          <CreateAssetViewButton />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Underlying
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Macro Thesis
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Strategies
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {views.map((view) => (
                <tr key={view.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/asset-views/${view.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {view.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {view.ticker ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {view.macroThesisTitle ? (
                      <Link
                        href={`/theses/${view.macroThesisId}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {view.macroThesisTitle}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {view.confidenceLevel ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      view.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      view.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {view.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-center">
                    {view.strategyCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {views.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No asset views yet. Create your first view to get started.
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
