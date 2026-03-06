import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMainClaimsWithSourcesForThesis } from '@/db/queries/macroTheses';
import { getCachedMacroThesisById } from '@/db/queries/cached';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getAssetThesesForRelatedMacroThesis } from '@/db/queries/relatedMacroTheses';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { getUnifiedTriageQueue } from '@/db/queries/triage';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { MacroThesisSidebar } from '@/components/theses/MacroThesisSidebar';
import { UnifiedTriageBrowser } from '@/components/triage/UnifiedTriageBrowser';
import { EntityStatusBadge } from '@/components/ui/badge';
import type { UnifiedTriageRecord, UnifiedTriageFilterCounts, TriageObjectType } from '@/types/triage';

interface TriagePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TriagePageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getCachedMacroThesisById(id);
  return {
    title: thesis ? `${thesis.title} - Triage` : 'Triage',
  };
}

function computeCounts(records: UnifiedTriageRecord[]): UnifiedTriageFilterCounts {
  const objectType: Record<string, number> = {};
  const status: Record<string, number> = {};
  const trigger: Record<string, number> = {};

  for (const r of records) {
    objectType[r.objectType] = (objectType[r.objectType] || 0) + 1;
    status[r.status] = (status[r.status] || 0) + 1;
    trigger[r.trigger] = (trigger[r.trigger] || 0) + 1;
  }

  return {
    objectType: objectType as Record<TriageObjectType, number>,
    status,
    trigger,
  };
}

export default async function MacroThesisTriagePage({ params }: TriagePageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allAssetTheses, allStrategies, relatedAssetThesisLinks, validationPoints, thesisTriageResult] = await Promise.all([
    getCachedMacroThesisById(id),
    getMainClaimsWithSourcesForThesis(id),
    getAssetThesesList(),
    getStrategiesForList(1000, { macroThesisId: id, includeClosedStrategies: true }),
    getAssetThesesForRelatedMacroThesis(id),
    getActiveValidationPoints(id, 'macro'),
    getUnifiedTriageQueue({ thesisId: id, includeAll: true }),
  ]);

  if (!thesis) {
    notFound();
  }

  const relatedAssetThesisIds = new Set(relatedAssetThesisLinks.map((link) => link.assetThesisId));
  const linkedAssetTheses = allAssetTheses.filter((at) => relatedAssetThesisIds.has(at.id));
  // allStrategies is already filtered by macroThesisId via the query
  const linkedStrategies = allStrategies;

  // Fetch strategy/position triage for all linked strategies
  const strategyTriageResults = await Promise.all(
    linkedStrategies.map((s) => getUnifiedTriageQueue({ strategyId: s.id, includeAll: true }))
  );

  // Also fetch asset thesis triage for linked asset theses
  const assetThesisTriageResults = await Promise.all(
    linkedAssetTheses.map((at) => getUnifiedTriageQueue({ thesisId: at.id, includeAll: true }))
  );

  // Merge all triage records, deduplicate by id
  const seenIds = new Set<string>();
  const allRecords: UnifiedTriageRecord[] = [];

  for (const record of thesisTriageResult.records) {
    if (!seenIds.has(record.id)) {
      seenIds.add(record.id);
      allRecords.push(record);
    }
  }
  for (const result of [...strategyTriageResults, ...assetThesisTriageResults]) {
    for (const record of result.records) {
      if (!seenIds.has(record.id)) {
        seenIds.add(record.id);
        allRecords.push(record);
      }
    }
  }

  const mergedCounts = computeCounts(allRecords);

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
      <EntitySection title="Triage Queue">
        <UnifiedTriageBrowser
          records={allRecords}
          counts={mergedCounts}
          thesisId={thesis.id}
          showTypeFilters
        />
      </EntitySection>
    </EntityDetailLayout>
  );
}
