import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMacroThesisById, getMainClaimsWithSourcesForThesis } from '@/db/queries/macroTheses';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getAssetThesesForRelatedMacroThesis } from '@/db/queries/relatedMacroTheses';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { getUnifiedTriageQueue } from '@/db/queries/triage';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { MacroThesisSidebar } from '@/components/theses/MacroThesisSidebar';
import { LinkedAssetThesesSection } from '@/components/theses/LinkedAssetThesesSection';
import { UnifiedStrategiesBrowser } from '@/components/strategies/UnifiedStrategiesBrowser';
import { UnifiedTriageBrowser } from '@/components/triage/UnifiedTriageBrowser';
import { EntityStatusBadge } from '@/components/ui/badge';

interface ExecutionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ExecutionPageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getMacroThesisById(id);
  return {
    title: thesis ? `${thesis.title} - Execution` : 'Execution',
  };
}

export default async function MacroThesisExecutionPage({ params }: ExecutionPageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allAssetTheses, allStrategies, relatedAssetThesisLinks, validationPoints, triageResult] = await Promise.all([
    getMacroThesisById(id),
    getMainClaimsWithSourcesForThesis(id),
    getAssetThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
    getAssetThesesForRelatedMacroThesis(id),
    getActiveValidationPoints(id, 'macro'),
    // Fetch thesis-specific triage records (accountId not needed when filtering by thesisId)
    getUnifiedTriageQueue('', { thesisId: id, includeAll: true }),
  ]);

  if (!thesis) {
    notFound();
  }

  // Calculate related entities
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
      {/* Triage Queue Section */}
      <EntitySection title="Triage Queue">
        <UnifiedTriageBrowser
          records={triageResult.records}
          counts={triageResult.counts}
          thesisId={thesis.id}
        />
      </EntitySection>

      {/* Linked Asset Theses - with Link Button */}
      <LinkedAssetThesesSection
        macroThesisId={thesis.id}
        macroThesisTitle={thesis.title}
        linkedAssetTheses={linkedAssetTheses}
      />

      {/* Linked Strategies */}
      <EntitySection title={`Linked Strategies (${linkedStrategies.length})`}>
        {linkedStrategies.length === 0 ? (
          <p className="text-sm text-slate-500">No strategies linked to this macro thesis yet.</p>
        ) : (
          <UnifiedStrategiesBrowser strategies={linkedStrategies} />
        )}
      </EntitySection>
    </EntityDetailLayout>
  );
}
