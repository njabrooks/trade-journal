import type { Metadata } from 'next';
import { getResearchArtifactById, getResearchInsightByArtifactId, getMainClaimsForArtifact } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { WorkflowStatusCard } from '@/components/research/WorkflowStatusCard';
import { EmptyClaimsState } from '@/components/research/EmptyClaimsState';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import type { ClaimsStructure } from '@/types/claims';
import { isValidClaimsStructure, getUnconvertedClaims, getConvertedClaims } from '@/types/claims';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Clock } from 'lucide-react';

interface ResearchDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ResearchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const artifact = await getResearchArtifactById(id);

  return {
    title: artifact?.title ?? 'Research',
  };
}

export default async function ResearchDetailPage({ params }: ResearchDetailPageProps) {
  const { id } = await params;
  const artifact = await getResearchArtifactById(id);

  if (!artifact) {
    notFound();
  }

  const insight = await getResearchInsightByArtifactId(id);

  // Fetch claims from main_claims table (normalized source of truth)
  const claimsWithSources = await getMainClaimsForArtifact(id);

  // Calculate claims statistics from main_claims table
  const hasClaims = claimsWithSources.length > 0;
  const mainClaimsCount = claimsWithSources.length;

  // Get evidence claims count from JSONB if available (for display purposes)
  const hasClaimsStructure: boolean = !!(insight?.claimsStructure && isValidClaimsStructure(insight.claimsStructure));
  const claimsStructure = hasClaimsStructure ? (insight!.claimsStructure as ClaimsStructure) : null;
  const evidenceClaimsCount = claimsStructure?.evidence_claims.length || 0;

  // Count conversion status from claim status field (standardized #ENH-048)
  // Note: Conversion tracking is done via status field and separate join tables
  const draftCount = claimsWithSources.filter(c => c.claim.status === 'draft').length;
  const activeCount = claimsWithSources.filter(c => c.claim.status === 'active').length;

  return (
    <DashboardShell
      title={artifact.title}
      subtitle="Research Artifact"
      activeNav="research"
    >
      <div className="space-y-6">
        {/* Compact Metadata & Workflow Status - Side by Side */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Metadata Card - Compact */}
          <div className="bg-card rounded-lg border border p-4">
            <h3 className="text-base font-semibold mb-3">Metadata</h3>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Source</dt>
                <dd className="mt-0.5 text-sm text-foreground capitalize">{artifact.sourceType}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      artifact.status === 'structured'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : artifact.status === 'processing'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : artifact.status === 'error'
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {artifact.status}
                  </span>
                </dd>
              </div>
              {artifact.author && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Author</dt>
                  <dd className="mt-0.5 text-sm text-foreground line-clamp-1">{artifact.author}</dd>
                </div>
              )}
              {artifact.publishedDate && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Published</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {new Date(artifact.publishedDate).toLocaleDateString('en-GB')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Ingested</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {new Date(artifact.ingestedAt).toLocaleDateString('en-GB')}
                </dd>
              </div>
              {artifact.sourceUrl && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Source URL</dt>
                  <dd className="mt-0.5 text-xs">
                    <a
                      href={artifact.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-blue-600 hover:underline transition-colors break-all line-clamp-1"
                      title={artifact.sourceUrl}
                    >
                      {artifact.sourceUrl}
                    </a>
                  </dd>
                </div>
              )}
              {artifact.tags && artifact.tags.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground mb-1">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {artifact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex px-1.5 py-0.5 text-xs bg-muted text-foreground rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Workflow Status Card - Compact */}
          {insight && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Workflow Status</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Processing progress
                  </p>
                </div>
                {draftCount === 0 && activeCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                {/* Step 1: Uploaded */}
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground font-medium">Uploaded to database</span>
                </div>

                {/* Step 2: Claims Extracted */}
                <div className="flex items-start gap-2">
                  {hasClaimsStructure ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  )}
                  <span className={`text-sm ${hasClaimsStructure ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {hasClaimsStructure ? (
                      <>
                        Claims extracted{' '}
                        <span className="text-muted-foreground font-normal">
                          ({mainClaimsCount} main, {evidenceClaimsCount} evidence)
                        </span>
                      </>
                    ) : (
                      'Claims not yet extracted'
                    )}
                  </span>
                </div>

                {/* Step 3: Conversion Status */}
                {hasClaimsStructure && draftCount > 0 && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                      <span className="text-blue-700 dark:text-blue-300">{draftCount}</span> claim
                      {draftCount !== 1 ? 's' : ''} ready to link
                    </span>
                  </div>
                )}

                {/* Step 4: Linked Count */}
                {activeCount > 0 && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground font-medium">
                      <span className="text-emerald-600 dark:text-emerald-400">{activeCount}</span> claim
                      {activeCount !== 1 ? 's' : ''} linked to theses
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Claims Browser or Empty State */}
        {hasClaims ? (
          <UnifiedClaimsBrowser
            claimsWithSources={claimsWithSources}
            filterArtifactId={artifact.id}
          />
        ) : insight ? (
          <EmptyClaimsState
            rawContent={artifact.rawContent}
            artifactId={artifact.id}
          />
        ) : null}

        {/* Error Display */}
        {artifact.status === 'error' && artifact.processingError && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Processing Error</h3>
            <p className="text-sm text-red-800 dark:text-red-300">{artifact.processingError}</p>
          </div>
        )}

        {/* Raw Content - Collapsible */}
        <details className="bg-card rounded-lg border border group">
          <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-muted transition-colors">
            <div>
              <h3 className="text-lg font-semibold">Raw Content</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {artifact.rawContent.split(/\s+/).filter(Boolean).length} words •{' '}
                {Math.ceil(artifact.rawContent.split(/\s+/).filter(Boolean).length / 200)} min read
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground group-open:hidden" />
            <ChevronUp className="h-5 w-5 text-muted-foreground hidden group-open:block" />
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border">
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
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
