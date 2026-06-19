/**
 * automation_cursors helper (C6 — docs/v2/09 §10). Key-value high-water-marks for the
 * belief-maintenance routine. No main() — safe to import.
 */
import { db, schema } from './db.js';
import { eq } from 'drizzle-orm';

const { automationCursors } = schema;

/** The relate-research insight-date high-water-mark (the only cursor the routine needs). */
export const RELATE_RESEARCH_CURSOR = 'relate_research_insights';

export async function getCursor(key: string): Promise<string | null> {
  const [row] = await db.select({ v: automationCursors.cursorValue }).from(automationCursors).where(eq(automationCursors.key, key)).limit(1);
  return row?.v ?? null;
}

export async function setCursor(key: string, value: string, metadata?: Record<string, unknown>): Promise<void> {
  await db
    .insert(automationCursors)
    .values({ key, cursorValue: value, metadata: metadata ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: automationCursors.key, set: { cursorValue: value, metadata: metadata ?? null, updatedAt: new Date() } });
}
