import { sql } from "drizzle-orm";
import { journalEntries } from "../../src/db/schema.js";

export const DECISION_SNOOZED_UNTIL = sql`COALESCE(${journalEntries.metadata}->'decision'->>'snoozed_until', ${journalEntries.metadata}->>'snoozed_until')`;

/** Canonical open-item predicate shared by listing and resolution. */
export const OPEN_DECISION_PREDICATE = sql`(${journalEntries.status} = 'active' OR (${journalEntries.status} = 'snoozed' AND ${DECISION_SNOOZED_UNTIL} IS NOT NULL AND (${DECISION_SNOOZED_UNTIL})::timestamptz <= now()))`;
