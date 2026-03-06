import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getStrategyDetail } from '@/db/queries/strategies';
import { getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { EntityDetailLayout, EntitySection } from '@/components/layout/EntityDetailLayout';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategySidebar } from '@/components/strategies/StrategySidebar';
import { JournalBrowser } from '@/components/journal/JournalBrowser';
import { EntityStatusBadge } from '@/components/ui/badge';
import type { JournalEntryWithUnderlying } from '@/app/journal/page';

interface JournalPageProps {
  params: Promise<{ strategyId: string }>;
}

export async function generateMetadata({ params }: JournalPageProps): Promise<Metadata> {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);
  const label = detail?.strategy?.label || detail?.strategy?.strategyKey || 'Strategy';
  return {
    title: `${label} - Journal`,
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

export default async function StrategyJournalPage({ params }: JournalPageProps) {
  const { strategyId } = await params;

  const detail = await getStrategyDetail(strategyId);
  if (!detail) {
    notFound();
  }

  const { strategy } = detail;

  // Collect claims linked to the asset thesis (if any)
  const claimsWithSources = strategy.assetThesisId
    ? await getMainClaimsWithSourcesForAssetThesis(strategy.assetThesisId)
    : [];

  // Collect all related entity IDs for comprehensive journal view
  const relatedEntityIds = [
    strategyId, // the strategy itself
    ...(strategy.assetThesisId ? [strategy.assetThesisId] : []), // linked asset thesis
    ...strategy.linkedMacroTheses.map((mt) => mt.id), // linked macro theses (via asset thesis)
    ...detail.openPositions.map((p) => p.id), // open positions
    ...claimsWithSources.map((c) => c.claim.id), // claims linked to asset thesis
  ];

  const journalData = await getEntityJournalData(relatedEntityIds);

  const statusBadge = <EntityStatusBadge status={strategy.status} />;

  return (
    <EntityDetailLayout
      title={strategy.label ?? strategy.strategyKey}
      subtitle={
        <span className="inline-flex items-center gap-2">
          Strategy
          <span className="font-mono text-muted-foreground">
            ({strategy.strategyKey})
          </span>
        </span>
      }
      statusBadge={statusBadge}
      tabs={<StrategyTabs strategyId={strategyId} />}
      activeNav="strategies"
      sidebar={
        <StrategySidebar
          strategy={{
            id: strategy.id,
            strategyKey: strategy.strategyKey,
            label: strategy.label,
            strategyType: strategy.strategyType,
            templateLabel: strategy.templateLabel,
            underlyingTicker: strategy.underlyingTicker,
            openedAt: strategy.openedAt,
            closedAt: strategy.closedAt,
            status: strategy.status,
            direction: strategy.direction,
            assetThesisId: strategy.assetThesisId,
          }}
          openPositionsCount={detail.openPositions.length}
          triageCount={detail.triageFlags.length}
          signalsCount={0}
          linkedMacroTheses={strategy.linkedMacroTheses.map((mt) => ({ id: mt.id, title: mt.title }))}
          linkedAssetThesis={strategy.assetThesisId ? { id: strategy.assetThesisId, title: strategy.assetViewTitle || 'Asset Thesis', ticker: strategy.underlyingTicker } : null}
        />
      }
    >
      <EntitySection title="Activity Journal">
        {journalData.entries.length > 0 ? (
          <JournalBrowser
            entries={journalData.entries}
            totalEntries={journalData.entries.length}
            objectTypes={journalData.objectTypes}
            actionTypes={journalData.actionTypes}
            sources={journalData.sources}
            underlyings={journalData.underlyings}
            entityIds={relatedEntityIds}
          />
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No journal entries for this strategy yet. Entries are created when you annotate, change status, link claims, or take triage actions.
          </p>
        )}
      </EntitySection>
    </EntityDetailLayout>
  );
}
