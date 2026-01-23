import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMacroThesisById, getMainClaimsWithSourcesForThesis } from '@/db/queries/macroTheses';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getAssetThesesForRelatedMacroThesis } from '@/db/queries/relatedMacroTheses';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { EntityDetailLayout, CollapsibleEntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { MacroThesisSidebar } from '@/components/theses/MacroThesisSidebar';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { SignalsSection } from '@/components/signals/SignalsSection';
import { EntityStatusBadge } from '@/components/ui/badge';

interface EvidencePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EvidencePageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getMacroThesisById(id);
  return {
    title: thesis ? `${thesis.title} - Evidence` : 'Evidence',
  };
}

export default async function MacroThesisEvidencePage({ params }: EvidencePageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allAssetTheses, allStrategies, relatedAssetThesisLinks, validationPoints] = await Promise.all([
    getMacroThesisById(id),
    getMainClaimsWithSourcesForThesis(id),
    getAssetThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
    getAssetThesesForRelatedMacroThesis(id),
    getActiveValidationPoints(id, 'macro'),
  ]);

  if (!thesis) {
    notFound();
  }

  // Calculate related entity counts
  const relatedAssetThesisIds = new Set(relatedAssetThesisLinks.map((link) => link.assetThesisId));
  const linkedAssetTheses = allAssetTheses.filter((at) => relatedAssetThesisIds.has(at.id));
  const linkedStrategies = allStrategies.filter((s) =>
    s.linkedMacroTheses.some((lmt) => lmt.id === id)
  );

  const tabs = createEntityTabs('/macro-theses', id);

  const statusBadge = <EntityStatusBadge status={thesis.status} />;

  return (
    <EntityDetailLayout
      title={thesis.title}
      subtitle="Macro Thesis"
      statusBadge={statusBadge}
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
      {/* Signals Section */}
      <CollapsibleEntitySection
        title="Signals"
        count={validationPoints.length}
        defaultOpen={validationPoints.length > 0}
      >
        <SignalsSection
          signals={validationPoints}
          thesisId={id}
          thesisType="macro"
          thesisTitle={thesis.title}
        />
      </CollapsibleEntitySection>

      {/* Main Claims Section */}
      <CollapsibleEntitySection
        title="Main Claims"
        count={claimsWithSources.length}
        defaultOpen={claimsWithSources.length > 0 && claimsWithSources.length <= 5}
      >
        {claimsWithSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No main claims linked to this thesis yet.</p>
        ) : (
          <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
        )}
      </CollapsibleEntitySection>
    </EntityDetailLayout>
  );
}
