import { getMacroThesesList } from '@/db/queries/macroTheses';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { CreateThesisButton } from '@/components/theses/CreateThesisButton';
import Link from 'next/link';

export default async function MacroThesesPage() {
  const theses = await getMacroThesesList();

  return (
    <DashboardShell
      title="Macro Theses"
      subtitle="Cross-asset beliefs and secular trends"
      activeNav="theses"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {theses.length} {theses.length === 1 ? 'thesis' : 'theses'}
          </div>
          <CreateThesisButton />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Time Horizon
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Asset Views
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Strategies
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {theses.map((thesis) => (
                <tr key={thesis.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/theses/${thesis.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {thesis.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {thesis.thesisType}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {thesis.timeHorizon ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {thesis.confidenceLevel ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      thesis.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      thesis.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {thesis.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-center">
                    {thesis.assetViewCount}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-center">
                    {thesis.strategyCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {theses.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No macro theses yet. Create your first thesis to get started.
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
