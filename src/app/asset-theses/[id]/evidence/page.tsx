import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAssetThesisById, getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { EntityDetailLayout, CollapsibleEntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { AssetThesisSidebar } from '@/components/asset-theses/AssetThesisSidebar';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { SignalsSection } from '@/components/signals/SignalsSection';
import { NewsArchiveSection } from '@/components/asset-theses/NewsArchiveSection';
import { EntityStatusBadge } from '@/components/ui/badge';

interface EvidencePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EvidencePageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getAssetThesisById(id);
  return {
    title: thesis ? `${thesis.title} - Evidence` : 'Evidence',
  };
}

export default async function AssetThesisEvidencePage({ params }: EvidencePageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allMacroTheses, allStrategies, validationPoints] = await Promise.all([
    getAssetThesisById(id),
    getMainClaimsWithSourcesForAssetThesis(id),
    getMacroThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
    getActiveValidationPoints(id, 'asset'),
  ]);

  if (!thesis) {
    notFound();
  }

  // Calculate related entity counts
  const linkedMacroThesesIds = thesis.linkedMacroTheses.map((lmt) => lmt.macroThesisId);
  const linkedMacroTheses = allMacroTheses.filter((mt) => linkedMacroThesesIds.includes(mt.id));
  const linkedStrategies = allStrategies.filter((s) => s.assetThesisId === id);

  const tabs = createEntityTabs('/asset-theses', id);

  const statusBadge = <EntityStatusBadge status={thesis.status} />;

  // Direction badge for subtitle
  const directionBadge = thesis.direction ? (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
      thesis.direction === 'bullish' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' :
      thesis.direction === 'bearish' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' :
      'bg-muted text-muted-foreground'
    }`}>
      {thesis.direction}
    </span>
  ) : null;

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

      {/* News Archive Section */}
      <CollapsibleEntitySection
        title="News Archive"
        defaultOpen={false}
      >
        <NewsArchiveSection thesisId={id} thesisType="asset" />
      </CollapsibleEntitySection>
    </EntityDetailLayout>
  );
}
