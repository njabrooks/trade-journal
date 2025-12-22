import { getResearchArtifactById, getResearchInsightByArtifactId } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProcessButton } from '@/components/research/ProcessButton';
import { InsightReview } from '@/components/research/InsightReview';
import { MappingsSection } from '@/components/research/MappingsSection';
import { AnalyzeHierarchyButton } from '@/components/research/AnalyzeHierarchyButton';
import { HierarchyRecommendationsPanel } from '@/components/research/HierarchyRecommendationsPanel';

interface ResearchDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ResearchDetailPage({ params }: ResearchDetailPageProps) {
  const { id } = await params;
  const artifact = await getResearchArtifactById(id);

  if (!artifact) {
    notFound();
  }

  const insight = await getResearchInsightByArtifactId(id);

  return (
    <DashboardShell
      title={artifact.title}
      subtitle="Research Artifact Detail"
      activeNav="research"
    >
      <div className="space-y-6">
        {/* Metadata Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Metadata</h3>
            {!insight && artifact.status === 'raw' && <ProcessButton artifactId={artifact.id} />}
          </div>

          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Source Type</dt>
              <dd className="mt-1 text-sm text-slate-900 capitalize">{artifact.sourceType}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Status</dt>
              <dd className="mt-1">
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
              </dd>
            </div>
            {artifact.author && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Author</dt>
                <dd className="mt-1 text-sm text-slate-900">{artifact.author}</dd>
              </div>
            )}
            {artifact.publishedDate && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Published</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {new Date(artifact.publishedDate).toLocaleDateString()}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-slate-500">Ingested</dt>
              <dd className="mt-1 text-sm text-slate-900">
                {new Date(artifact.ingestedAt).toLocaleDateString()}
              </dd>
            </div>
            {artifact.sourceUrl && (
              <div className="col-span-2">
                <dt className="text-sm font-medium text-slate-500">Source URL</dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={artifact.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 break-all"
                  >
                    {artifact.sourceUrl}
                  </a>
                </dd>
              </div>
            )}
            {artifact.tags && artifact.tags.length > 0 && (
              <div className="col-span-2">
                <dt className="text-sm font-medium text-slate-500">Tags</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {artifact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* AI-Generated Insight */}
        {insight && (
          <div className="space-y-4">
            <InsightReview insight={insight} artifactId={artifact.id} />
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">
                    Hierarchy Analysis
                  </h4>
                  <p className="text-sm text-blue-700">
                    Analyze this research against existing macro theses and asset views to get AI
                    recommendations for creating new items or linking to existing ones.
                  </p>
                </div>
                <AnalyzeHierarchyButton insightId={insight.id} />
              </div>
            </div>
          </div>
        )}

        {/* AI Recommendations */}
        {insight && (
          <div key={insight.id}>
            <HierarchyRecommendationsPanel insightId={insight.id} />
          </div>
        )}

        {/* Research Mappings */}
        <MappingsSection insightId={insight?.id || null} artifactStatus={artifact.status} />

        {/* Error Display */}
        {artifact.status === 'error' && artifact.processingError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Processing Error</h3>
            <p className="text-sm text-red-800">{artifact.processingError}</p>
            <div className="mt-4">
              <ProcessButton artifactId={artifact.id} />
            </div>
          </div>
        )}

        {/* Raw Content */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Raw Content</h3>
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
              {artifact.rawContent}
            </pre>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            {artifact.rawContent.split(/\s+/).filter(Boolean).length} words •{' '}
            {Math.ceil(artifact.rawContent.split(/\s+/).filter(Boolean).length / 200)} min read
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Link href="/research">
            <Button variant="outline">Back to Library</Button>
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
