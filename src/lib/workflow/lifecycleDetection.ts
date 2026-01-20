/**
 * Workflow Module - Journal Logging
 *
 * Provides journal logging utilities for tracking thesis and entity lifecycle events.
 * The workflow/lifecycle tracking is now handled by the triage system (thesisTriage.ts).
 *
 * Note: The lifecycle transition detection functions were removed as part of #ENH-048
 * (Entity Status Standardization). Workflow state is now tracked via triage records,
 * and entity status uses the standardized values: draft, active, complete, rejected.
 */

import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export type ThesisType = 'macro' | 'asset';

/**
 * Log an action to the journal (utility function for other modules)
 *
 * @param entry - The journal entry data
 * @param entry.batchId - Optional UUID to group related entries from the same operation
 */
export async function logToJournal(entry: {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType: string;
  actionDescription: string;
  triageRecordId?: string;
  skillInvoked?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  rationale?: string;
  source: 'user' | 'skill' | 'automation';
  metadata?: Record<string, unknown>;
  batchId?: string;
}): Promise<string> {
  const now = new Date();
  const result = await db
    .insert(journalEntries)
    .values({
      ...entry,
      firstDetectedAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      status: 'active',
    })
    .returning({ id: journalEntries.id });

  return result[0].id;
}

/**
 * Generate a new batch ID for grouping related journal entries
 */
export function generateBatchId(): string {
  return crypto.randomUUID();
}

/**
 * Log a triage detection to the journal with deduplication.
 * If an active entry already exists for this object+trigger, updates it instead of creating a duplicate.
 *
 * Returns: { isNew: boolean, entryId: string }
 */
export async function logTriageToJournalWithDedup(entry: {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType: string;
  actionDescription: string;
  triggerKey: string; // Unique key for deduplication (e.g., recommendedAction)
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  source: 'user' | 'skill' | 'automation';
  metadata?: Record<string, unknown>;
}): Promise<{ isNew: boolean; entryId: string }> {
  const now = new Date();

  // Check for existing active entry with same object + trigger
  const existing = await db
    .select({
      id: journalEntries.id,
      occurrenceCount: journalEntries.occurrenceCount,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.objectId, entry.objectId),
        eq(journalEntries.actionType, entry.actionType),
        eq(journalEntries.status, 'active'),
        sql`${journalEntries.metadata}->>'trigger' = ${entry.triggerKey}`
      )
    )
    .limit(1);

  if (existing[0]) {
    // Update existing entry - increment count, update last_seen_at
    await db
      .update(journalEntries)
      .set({
        lastSeenAt: now,
        occurrenceCount: (existing[0].occurrenceCount || 1) + 1,
        // Update new_state to reflect current state (may have changed)
        newState: entry.newState,
      })
      .where(eq(journalEntries.id, existing[0].id));

    return { isNew: false, entryId: existing[0].id };
  }

  // Create new entry
  const result = await db
    .insert(journalEntries)
    .values({
      objectType: entry.objectType,
      objectId: entry.objectId,
      objectTitle: entry.objectTitle,
      actionType: entry.actionType,
      actionDescription: entry.actionDescription,
      previousState: entry.previousState,
      newState: entry.newState,
      source: entry.source,
      metadata: { ...entry.metadata, trigger: entry.triggerKey },
      firstDetectedAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      status: 'active',
    })
    .returning({ id: journalEntries.id });

  return { isNew: true, entryId: result[0].id };
}

/**
 * Resolve a journal entry (mark as addressed)
 */
export async function resolveJournalEntry(
  entryId: string,
  rationale?: string
): Promise<void> {
  await db
    .update(journalEntries)
    .set({
      status: 'resolved',
      rationale: rationale || null,
    })
    .where(eq(journalEntries.id, entryId));
}

/**
 * Dismiss a journal entry (mark as ignored)
 */
export async function dismissJournalEntry(
  entryId: string,
  rationale?: string
): Promise<void> {
  await db
    .update(journalEntries)
    .set({
      status: 'dismissed',
      rationale: rationale || null,
    })
    .where(eq(journalEntries.id, entryId));
}
