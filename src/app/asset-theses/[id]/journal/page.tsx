import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getAssetThesisById, getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { EntityTabs } from '@/components/layout/EntityTabs';
import { createEntityTabs } from '@/lib/types/entity-tabs';
import { AssetThesisSidebar } from '@/components/asset-theses/AssetThesisSidebar';
import { JournalBrowser } from '@/components/journal/JournalBrowser';
import { EntityStatusBadge } from '@/components/ui/badge';
import type { JournalEntryWithUnderlying } from '@/app/journal/page';

interface JournalPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: JournalPageProps): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getAssetThesisById(id);
  return {
    title: thesis ? `${thesis.title} - Journal` : 'Journal',
  };
}

async function getEntityJournalData(entityIds: string[]) {
  if (entityIds.length === 0) {
    return { entries: [], objectTypes: [], actionTypes: [], sources: [], underlyings: [] };
  }

  const entriesResult = await db.execute(sql`
    SELECT
      id,
      timestamp,
      object_type AS "objectType",
      object_id AS "objectId",
      object_title AS "objectTitle",
      action_type AS "actionType",
      action_description AS "actionDescription",
      triage_record_id AS "triageRecordId",
      skill_invoked AS "skillInvoked",
      previous_state AS "previousState",
      new_state AS "newState",
      rationale,
      source,
      metadata,
      batch_id AS "batchId",
      first_detected_at AS "firstDetectedAt",
      last_seen_at AS "lastSeenAt",
      occurrence_count AS "occurrenceCount",
      status,
      COALESCE(array_agg(DISTINCT underlying_ticker) FILTER (WHERE underlying_ticker IS NOT NULL), '{}') AS "underlyingTickers"
    FROM journal_entries_with_underlying
    WHERE object_id IN (${sql.join(entityIds.map(id => sql`${id}::uuid`), sql`, `)})
    GROUP BY id, timestamp, object_type, object_id, object_title, action_type, action_description,
             triage_record_id, skill_invoked, previous_state, new_state, rationale, source, metadata,
             batch_id, first_detected_at, last_seen_at, occurrence_count, status
    ORDER BY timestamp DESC
    LIMIT 500
  `);
  const entries = entriesResult as unknown as JournalEntryWithUnderlying[];

  const objectTypes = [...new Set(entries.map((e) => e.objectType))].sort();
  const actionTypes = [...new Set(entries.map((e) => e.actionType))].sort();
  const sources = [...new Set(entries.map((e) => e.source))].sort();
  const underlyings = [...new Set(entries.flatMap((e) => e.underlyingTickers))].filter(Boolean).sort();

  return { entries, objectTypes, actionTypes, sources, underlyings };
}

export default async function AssetThesisJournalPage({ params }: JournalPageProps) {
  const { id } = await params;

  // First fetch: thesis + related entities to discover all linked IDs
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

  const linkedMacroThesesIds = thesis.linkedMacroTheses.map((lmt) => lmt.macroThesisId);
  const linkedMacroTheses = allMacroTheses.filter((mt) => linkedMacroThesesIds.includes(mt.id));
  const linkedStrategies = allStrategies.filter((s) => s.assetThesisId === id);

  // Collect all related entity IDs for comprehensive journal view
  const relatedEntityIds = [
    id, // the asset thesis itself
    ...linkedStrategies.map((s) => s.id),
    ...linkedMacroThesesIds,
    ...claimsWithSources.map((c) => c.claim.id),
  ];

  // Second fetch: journal entries for all related entities
  const journalData = await getEntityJournalData(relatedEntityIds);

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
      <EntitySection title="Activity Journal">
        {journalData.entries.length > 0 ? (
          <JournalBrowser
            entries={journalData.entries}
            objectTypes={journalData.objectTypes}
            actionTypes={journalData.actionTypes}
            sources={journalData.sources}
            underlyings={journalData.underlyings}
          />
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No journal entries for this thesis yet. Entries are created when you annotate, change status, link claims, or take triage actions.
          </p>
        )}
      </EntitySection>
    </EntityDetailLayout>
  );
}
