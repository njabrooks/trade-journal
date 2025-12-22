import { getResearchArtifactsList } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function ResearchPage() {
  const artifacts = await getResearchArtifactsList();

  return (
    <DashboardShell
      title="Research Library"
      subtitle="Research artifacts and insights"
      activeNav="research"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
          </div>
          <Link href="/research/upload">
            <Button>Upload Research</Button>
          </Link>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Source Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Author
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Tags
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Ingested
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {artifacts.map((artifact) => (
                <tr key={artifact.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/research/${artifact.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {artifact.title}
                    </Link>
                    {artifact.sourceUrl && (
                      <div className="text-xs text-slate-500 mt-1 truncate max-w-md">
                        <a
                          href={artifact.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600"
                        >
                          {artifact.sourceUrl}
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 capitalize">
                    {artifact.sourceType}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{artifact.author || '—'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        artifact.status === 'structured'
                          ? 'bg-emerald-100 text-emerald-700'
                          : artifact.status === 'processing'
                            ? 'bg-blue-100 text-blue-700'
                            : artifact.status === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {artifact.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {artifact.tags && artifact.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {artifact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {artifact.tags.length > 3 && (
                          <span className="text-xs text-slate-500">
                            +{artifact.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(artifact.ingestedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {artifacts.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p className="mb-4">No research artifacts yet.</p>
              <Link href="/research/upload">
                <Button>Upload Your First Research</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
