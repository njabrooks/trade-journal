import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { getCachedAssetThesisById } from '@/db/queries/cached';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { getUnifiedTriageQueue } from '@/db/queries/triage';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { AssetThesisSidebar } from '@/components/asset-theses/AssetThesisSidebar';
import { UnifiedTriageBrowser } from '@/components/triage/UnifiedTriageBrowser';
import { EntityStatusBadge } from '@/components/ui/badge';
import type { UnifiedTriageRecord, UnifiedTriageFilterCounts, TriageObjectType } from '@/types/triage';

interface TriagePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TriagePageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getCachedAssetThesisById(id);
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

export default async function AssetThesisTriagePage({ params }: TriagePageProps) {
  const { id } = await params;

  const [thesis, claimsWithSources, allMacroTheses, allStrategies, validationPoints, thesisTriageResult] = await Promise.all([
    getCachedAssetThesisById(id),
    getMainClaimsWithSourcesForAssetThesis(id),
    getMacroThesesList(),
    getStrategiesForList(1000, { assetThesisId: id, includeClosedStrategies: true }),
    getActiveValidationPoints(id, 'asset'),
    getUnifiedTriageQueue({ thesisId: id, includeAll: true }),
  ]);

  if (!thesis) {
    notFound();
  }

  const linkedMacroThesesIds = thesis.linkedMacroTheses.map((lmt) => lmt.macroThesisId);
  const linkedMacroTheses = allMacroTheses.filter((mt) => linkedMacroThesesIds.includes(mt.id));
  // allStrategies is already filtered by assetThesisId via the query
  const linkedStrategies = allStrategies;

  // Fetch strategy/position triage for strategies linked to this asset thesis
  const strategyTriageResults = await Promise.all(
    linkedStrategies.map((s) => getUnifiedTriageQueue({ strategyId: s.id, includeAll: true }))
  );

  // Fetch macro thesis triage for linked macro theses
  const macroThesisTriageResults = await Promise.all(
    linkedMacroThesesIds.map((mtId) => getUnifiedTriageQueue({ thesisId: mtId, includeAll: true }))
  );

  // Merge all triage records (asset thesis + strategies + macro theses), deduplicate by id
  const seenIds = new Set<string>();
  const allRecords: UnifiedTriageRecord[] = [];

  for (const record of thesisTriageResult.records) {
    if (!seenIds.has(record.id)) {
      seenIds.add(record.id);
      allRecords.push(record);
    }
  }
  for (const result of [...strategyTriageResults, ...macroThesisTriageResults]) {
    for (const record of result.records) {
      if (!seenIds.has(record.id)) {
        seenIds.add(record.id);
        allRecords.push(record);
      }
    }
  }

  const mergedCounts = computeCounts(allRecords);

  const tabs = createEntityTabs('/asset-theses', id);

  const statusBadge = <EntityStatusBadge status={thesis.status} />;

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
