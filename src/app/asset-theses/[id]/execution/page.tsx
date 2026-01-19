import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAssetThesisById, getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { getUnifiedTriageQueue } from '@/db/queries/triage';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { AssetThesisSidebar } from '@/components/asset-theses/AssetThesisSidebar';
import { LinkedMacroThesesSection } from '@/components/asset-theses/LinkedMacroThesesSection';
import { LinkedStrategiesSection } from '@/components/asset-theses/LinkedStrategiesSection';
import { UnifiedTriageBrowser } from '@/components/triage/UnifiedTriageBrowser';
import { EntityStatusBadge } from '@/components/ui/badge';

interface ExecutionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ExecutionPageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getAssetThesisById(id);
  return {
    title: thesis ? `${thesis.title} - Execution` : 'Execution',
  };
}

export default async function AssetThesisExecutionPage({ params }: ExecutionPageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allMacroTheses, allStrategies, validationPoints, triageResult] = await Promise.all([
    getAssetThesisById(id),
    getMainClaimsWithSourcesForAssetThesis(id),
    getMacroThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
    getActiveValidationPoints(id, 'asset'),
    // Fetch thesis-specific triage records (accountId not needed when filtering by thesisId)
    getUnifiedTriageQueue('', { thesisId: id, includeAll: true }),
  ]);

  if (!thesis) {
    notFound();
  }

  // Calculate related entities
  const linkedMacroThesesIds = thesis.linkedMacroTheses.map((lmt) => lmt.macroThesisId);
  const linkedMacroTheses = allMacroTheses.filter((mt) => linkedMacroThesesIds.includes(mt.id));
  const linkedStrategies = allStrategies.filter((s) => s.assetThesisId === id);

  const tabs = createEntityTabs('/asset-theses', id);

  const statusBadge = <EntityStatusBadge status={thesis.status} />;

  // Direction badge for subtitle
  const directionBadge = thesis.direction ? (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
      thesis.direction === 'bullish' ? 'bg-emerald-100 text-emerald-700' :
      thesis.direction === 'bearish' ? 'bg-red-100 text-red-700' :
      'bg-slate-200 text-slate-700'
    }`}>
      {thesis.direction}
    </span>
  ) : null;

  return (
    <EntityDetailLayout
      title={thesis.title}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Asset Thesis {thesis.underlying?.ticker && <span className="font-mono text-slate-600">({thesis.underlying.ticker})</span>}
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
      {/* Triage Queue Section */}
      <EntitySection title="Triage Queue">
        <UnifiedTriageBrowser
          records={triageResult.records}
          counts={triageResult.counts}
          thesisId={thesis.id}
        />
      </EntitySection>

      {/* Linked Macro Theses */}
      <EntitySection title={`Linked Macro Theses (${linkedMacroTheses.length})`}>
        <LinkedMacroThesesSection
          assetThesisId={thesis.id}
          assetThesisTitle={thesis.title}
          linkedMacroTheses={linkedMacroTheses}
          embedded={true}
        />
      </EntitySection>

      {/* Linked Strategies */}
      <EntitySection title={`Linked Strategies (${linkedStrategies.length})`}>
        <LinkedStrategiesSection
          assetThesisId={thesis.id}
          assetThesisTitle={thesis.title}
          linkedStrategies={linkedStrategies}
          embedded={true}
        />
      </EntitySection>
    </EntityDetailLayout>
  );
}
