/**
 * Shared utility for emitting intel items from ingestion scripts.
 *
 * Called after each intelligence-class ingestion script upserts to its domain table.
 * Normalizes the source-specific data into the cross-source intel_items table.
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { intelItems } from '../../db/schema.js';

export interface IntelItemInput {
  sourceKey: string;
  sourceTable: string;
  sourceRecordId: string;
  occurredAt: Date;
  headline: string;
  body?: string | null;
  severity: 'critical' | 'high' | 'medium' | 'info';
  tickers: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Emit intel items to the normalized intel_items table.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 * Returns the number of newly inserted items.
 *
 * Accepts a db instance so it works from both scripts (scripts/lib/db.ts)
 * and app context (src/db/index.ts).
 */
export async function emitIntelItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbInstance: NodePgDatabase<any>,
  items: IntelItemInput[],
): Promise<number> {
  if (items.length === 0) return 0;

  const values = items.map(item => ({
    sourceKey: item.sourceKey,
    sourceTable: item.sourceTable,
    sourceRecordId: item.sourceRecordId,
    occurredAt: item.occurredAt,
    headline: item.headline,
    body: item.body ?? null,
    severity: item.severity,
    tickers: item.tickers,
    metadata: item.metadata ?? {},
    processingStatus: 'pending' as const,
  }));

  // Batch insert in chunks to avoid query size limits.
  // Count via RETURNING, not result.rowCount: with onConflictDoNothing, node-postgres
  // under-reports rowCount (observed 0 on genuinely-fresh inserts), which silently broke
  // the caller's "already ingested" dedup. RETURNING yields exactly the rows actually
  // inserted (conflicts are not returned), so its length is the reliable inserted count.
  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE);
    const result = await dbInstance
      .insert(intelItems)
      .values(chunk)
      .onConflictDoNothing({ target: [intelItems.sourceTable, intelItems.sourceRecordId] })
      .returning({ id: intelItems.id });
    inserted += result.length;
  }

  return inserted;
}
