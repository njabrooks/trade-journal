import type { Metadata } from 'next';
import { getMainClaimById } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { ExpandableEvidenceClaim } from '@/components/research/ExpandableEvidenceClaim';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { ClaimsStructure, EvidenceClaim } from '@/types/claims';
import { getSupportingEvidence, getRebuttingEvidence, isValidClaimsStructure } from '@/types/claims';

interface ClaimDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ClaimDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const claimData = await getMainClaimById(id);

  return {
    title: claimData?.claim?.title ?? 'Claim',
  };
}

export default async function ClaimDetailPage({ params }: ClaimDetailPageProps) {
  const { id } = await params;

  const claimData = await getMainClaimById(id);

  if (!claimData) {
    notFound();
  }

  const { claim, insight, artifact, linkedTheses, linkedViews } = claimData;

  // Get evidence claims from the audit structure if available
  const getEvidenceClaims = (): {
    supporting: EvidenceClaim[];
    rebutting: EvidenceClaim[];
  } => {
    if (!insight?.claimsStructure || !claim.sourceClaimId) {
      return { supporting: [], rebutting: [] };
    }

    const claimsStructure = insight.claimsStructure as ClaimsStructure;
    if (!isValidClaimsStructure(claimsStructure)) {
      return { supporting: [], rebutting: [] };
    }

    const supporting = getSupportingEvidence(claim.sourceClaimId, claimsStructure);
    const rebutting = getRebuttingEvidence(claim.sourceClaimId, claimsStructure);

    return { supporting, rebutting };
  };

  const evidenceClaims = getEvidenceClaims();

  const confidenceBadgeColor = (confidence: string | null) => {
    switch (confidence) {
      case 'high':
        return 'bg-emerald-100 text-emerald-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-amber-100 text-amber-700';
      case 'exploratory':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700';
      case 'draft':
        return 'bg-amber-100 text-amber-700';
      case 'complete':
        return 'bg-blue-100 text-blue-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getRelationshipBadge = (mappingType: string) => {
    switch (mappingType) {
      case 'supports':
        return { className: 'bg-emerald-100 text-emerald-700', label: 'Supports' };
      case 'refutes':
        return { className: 'bg-red-100 text-red-700', label: 'Refutes' };
      case 'foundation':
        return { className: 'bg-amber-100 text-amber-700', label: 'Foundation' };
      default:
        return { className: 'bg-slate-100 text-slate-700', label: mappingType };
    }
  };

  return (
    <DashboardShell
      title={claim.title}
      subtitle="Claim Detail"
      activeNav="claims"
    >
      <div className="space-y-6">
        {/* Compact Overview */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Overview</h3>
            {/* TODO: Add EditMainClaimButton if needed */}
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Category</dt>
              <dd className="mt-0.5 text-sm text-slate-900 capitalize">
                {claim.category.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Status</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeColor(claim.status)}`}>
                  {claim.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Confidence</dt>
              <dd className="mt-0.5">
                {claim.qualifier ? (
                  <Badge className={`${confidenceBadgeColor(claim.qualifier)} text-xs`}>
                    {claim.qualifier}
                  </Badge>
                ) : (
                  <span className="text-sm text-slate-500">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Time Horizon</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {claim.timeHorizon?.replace('_', ' ') ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Created</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {new Date(claim.createdAt).toLocaleDateString('en-GB')}
              </dd>
            </div>
            {claim.relevantTickers && claim.relevantTickers.length > 0 && (
              <div className="col-span-2 md:col-span-5">
                <dt className="text-xs font-medium text-slate-500 mb-1">Relevant Tickers</dt>
                <dd className="flex flex-wrap gap-1">
                  {claim.relevantTickers.map((ticker) => (
                    <span
                      key={ticker}
                      className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-slate-100 text-slate-700 rounded"
                    >
                      ${ticker}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Toulmin Framework */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-base font-semibold mb-3">Toulmin Framework</h3>

          <div className="space-y-4">
            {/* Claim */}
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                Claim
              </h4>
              <p className="text-sm text-slate-900 font-medium">{claim.claim}</p>
            </div>

            {/* Evidence */}
            {claim.evidence && claim.evidence.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Evidence ({claim.evidence.length})
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
                  {claim.evidence.map((point, idx) => {
                    if (typeof point !== 'string') {
                      console.warn('Non-string evidence point:', point);
                      return null;
                    }
                    return <li key={idx}>{point}</li>;
                  })}
                </ul>
              </div>
            )}

            {/* Reasoning */}
            {claim.reasoning && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Reasoning
                </h4>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{claim.reasoning}</p>
              </div>
            )}

            {/* Backing */}
            {claim.backing && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Backing
                </h4>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{claim.backing}</p>
              </div>
            )}

            {/* Rebuttal */}
            {claim.rebuttal && claim.rebuttal.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Rebuttal / Limitations ({claim.rebuttal.length})
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
                  {claim.rebuttal.map((point, idx) => {
                    if (typeof point !== 'string') {
                      console.warn('Non-string rebuttal point:', point);
                      return null;
                    }
                    return <li key={idx}>{point}</li>;
                  })}
                </ul>
              </div>
            )}

            {/* Linked Evidence Claims */}
            {(evidenceClaims.supporting.length > 0 || evidenceClaims.rebutting.length > 0) && (
              <div className="pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                  Linked Evidence Claims
                </h4>

                {evidenceClaims.supporting.length > 0 && (
                  <div className="mb-3">
                    <h5 className="text-xs font-medium text-emerald-700 mb-2">
                      Supporting ({evidenceClaims.supporting.length})
                    </h5>
                    <div className="space-y-2">
                      {evidenceClaims.supporting.map((evidence) => (
                        <ExpandableEvidenceClaim
                          key={evidence.id}
                          evidenceClaim={evidence}
                          relationshipType="supports"
                          showRelationship={false}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {evidenceClaims.rebutting.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-red-700 mb-2">
                      Rebutting ({evidenceClaims.rebutting.length})
                    </h5>
                    <div className="space-y-2">
                      {evidenceClaims.rebutting.map((evidence) => (
                        <ExpandableEvidenceClaim
                          key={evidence.id}
                          evidenceClaim={evidence}
                          relationshipType="refutes"
                          showRelationship={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Source Information */}
        {artifact && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Source</h3>
            <div className="space-y-2">
              <Link
                href={`/research/${artifact.id}`}
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 text-sm font-medium"
              >
                <span>{artifact.title}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </Link>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Source Type</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 capitalize">{artifact.sourceType}</dd>
                </div>
                {artifact.author && (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Author</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{artifact.author}</dd>
                  </div>
                )}
                {artifact.publishedDate && (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Published</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">
                      {new Date(artifact.publishedDate).toLocaleDateString('en-GB')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-slate-500">Ingested</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">
                    {new Date(artifact.ingestedAt).toLocaleDateString('en-GB')}
                  </dd>
                </div>
              </dl>
              {artifact.sourceUrl && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">URL</dt>
                  <dd className="mt-0.5 text-xs">
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
            </div>
          </div>
        )}

        {/* Linked Macro Theses */}
        {linkedTheses.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">
              Linked Macro Theses ({linkedTheses.length})
            </h3>
            <div className="space-y-2">
              {linkedTheses.map((thesis) => {
                const relationshipBadge = getRelationshipBadge(thesis.mappingType);
                return (
                  <Link
                    key={thesis.id}
                    href={`/macro-theses/${thesis.id}`}
                    className="block p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-100 text-purple-700 text-xs">Macro</Badge>
                      <Badge className={`${relationshipBadge.className} text-xs`}>
                        {relationshipBadge.label}
                      </Badge>
                      <span className="text-sm font-medium text-blue-600 hover:text-blue-800">
                        {thesis.title}
                      </span>
                      <ExternalLink className="h-3 w-3 ml-auto text-slate-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Linked Asset Theses */}
        {linkedViews.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">
              Linked Asset Theses ({linkedViews.length})
            </h3>
            <div className="space-y-2">
              {linkedViews.map((view) => {
                const relationshipBadge = getRelationshipBadge(view.mappingType);
                return (
                  <Link
                    key={view.id}
                    href={`/asset-theses/${view.id}`}
                    className="block p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700 text-xs">Asset</Badge>
                      <Badge className={`${relationshipBadge.className} text-xs`}>
                        {relationshipBadge.label}
                      </Badge>
                      <span className="text-sm font-medium text-blue-600 hover:text-blue-800">
                        {view.title}
                      </span>
                      <span className="text-sm text-slate-500">({view.ticker})</span>
                      <ExternalLink className="h-3 w-3 ml-auto text-slate-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* No Links State */}
        {linkedTheses.length === 0 && linkedViews.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Linked Entities</h3>
            <p className="text-sm text-slate-500 mb-4">
              This claim has not been linked to any macro theses or asset theses yet.
            </p>
            {/* TODO: Add convert/link button if needed */}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <Link href="/claims">
            <Button variant="outline">← Back to Claims</Button>
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
