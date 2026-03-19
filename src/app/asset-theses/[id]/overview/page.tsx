import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { getCachedAssetThesisById } from '@/db/queries/cached';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getLatestArticulation, getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { EntityDetailLayout, CollapsibleEntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { AssetThesisSidebar } from '@/components/asset-theses/AssetThesisSidebar';
import { LinkedMacroThesesSection } from '@/components/asset-theses/LinkedMacroThesesSection';
import { LinkedStrategiesSection } from '@/components/asset-theses/LinkedStrategiesSection';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { SignalsSection } from '@/components/signals/SignalsSection';
import { ThesisArticulationDisplay } from '@/components/thesis-synthesis/ThesisArticulationDisplay';
import { SynthesizeButton } from '@/components/thesis/SynthesizeButton';
import { EntityStatusBadge } from '@/components/ui/badge';

interface OverviewPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: OverviewPageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getCachedAssetThesisById(id);
  return {
    title: thesis?.title ?? 'Asset Thesis',
  };
}

export default async function AssetThesisOverviewPage({ params }: OverviewPageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allMacroTheses, allStrategies, articulation, validationPoints] = await Promise.all([
    getCachedAssetThesisById(id),
    getMainClaimsWithSourcesForAssetThesis(id),
    getMacroThesesList(),
    getStrategiesForList(1000, { assetThesisId: id, includeClosedStrategies: true }),
    getLatestArticulation(id, 'asset'),
    getActiveValidationPoints(id, 'asset'),
  ]);

  if (!thesis) {
    notFound();
  }

  // Calculate related entity counts
  const linkedMacroThesesIds = thesis.linkedMacroTheses.map((lmt) => lmt.macroThesisId);
  const linkedMacroTheses = allMacroTheses.filter((mt) => linkedMacroThesesIds.includes(mt.id));
  // allStrategies is already filtered by assetThesisId via the query
  const linkedStrategies = allStrategies;

  const currentClaimCount = claimsWithSources?.length ?? 0;
  const articulationClaimCount = thesis.claimsCountAtLastArticulation ?? 0;

  const tabs = createEntityTabs('/asset-theses', id);

  const statusBadge = <EntityStatusBadge status={thesis.status} />;

  // Direction badge for subtitle
  const directionBadge = thesis.direction ? (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
      thesis.direction === 'bullish' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
      thesis.direction === 'bearish' ? 'bg-destructive/15 text-destructive' :
      'bg-muted text-muted-foreground'
    }`}>
      {thesis.direction}
    </span>
  ) : null;

  // Determine content state
  const hasCoreArgument = !!articulation;
  const hasLegacySummary = !!thesis.aiSummary;
  const hasDescription = !!thesis.description;

  // Legacy summary staleness calculations
  const newClaimsSinceSummary = currentClaimCount - (thesis.aiSummaryClaimCount ?? 0);
  const summaryDaysOld = thesis.aiSummaryGeneratedAt
    ? Math.floor((Date.now() - new Date(thesis.aiSummaryGeneratedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <EntityDetailLayout
      title={thesis.title}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Asset Thesis {thesis.underlying?.ticker && <span className="font-mono text-muted-foreground">({thesis.underlying.ticker})</span>}
          {directionBadge}
        </span>
      }
      statusBadge={statusBadge}
      tabs={<EntityTabs tabs={tabs} />}
      activeNav="asset-theses"
      sidebar={
        <AssetThesisSidebar
          thesis={thesis}
          linkedMacroThesesCount={linkedMacroTheses.length}
          linkedStrategiesCount={linkedStrategies.length}
          claimsCount={claimsWithSources.length}
          signalsCount={validationPoints.length}
          linkedMacroTheses={linkedMacroTheses.map((mt) => ({ id: mt.id, title: mt.title }))}
          linkedStrategies={linkedStrategies.map((s) => ({ id: s.id, label: s.label, strategyKey: s.strategyKey }))}
        />
      }
    >
      {/* Core Argument Section */}
      <CollapsibleEntitySection
        title="Core Argument"
        defaultOpen={true}
        actions={
          <SynthesizeButton
            thesisId={id}
            thesisType="asset"
            thesisTitle={thesis.title}
            claimCount={currentClaimCount}
            hasArticulation={hasCoreArgument}
            articulationClaimCount={articulationClaimCount}
          />
        }
      >
        {hasCoreArgument && articulation && (
          <ThesisArticulationDisplay
            articulation={articulation}
            claimCount={currentClaimCount}
            claimsAtLastArticulation={articulationClaimCount}
          />
        )}

        {!hasCoreArgument && hasLegacySummary && (
          <div className="space-y-4">
            <div className="mb-2 text-xs text-amber-600">(legacy summary)</div>
            <div className="text-sm whitespace-pre-wrap text-foreground">
              {thesis.aiSummary}
            </div>

            {newClaimsSinceSummary >= 3 && (
              <div className="px-2 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300">
                {newClaimsSinceSummary} new claims added since generation
              </div>
            )}
            {newClaimsSinceSummary < 3 && summaryDaysOld >= 30 && (
              <div className="px-2 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300">
                Summary is {summaryDaysOld} days old
              </div>
            )}

            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                This is a legacy summary. Run{' '}
                <code className="px-1 bg-blue-100 dark:bg-blue-900/50 rounded font-mono">/build-core-argument</code>
                {' '}to create a full articulation with key drivers, assumptions, and validation points.
              </p>
            </div>

            {hasDescription && (
              <div className="pt-3 border-t border-border">
                <span className="text-xs font-medium text-muted-foreground block mb-2">
                  MANUAL DESCRIPTION
                </span>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {thesis.description}
                </p>
              </div>
            )}
          </div>
        )}

        {!hasCoreArgument && !hasLegacySummary && hasDescription && (
          <div className="space-y-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{thesis.description}</p>
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Run{' '}
                <code className="px-1 bg-blue-100 dark:bg-blue-900/50 rounded font-mono">/build-core-argument</code>
                {' '}to create an articulation with key drivers, assumptions, and validation points.
              </p>
            </div>
          </div>
        )}

        {!hasCoreArgument && !hasLegacySummary && !hasDescription && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">
              No articulation exists yet for this thesis.
            </p>
            <p className="text-xs text-muted-foreground">
              Use{' '}
              <code className="px-1.5 py-0.5 bg-muted rounded font-mono">
                /build-core-argument
              </code>{' '}
              to generate a Core Argument with key drivers, assumptions, and validation points.
            </p>
          </div>
        )}
      </CollapsibleEntitySection>

      {/* Claims Section */}
      <CollapsibleEntitySection
        title="Claims"
        count={claimsWithSources.length}
        defaultOpen={claimsWithSources.length > 0 && claimsWithSources.length <= 5}
      >
        {claimsWithSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No main claims linked to this thesis yet.</p>
        ) : (
          <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
        )}
      </CollapsibleEntitySection>

      {/* Signals Section */}
      <CollapsibleEntitySection
        title="Signals"
        count={validationPoints.length}
        defaultOpen={validationPoints.length > 0}
      >
        <SignalsSection
          signals={validationPoints}
          thesisId={id}
          thesisType="asset"
          thesisTitle={thesis.title}
        />
      </CollapsibleEntitySection>

      {/* Linked Macro Theses Section */}
      <CollapsibleEntitySection
        title="Macro Theses"
        count={linkedMacroTheses.length}
        defaultOpen={linkedMacroTheses.length > 0}
      >
        <LinkedMacroThesesSection
          assetThesisId={thesis.id}
          assetThesisTitle={thesis.title}
          linkedMacroTheses={linkedMacroTheses}
          embedded={true}
        />
      </CollapsibleEntitySection>

      {/* Linked Strategies Section */}
      <CollapsibleEntitySection
        title="Linked Strategies"
        count={linkedStrategies.length}
        defaultOpen={linkedStrategies.length > 0}
      >
        <LinkedStrategiesSection
          assetThesisId={thesis.id}
          assetThesisTitle={thesis.title}
          linkedStrategies={linkedStrategies}
          embedded={true}
        />
      </CollapsibleEntitySection>
    </EntityDetailLayout>
  );
}
