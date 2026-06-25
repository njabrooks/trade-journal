/**
 * Thesis expression episodes — DB orchestration (docs/v2/13 §2, E1).
 *
 * Reads a thesis's status_change journal trail, derives its expression episodes
 * (contiguous `monitoring` spans — pure logic in ./thesisEpisodeRules), and upserts them
 * into `thesis_expression_episodes`. Idempotent: re-syncing preserves any per-episode
 * retrospective already recorded and only refreshes the boundary columns.
 *
 * Kept current incrementally after the lifecycle cascade (strategyAuto.ts) for the theses
 * that transitioned, and in bulk by scripts/ops/backfill-thesis-episodes.ts.
 *
 * Thesis-vs-strategy disambiguation is by thesis-id membership, not journal objectType —
 * a thesis uuid only ever appears as the objectId of its own status_change entries.
 */
import { db } from '@/db';
import { journalEntries, macroTheses, assetTheses, thesisExpressionEpisodes } from '@/db/schema';
import { and, asc, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { deriveEpisodes, type DerivedEpisode, type StatusPoint } from '@/lib/derived/thesisEpisodeRules';

export type ThesisType = 'macro' | 'asset';

interface JournalStatusRow {
  at: Date | string | null;
  newState: unknown;
}

/** Project ordered status_change rows to the pure timeline, dropping any without a status. */
function pointsFromRows(rows: JournalStatusRow[]): StatusPoint[] {
  const points: StatusPoint[] = [];
  for (const r of rows) {
    const status = (r.newState as { status?: unknown } | null)?.status;
    if (typeof status === 'string' && r.at) {
      points.push({ at: new Date(r.at).toISOString(), status });
    }
  }
  return points;
}

/** Upsert derived episodes for one thesis, preserving recorded retrospectives. Returns the episode count. */
async function upsertEpisodes(thesisId: string, thesisType: ThesisType, derived: DerivedEpisode[]): Promise<number> {
  for (const ep of derived) {
    const openedAt = new Date(ep.openedAt);
    const closedAt = ep.closedAt ? new Date(ep.closedAt) : null;
    await db
      .insert(thesisExpressionEpisodes)
      .values({ thesisId, thesisType, episodeNo: ep.episodeNo, openedAt, closedAt, closingStatus: ep.closingStatus })
      .onConflictDoUpdate({
        target: [
          thesisExpressionEpisodes.thesisId,
          thesisExpressionEpisodes.thesisType,
          thesisExpressionEpisodes.episodeNo,
        ],
        // Boundary columns only — never touch the retrospective columns record-retrospective writes (E2).
        set: { openedAt, closedAt, closingStatus: ep.closingStatus, updatedAt: new Date() },
      });
  }
  // A re-derivation can shrink the set (e.g. a span later reinterpreted as flap). Drop the
  // now-extra trailing episodes — but never one that already carries a retrospective.
  await db.delete(thesisExpressionEpisodes).where(
    and(
      eq(thesisExpressionEpisodes.thesisId, thesisId),
      eq(thesisExpressionEpisodes.thesisType, thesisType),
      sql`${thesisExpressionEpisodes.episodeNo} > ${derived.length}`,
      sql`${thesisExpressionEpisodes.retrospectiveAt} IS NULL`,
    ),
  );
  return derived.length;
}

/** Derive + upsert episodes for a single thesis from its journal trail. */
export async function syncThesisEpisodes(thesisId: string, thesisType: ThesisType): Promise<number> {
  const rows = await db
    .select({ at: journalEntries.timestamp, newState: journalEntries.newState })
    .from(journalEntries)
    .where(and(eq(journalEntries.objectId, thesisId), eq(journalEntries.actionType, 'status_change')))
    .orderBy(asc(journalEntries.timestamp));
  return upsertEpisodes(thesisId, thesisType, deriveEpisodes(pointsFromRows(rows)));
}

/** Sync episodes for the theses named by cascade transitions (the incremental post-ingestion hot path). */
export async function syncEpisodesForTransitions(transitions: { level: ThesisType; id: string }[]): Promise<void> {
  const seen = new Set<string>();
  for (const t of transitions) {
    const key = `${t.level}:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await syncThesisEpisodes(t.id, t.level);
    } catch (e) {
      console.error(`Episode sync failed for ${key}:`, e);
    }
  }
}

/** Full sweep: derive episodes for every thesis carrying a status_change trail. Backfill + maintenance. */
export async function syncAllThesisEpisodes(): Promise<{ theses: number; episodes: number }> {
  const typeById = new Map<string, ThesisType>();
  for (const m of await db.select({ id: macroTheses.id }).from(macroTheses)) typeById.set(m.id, 'macro');
  for (const a of await db.select({ id: assetTheses.id }).from(assetTheses)) typeById.set(a.id, 'asset');

  const rows = await db
    .select({ objectId: journalEntries.objectId, at: journalEntries.timestamp, newState: journalEntries.newState })
    .from(journalEntries)
    .where(eq(journalEntries.actionType, 'status_change'))
    .orderBy(asc(journalEntries.timestamp));

  // Group the ordered trail by thesis (strategies also emit status_change — skip non-thesis ids).
  const byThesis = new Map<string, JournalStatusRow[]>();
  for (const r of rows) {
    if (!r.objectId || !typeById.has(r.objectId)) continue;
    const arr = byThesis.get(r.objectId) ?? [];
    arr.push({ at: r.at, newState: r.newState });
    byThesis.set(r.objectId, arr);
  }

  let episodes = 0;
  let theses = 0;
  for (const [thesisId, trail] of byThesis) {
    episodes += await upsertEpisodes(thesisId, typeById.get(thesisId)!, deriveEpisodes(pointsFromRows(trail)));
    theses++;
  }
  return { theses, episodes };
}

/**
 * One-time migration (docs/v2/13 §2, §4 lean ⑥): stamp the existing thesis-level retrospective
 * onto its matching closed episode, so the per-episode worklist doesn't re-flag a retrospective
 * already written under the old (thesis-level) flow, and the per-episode UI surfaces it.
 *
 * Idempotent — only touches closed episodes still missing a retrospective whose thesis carries a
 * thesis-level one (frozen metrics and/or a `retrospective` journal entry). Legacy theses with no
 * cascade journal trail have no episode and keep their thesis-level retrospective via the UI
 * fallback; synthesizing episode-1 rows for them is a deferred, non-essential follow-on.
 */
export async function migrateExistingRetrospectivesToEpisodes(): Promise<number> {
  const closed = await db
    .select({
      thesisId: thesisExpressionEpisodes.thesisId,
      thesisType: thesisExpressionEpisodes.thesisType,
      episodeNo: thesisExpressionEpisodes.episodeNo,
    })
    .from(thesisExpressionEpisodes)
    .where(and(isNotNull(thesisExpressionEpisodes.closedAt), isNull(thesisExpressionEpisodes.retrospectiveAt)));

  let migrated = 0;
  for (const ep of closed) {
    const thesisTable = ep.thesisType === 'macro' ? macroTheses : assetTheses;
    const [t] = await db
      .select({ retrospectiveMetrics: thesisTable.retrospectiveMetrics, outcome: thesisTable.outcome, outcomeNotes: thesisTable.outcomeNotes })
      .from(thesisTable)
      .where(eq(thesisTable.id, ep.thesisId))
      .limit(1);
    const [j] = await db
      .select({ ts: journalEntries.timestamp })
      .from(journalEntries)
      .where(and(eq(journalEntries.objectId, ep.thesisId), eq(journalEntries.actionType, 'retrospective')))
      .orderBy(desc(journalEntries.timestamp))
      .limit(1);

    if (!t?.retrospectiveMetrics && !t?.outcome && !j) continue; // genuinely needs a retrospective — leave it on the worklist
    const metrics = (t?.retrospectiveMetrics ?? null) as { executionQuality?: string } | null;
    await db
      .update(thesisExpressionEpisodes)
      .set({
        retrospectiveMetrics: t?.retrospectiveMetrics ?? null,
        outcome: t?.outcome ?? null,
        outcomeNotes: t?.outcomeNotes ?? null,
        executionQuality: metrics?.executionQuality ?? null,
        retrospectiveAt: j?.ts ?? new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(thesisExpressionEpisodes.thesisId, ep.thesisId),
        eq(thesisExpressionEpisodes.thesisType, ep.thesisType),
        eq(thesisExpressionEpisodes.episodeNo, ep.episodeNo),
      ));
    migrated++;
  }
  return migrated;
}
