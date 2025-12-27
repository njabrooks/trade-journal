import { getResearchArtifactById, getResearchInsightByArtifactId } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { WorkflowStatusCard } from '@/components/research/WorkflowStatusCard';
import { EmptyClaimsState } from '@/components/research/EmptyClaimsState';
import { ClaimsBrowser } from '@/components/research/ClaimsBrowser';
import type { ClaimsStructure } from '@/types/claims';
import { isValidClaimsStructure, getUnconvertedClaims, getConvertedClaims } from '@/types/claims';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

  // Calculate claims statistics
  const hasClaimsStructure: boolean = !!(insight?.claimsStructure && isValidClaimsStructure(insight.claimsStructure));
  const claimsStructure = hasClaimsStructure ? (insight!.claimsStructure as ClaimsStructure) : null;

  const mainClaimsCount = claimsStructure?.main_claims.length || 0;
  const evidenceClaimsCount = claimsStructure?.evidence_claims.length || 0;
  const unconvertedClaims = claimsStructure ? getUnconvertedClaims(claimsStructure) : [];
  const convertedClaims = claimsStructure ? getConvertedClaims(claimsStructure) : [];
  const unconvertedCount = unconvertedClaims.length;
  const convertedCount = convertedClaims.length;

  return (
    <DashboardShell
      title={artifact.title}
      subtitle="Research Artifact"
      activeNav="research"
    >
      <div className="space-y-6">
        {/* Metadata Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Metadata</h3>

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

        {/* Workflow Status Card */}
        {insight && (
          <WorkflowStatusCard
            hasClaimsStructure={hasClaimsStructure}
            mainClaimsCount={mainClaimsCount}
            evidenceClaimsCount={evidenceClaimsCount}
            unconvertedCount={unconvertedCount}
            convertedCount={convertedCount}
          />
        )}

        {/* Claims Browser or Empty State */}
        {hasClaimsStructure && claimsStructure ? (
          <ClaimsBrowser
            claimsStructure={claimsStructure}
            insightId={insight!.id}
          />
        ) : insight ? (
          <EmptyClaimsState
            rawContent={artifact.rawContent}
            artifactId={artifact.id}
          />
        ) : null}

        {/* Error Display */}
        {artifact.status === 'error' && artifact.processingError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Processing Error</h3>
            <p className="text-sm text-red-800">{artifact.processingError}</p>
          </div>
        )}

        {/* Raw Content - Collapsible */}
        <details className="bg-white rounded-lg border border-slate-200 group">
          <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 transition-colors">
            <div>
              <h3 className="text-lg font-semibold">Raw Content</h3>
              <p className="text-sm text-slate-500 mt-1">
                {artifact.rawContent.split(/\s+/).filter(Boolean).length} words •{' '}
                {Math.ceil(artifact.rawContent.split(/\s+/).filter(Boolean).length / 200)} min read
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-slate-400 group-open:hidden" />
            <ChevronUp className="h-5 w-5 text-slate-400 hidden group-open:block" />
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-slate-200">
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
                {artifact.rawContent}
              </pre>
            </div>
          </div>
        </details>

        {/* Actions */}
        <div className="flex gap-4">
          <Link href="/research">
            <Button variant="outline">← Back to Library</Button>
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
