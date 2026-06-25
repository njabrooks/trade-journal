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
import { ClaimLinkButton } from '@/components/research/ClaimLinkButton';
import { SIGNAL_TYPE_COLORS, ASSESSMENT_LEVELS } from '@/components/signals/signal-constants';

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

  const { claim, insight, artifact, linkedTheses, linkedViews, linkedSignals = [] } = claimData;

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
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'medium':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'low':
        return 'bg-muted text-muted-foreground';
      case 'exploratory':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'draft':
        return 'bg-muted text-muted-foreground';
      case 'complete':
        return 'bg-muted text-muted-foreground';
      case 'rejected':
        return 'bg-destructive/15 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getRelationshipBadge = (mappingType: string) => {
    switch (mappingType) {
      case 'supports':
        return { className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', label: 'Supports' };
      case 'refutes':
        return { className: 'bg-destructive/15 text-destructive', label: 'Refutes' };
      case 'foundation':
        return { className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', label: 'Foundation' };
      default:
        return { className: 'bg-muted text-muted-foreground', label: mappingType };
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
        <div className="bg-card rounded-lg border border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Overview</h3>
            <ClaimLinkButton claim={claim} />
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Category</dt>
              <dd className="mt-0.5 text-sm text-foreground capitalize">
                {claim.category.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Status</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeColor(claim.status)}`}>
                  {claim.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Confidence</dt>
              <dd className="mt-0.5">
                {claim.qualifier ? (
                  <Badge className={`${confidenceBadgeColor(claim.qualifier)} text-xs`}>
                    {claim.qualifier}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Time Horizon</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {claim.timeHorizon?.replace('_', ' ') ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Created</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {new Date(claim.createdAt).toLocaleDateString('en-GB')}
              </dd>
            </div>
            {claim.relevantTickers && claim.relevantTickers.length > 0 && (
              <div className="col-span-2 md:col-span-5">
                <dt className="text-xs font-medium text-muted-foreground mb-1">Relevant Tickers</dt>
                <dd className="flex flex-wrap gap-1">
                  {claim.relevantTickers.map((ticker) => (
                    <span
                      key={ticker}
                      className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-muted text-foreground rounded"
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
        <div className="bg-card rounded-lg border border p-4">
          <h3 className="text-base font-semibold mb-3">Toulmin Framework</h3>

          <div className="space-y-4">
            {/* Claim */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                Claim
              </h4>
              <p className="text-sm text-foreground font-medium">{claim.claim}</p>
            </div>

            {/* Evidence */}
            {claim.evidence && claim.evidence.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                  Evidence ({claim.evidence.length})
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
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
                <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                  Reasoning
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{claim.reasoning}</p>
              </div>
            )}

            {/* Backing */}
            {claim.backing && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                  Backing
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{claim.backing}</p>
              </div>
            )}

            {/* Rebuttal */}
            {claim.rebuttal && claim.rebuttal.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                  Rebuttal / Limitations ({claim.rebuttal.length})
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
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
              <div className="pt-2 border-t">
                <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
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
          <div className="bg-card rounded-lg border border p-4">
            <h3 className="text-base font-semibold mb-3">Source</h3>
            <div className="space-y-2">
              <Link
                href={`/research/${artifact.id}`}
                className="text-foreground hover:text-blue-600 hover:underline transition-colors inline-flex items-center gap-1 text-sm font-medium"
              >
                <span>{artifact.title}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </Link>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Source Type</dt>
                  <dd className="mt-0.5 text-sm text-foreground capitalize">{artifact.sourceType}</dd>
                </div>
                {artifact.author && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Author</dt>
                    <dd className="mt-0.5 text-sm text-foreground">{artifact.author}</dd>
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
              </dl>
              {artifact.sourceUrl && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">URL</dt>
                  <dd className="mt-0.5 text-xs">
                    <a
                      href={artifact.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-blue-600 hover:underline transition-colors break-all"
                    >
                      {artifact.sourceUrl}
                    </a>
                  </dd>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Signal Evidence */}
        {linkedSignals.length > 0 && (
          <div className="bg-card rounded-lg border border p-4">
            <h3 className="text-base font-semibold mb-3">
              Signal Evidence ({linkedSignals.length})
            </h3>
            <div className="space-y-2">
              {linkedSignals.map((signal) => {
                const typeConfig = SIGNAL_TYPE_COLORS[signal.type] ?? SIGNAL_TYPE_COLORS.confirmation;
                const assessmentConfig = ASSESSMENT_LEVELS[signal.assessment] ?? ASSESSMENT_LEVELS.neutral;
                return (
                  <Link
                    key={signal.id}
                    href={`/signals/${signal.id}`}
                    className="block p-3 bg-muted hover:bg-muted rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={`${typeConfig.cls} text-xs`}>{typeConfig.label}</Badge>
                      <Badge className={`${assessmentConfig.cls} text-xs`}>{assessmentConfig.label}</Badge>
                      <span className="text-sm font-medium text-foreground hover:text-blue-600 transition-colors line-clamp-1">
                        {signal.statement}
                      </span>
                      <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Linked Macro Theses */}
        {linkedTheses.length > 0 && (
          <div className="bg-card rounded-lg border border p-4">
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
                    className="block p-3 bg-muted hover:bg-muted rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 text-xs">Macro</Badge>
                      <Badge className={`${relationshipBadge.className} text-xs`}>
                        {relationshipBadge.label}
                      </Badge>
                      <span className="text-sm font-medium text-foreground hover:text-blue-600 transition-colors">
                        {thesis.title}
                      </span>
                      <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Linked Asset Theses */}
        {linkedViews.length > 0 && (
          <div className="bg-card rounded-lg border border p-4">
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
                    className="block p-3 bg-muted hover:bg-muted rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs">Asset</Badge>
                      <Badge className={`${relationshipBadge.className} text-xs`}>
                        {relationshipBadge.label}
                      </Badge>
                      <span className="text-sm font-medium text-foreground hover:text-blue-600 transition-colors">
                        {view.title}
                      </span>
                      <span className="text-sm text-muted-foreground">({view.ticker})</span>
                      <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* No Links State */}
        {linkedTheses.length === 0 && linkedViews.length === 0 && (
          <div className="bg-card rounded-lg border border p-4">
            <h3 className="text-base font-semibold mb-3">Linked Entities</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This claim has not been linked to any macro theses or asset theses yet.
            </p>
            <ClaimLinkButton claim={claim} />
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
