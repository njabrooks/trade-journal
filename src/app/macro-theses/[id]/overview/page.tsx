import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMainClaimsWithSourcesForThesis } from '@/db/queries/macroTheses';
import { getCachedMacroThesisById } from '@/db/queries/cached';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getAssetThesesForRelatedMacroThesis } from '@/db/queries/relatedMacroTheses';
import { getLatestArticulation, getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { EntityDetailLayout, CollapsibleEntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { MacroThesisSidebar } from '@/components/theses/MacroThesisSidebar';
import { LinkedAssetThesesSection } from '@/components/theses/LinkedAssetThesesSection';
import { UnifiedStrategiesBrowser } from '@/components/strategies/UnifiedStrategiesBrowser';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { SignalsSection } from '@/components/signals/SignalsSection';
import { ThesisArticulationDisplay } from '@/components/thesis-synthesis/ThesisArticulationDisplay';
import { SynthesizeButton } from '@/components/thesis/SynthesizeButton';
import { LifecycleBadge } from '@/components/ui/lifecycle-badge';
import { getRelationshipsForEntity } from '@/db/queries/entityRelationships';
import { getIntelItemsForThesis } from '@/db/queries/intelItems';
import { RelationshipPanel } from '@/components/ui/relationship-panel';
import { IntelPanel } from '@/components/intelligence/IntelPanel';

interface OverviewPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: OverviewPageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getCachedMacroThesisById(id);
  return {
    title: thesis?.title ?? 'Macro Thesis',
  };
}

export default async function MacroThesisOverviewPage({ params }: OverviewPageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allAssetTheses, allStrategies, relatedAssetThesisLinks, articulation, validationPoints, relationships, intelItemsData] = await Promise.all([
    getCachedMacroThesisById(id),
    getMainClaimsWithSourcesForThesis(id),
    getAssetThesesList(),
    getStrategiesForList(1000, { macroThesisId: id, includeClosedStrategies: true }),
    getAssetThesesForRelatedMacroThesis(id),
    getLatestArticulation(id, 'macro'),
    getActiveValidationPoints(id, 'macro'),
    getRelationshipsForEntity('macro_thesis', id),
    getIntelItemsForThesis(id, 'macro', { limit: 20 }),
  ]);

  if (!thesis) {
    notFound();
  }

  // Calculate related entity counts
  const relatedAssetThesisIds = new Set(relatedAssetThesisLinks.map((link) => link.assetThesisId));
  const linkedAssetTheses = allAssetTheses.filter((at) => relatedAssetThesisIds.has(at.id));
  // allStrategies is already filtered by macroThesisId via the query
  const linkedStrategies = allStrategies;

  const tabs = createEntityTabs('/macro-theses', id);

  const isMonitoring = thesis.status === 'monitoring';
  const isDeveloping = thesis.status === 'developing';

  return (
    <EntityDetailLayout
      title={thesis.title}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Macro Thesis
          <LifecycleBadge phase={thesis.status} size="sm" />
        </span>
      }
      tabs={<EntityTabs tabs={tabs} />}
      activeNav="macro-theses"
      sidebar={
        <MacroThesisSidebar
          thesis={thesis}
          linkedAssetThesesCount={linkedAssetTheses.length}
          linkedStrategiesCount={linkedStrategies.length}
          claimsCount={claimsWithSources.length}
          signalsCount={validationPoints.length}
          linkedAssetTheses={linkedAssetTheses.map((at) => ({ id: at.id, title: at.title, ticker: at.ticker }))}
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
            thesisType="macro"
            thesisTitle={thesis.title}
            claimCount={claimsWithSources.length}
            hasArticulation={!!articulation}
            articulationClaimCount={thesis.claimsCountAtLastArticulation ?? undefined}
          />
        }
      >
        {!articulation && thesis.description && (
          <div className="mb-2 text-xs text-amber-600">(legacy description)</div>
        )}

        {articulation ? (
          <ThesisArticulationDisplay
            articulation={articulation}
            claimCount={claimsWithSources.length}
            claimsAtLastArticulation={thesis.claimsCountAtLastArticulation ?? undefined}
          />
        ) : thesis.description ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{thesis.description}</p>
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Run{' '}
                <code className="px-1 bg-blue-100 rounded font-mono">/build-core-argument</code>
                {' '}to create a full articulation with key drivers, assumptions, and validation points.
              </p>
            </div>
          </div>
        ) : (
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

      {/* --- LIFECYCLE-DRIVEN SECTION ORDER --- */}

      {isMonitoring ? (
        <>
          {/* Monitoring: Signals first (primary), then Evidence (reference) */}
          <CollapsibleEntitySection
            title="Signals"
            count={validationPoints.length}
            defaultOpen={true}
          >
            <SignalsSection
              signals={validationPoints}
              thesisId={id}
              thesisType="macro"
              thesisTitle={thesis.title}
            />
          </CollapsibleEntitySection>

          <CollapsibleEntitySection
            title="Evidence"
            count={claimsWithSources.length}
            defaultOpen={false}
          >
            <p className="text-xs text-muted-foreground mb-3">
              Claims linked during development. New intelligence is evaluated against signals above.
            </p>
            {claimsWithSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No claims linked to this thesis.</p>
            ) : (
              <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
            )}
          </CollapsibleEntitySection>
        </>
      ) : (
        <>
          {/* Developing (or draft): Evidence first (primary), then Signals */}
          <CollapsibleEntitySection
            title="Evidence"
            count={claimsWithSources.length}
            defaultOpen={claimsWithSources.length > 0 && claimsWithSources.length <= 5}
          >
            {claimsWithSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No claims linked to this thesis yet. Process research with <code className="px-1 py-0.5 bg-muted rounded font-mono text-xs">/process-inbox</code> to extract claims.</p>
            ) : (
              <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
            )}
          </CollapsibleEntitySection>

          <CollapsibleEntitySection
            title="Signals"
            count={validationPoints.length}
            defaultOpen={validationPoints.length > 0}
          >
            {validationPoints.length === 0 && isDeveloping ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-1">
                  No signals yet.
                </p>
                <p className="text-xs text-muted-foreground">
                  Link claims as evidence, then run{' '}
                  <code className="px-1 py-0.5 bg-muted rounded font-mono">/build-core-argument</code>
                  {' '}to generate monitoring signals and transition to monitoring phase.
                </p>
              </div>
            ) : (
              <SignalsSection
                signals={validationPoints}
                thesisId={id}
                thesisType="macro"
                thesisTitle={thesis.title}
              />
            )}
          </CollapsibleEntitySection>
        </>
      )}

      {/* Asset Theses Section — same in both phases */}
      <CollapsibleEntitySection
        title="Asset Theses"
        count={linkedAssetTheses.length}
        defaultOpen={linkedAssetTheses.length > 0}
      >
        <LinkedAssetThesesSection
          macroThesisId={thesis.id}
          macroThesisTitle={thesis.title}
          linkedAssetTheses={linkedAssetTheses}
          embedded={true}
        />
      </CollapsibleEntitySection>

      {/* Linked Strategies Section — same in both phases */}
      <CollapsibleEntitySection
        title="Linked Strategies"
        count={linkedStrategies.length}
        defaultOpen={linkedStrategies.length > 0}
      >
        {linkedStrategies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No strategies linked to this macro thesis yet.</p>
        ) : (
          <UnifiedStrategiesBrowser strategies={linkedStrategies} />
        )}
      </CollapsibleEntitySection>

      {/* Relationships Section */}
      <CollapsibleEntitySection
        title="Relationships"
        count={relationships.length}
        defaultOpen={false}
      >
        <RelationshipPanel relationships={relationships} />
      </CollapsibleEntitySection>

      {/* Intel Section */}
      <CollapsibleEntitySection
        title="Intel"
        count={intelItemsData.length}
        defaultOpen={intelItemsData.length > 0 && intelItemsData.length <= 10}
      >
        <IntelPanel items={intelItemsData} />
      </CollapsibleEntitySection>
    </EntityDetailLayout>
  );
}
