/**
 * Bookmark-attention diagnostics — DB layer (docs/v2/17 P3). Imports @/db; the pure
 * scorer lives in bookmarkAttentionRules.ts (unit-tested, no DB).
 *
 * Reads the bookmark-origin `candidate_signal` rows relate-bookmark wrote (Phase 1) and
 * rolls them up per thesis. Consumed by:
 *   - raise-reunderwrite-decisions.ts — to ENRICH + prioritise an existing re_underwrite_due
 *     (never to raise one; docs/v2/17 fork b).
 *   - thesis-snapshot.ts — so /thesis re-underwrite sees attention intensity.
 */
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { scoreAttention, type AttentionItem, type AttentionSummary, type Significance } from './bookmarkAttentionRules';

/** Per-thesis (object_id) attention summary from active bookmark-origin candidate_signals. */
export async function computeBookmarkAttention(opts: { asOf?: Date } = {}): Promise<Map<string, AttentionSummary>> {
  const now = opts.asOf ?? new Date();

  const rows = await db.execute<{
    object_id: string;
    significance: string | null;
    observed_at: string | null;
    statement: string | null;
    source_url: string | null;
  }>(sql`
    SELECT object_id,
      metadata->'candidateSignal'->>'significance' AS significance,
      metadata->'candidateSignal'->>'observedAt'   AS observed_at,
      metadata->'candidateSignal'->>'statement'    AS statement,
      metadata->'candidateSignal'->>'sourceUrl'    AS source_url
    FROM journal_entries
    WHERE action_type = 'candidate_signal'
      AND status = 'active'
      AND metadata->'candidateSignal'->>'origin' = 'bookmark'
  `);

  const byThesis = new Map<string, AttentionItem[]>();
  for (const r of rows) {
    if (!r.object_id) continue;
    const observedAt = r.observed_at ? new Date(r.observed_at) : null;
    if (!observedAt || Number.isNaN(observedAt.getTime())) continue;
    const significance: Significance = r.significance === 'material' ? 'material' : 'notable';
    const arr = byThesis.get(r.object_id) ?? [];
    arr.push({ significance, observedAt, statement: r.statement ?? '', sourceUrl: r.source_url });
    byThesis.set(r.object_id, arr);
  }

  const out = new Map<string, AttentionSummary>();
  for (const [thesisId, items] of byThesis) out.set(thesisId, scoreAttention(items, now));
  return out;
}

/** Single-thesis attention for the snapshot / `--context` path. null if no bookmark attention. */
export async function getBookmarkAttention(
  thesisId: string,
  opts: { asOf?: Date } = {},
): Promise<AttentionSummary | null> {
  const all = await computeBookmarkAttention(opts);
  return all.get(thesisId) ?? null;
}
