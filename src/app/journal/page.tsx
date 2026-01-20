import { Metadata } from 'next';
import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { desc, sql } from 'drizzle-orm';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { JournalBrowser } from '@/components/journal/JournalBrowser';
import type { JournalEntry } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Journal',
};

// Extended type for journal entries with underlying tickers (array for macro theses with multiple links)
export type JournalEntryWithUnderlying = JournalEntry & {
  underlyingTickers: string[];
};

async function getJournalData() {
  // Fetch journal entries with aggregated underlying tickers from the view
  // Uses array_agg to collect all linked underlyings (for macro theses with multiple asset thesis links)
  // Must alias snake_case columns to camelCase to match TypeScript types
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
      first_detected_at AS "firstDetectedAt",
      last_seen_at AS "lastSeenAt",
      occurrence_count AS "occurrenceCount",
      status,
      COALESCE(array_agg(DISTINCT underlying_ticker) FILTER (WHERE underlying_ticker IS NOT NULL), '{}') AS "underlyingTickers"
    FROM journal_entries_with_underlying
    GROUP BY id, timestamp, object_type, object_id, object_title, action_type, action_description,
             triage_record_id, skill_invoked, previous_state, new_state, rationale, source, metadata,
             first_detected_at, last_seen_at, occurrence_count, status
    ORDER BY timestamp DESC
    LIMIT 500
  `);
  const entries = entriesResult as unknown as JournalEntryWithUnderlying[];

  // Get distinct object types
  const objectTypesResult = await db
    .selectDistinct({ value: journalEntries.objectType })
    .from(journalEntries)
    .orderBy(journalEntries.objectType);

  // Get distinct action types
  const actionTypesResult = await db
    .selectDistinct({ value: journalEntries.actionType })
    .from(journalEntries)
    .orderBy(journalEntries.actionType);

  // Get distinct sources
  const sourcesResult = await db
    .selectDistinct({ value: journalEntries.source })
    .from(journalEntries)
    .orderBy(journalEntries.source);

  // Get distinct underlyings from the view (non-null only)
  const underlyingsResult = await db.execute(sql`
    SELECT DISTINCT underlying_ticker
    FROM journal_entries_with_underlying
    WHERE underlying_ticker IS NOT NULL
    ORDER BY underlying_ticker
  `);
  const underlyings = (underlyingsResult as unknown as { underlying_ticker: string }[]).map(
    (r) => r.underlying_ticker
  );

  return {
    entries,
    objectTypes: objectTypesResult.map((r) => r.value),
    actionTypes: actionTypesResult.map((r) => r.value),
    sources: sourcesResult.map((r) => r.value),
    underlyings,
  };
}

export default async function JournalPage() {
  const { entries, objectTypes, actionTypes, sources, underlyings } = await getJournalData();

  // Calculate statistics
  const totalEntries = entries.length;
  const todayCount = entries.filter((e) => {
    const entryDate = new Date(e.timestamp);
    const today = new Date();
    return (
      entryDate.getFullYear() === today.getFullYear() &&
      entryDate.getMonth() === today.getMonth() &&
      entryDate.getDate() === today.getDate()
    );
  }).length;

  const userActions = entries.filter((e) => e.source === 'user').length;
  const skillActions = entries.filter((e) => e.source === 'skill').length;
  const automationActions = entries.filter((e) => e.source === 'automation').length;

  // Count by action type category
  const createdCount = entries.filter((e) => e.actionType.includes('CREATED')).length;
  const updatedCount = entries.filter(
    (e) => e.actionType.includes('UPDATED') || e.actionType.includes('CHANGED')
  ).length;
  const deletedCount = entries.filter((e) => e.actionType.includes('DELETED')).length;

  return (
    <DashboardShell title="Decision Journal" subtitle="Audit trail of all decisions and actions" activeNav="journal">
      <div className="space-y-6">
        {/* Statistics Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Overview</h3>
          <dl className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Total Entries</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">{totalEntries}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Today</dt>
              <dd className="mt-1 text-2xl font-semibold text-blue-600">{todayCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Created</dt>
              <dd className="mt-1 text-2xl font-semibold text-emerald-600">{createdCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Updated</dt>
              <dd className="mt-1 text-2xl font-semibold text-blue-600">{updatedCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Deleted</dt>
              <dd className="mt-1 text-2xl font-semibold text-red-600">{deletedCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">User Actions</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">{userActions}</dd>
            </div>
          </dl>
        </div>

        {/* Journal Browser */}
        {entries.length > 0 ? (
          <JournalBrowser
            entries={entries}
            objectTypes={objectTypes}
            actionTypes={actionTypes}
            sources={sources}
            underlyings={underlyings}
          />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-600 mb-4">No journal entries found.</p>
            <p className="text-sm text-slate-500">
              Journal entries are automatically created when you make changes to theses, claims, signals, and
              other entities.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
