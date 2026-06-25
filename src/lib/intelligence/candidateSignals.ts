/**
 * candidate_signal writer — the single producer of the docs/v2/16 §1b contract.
 *
 * A `candidate_signal` is a journal row proposing a signal statement for a thesis:
 * "something bears on this thesis that no active signal yet tracks." It surfaces on
 * `thesis-snapshot.ts → candidateSignals` and the re-underwrite (Lane B / P3) promotes
 * the load-bearing ones into real signals (marking the rest resolved/dismissed).
 *
 * Two producers write these, through THIS module so the dedup + metadata shape stay
 * identical:
 *   - thesis-observe ingest (`ingest-world-monitor.ts` harvestCandidateSignals) — news
 *     that bore on a thesis but matched no signal.
 *   - relate-bookmark (docs/v2/17) — a human-attention bookmark judged to bear on a
 *     thesis with no covering signal. (extra = { origin:'bookmark', significance, … })
 *
 * Dedup: one active candidate per (objectId, normalized statement) — bump
 * occurrenceCount/lastSeenAt rather than duplicate. The normalize + dedup-decision are
 * pure (testable without a DB); the upsert is the thin DB layer.
 *
 * NB: this module imports only `db/schema` (table defs — no client), never `db/index`,
 * so it is safe to import from vitest. The `db` instance is always injected.
 */

import { and, eq } from 'drizzle-orm';
import type { db as defaultDb } from '../../db/index.js';
import * as schema from '../../db/schema.js';

// type-only import of the app db: erased at runtime, so this module never creates a
// client (safe to import from vitest); matches the db type getActiveThesisCatalog wants.
type Db = typeof defaultDb;
const { journalEntries } = schema;

/** Normalize a proposed statement for fuzzy dedup (lowercase, strip punctuation, collapse ws). */
export function normalizeStatement(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export interface ExistingCandidate {
  id: string;
  occurrenceCount: number | null;
  statement: string;
}

/**
 * Pure dedup decision: among a thesis's existing active candidate_signal rows, find one
 * whose stored statement normalizes equal to `statement`. Empty/blank statements never
 * match (returns null) — the caller skips them.
 */
export function findDuplicateCandidate(
  existing: ExistingCandidate[],
  statement: string,
): ExistingCandidate | null {
  const n = normalizeStatement(statement);
  if (!n) return null;
  return existing.find((e) => normalizeStatement(e.statement) === n) ?? null;
}

export interface CandidateSignalInput {
  objectType: 'macro_thesis' | 'asset_thesis';
  objectId: string;
  objectTitle: string;
  /** The proposed signal statement (also the journal action_description). */
  statement: string;
  sourceUrl?: string | null;
  /** ISO-8601 — when the underlying evidence was observed. */
  observedAt: string;
  /** Provenance label, e.g. 'relate-bookmark' or the observe report path. */
  fromReport: string;
  rationale?: string | null;
  /** Extra keys merged into metadata.candidateSignal (e.g. origin, significance, bookmarkNodeId). */
  extra?: Record<string, unknown>;
}

export type CandidateSignalResult = 'written' | 'bumped' | 'would-write' | 'would-bump' | 'skipped';

/**
 * Upsert one candidate_signal journal row for a thesis, deduped per (objectId, normalized
 * statement). Returns what happened; dry-run reports would-write/would-bump using the same
 * existence check as the real path (dry-run parity).
 */
export async function upsertCandidateSignal(
  db: Db,
  input: CandidateSignalInput,
  opts: { dryRun?: boolean } = {},
): Promise<CandidateSignalResult> {
  if (!normalizeStatement(input.statement)) return 'skipped';

  const rows = await db
    .select({
      id: journalEntries.id,
      occurrenceCount: journalEntries.occurrenceCount,
      metadata: journalEntries.metadata,
    })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.objectId, input.objectId),
      eq(journalEntries.actionType, 'candidate_signal'),
      eq(journalEntries.status, 'active'),
    ));

  const existing: ExistingCandidate[] = rows.map((r) => ({
    id: r.id,
    occurrenceCount: r.occurrenceCount,
    statement: (r.metadata as { candidateSignal?: { statement?: string } } | null)?.candidateSignal?.statement ?? '',
  }));
  const dupe = findDuplicateCandidate(existing, input.statement);

  if (dupe) {
    if (opts.dryRun) return 'would-bump';
    await db
      .update(journalEntries)
      .set({ lastSeenAt: new Date(), occurrenceCount: (dupe.occurrenceCount ?? 1) + 1 })
      .where(eq(journalEntries.id, dupe.id));
    return 'bumped';
  }

  if (opts.dryRun) return 'would-write';

  const now = new Date();
  await db.insert(journalEntries).values({
    objectType: input.objectType,
    objectId: input.objectId,
    objectTitle: input.objectTitle,
    actionType: 'candidate_signal',
    actionDescription: input.statement,
    source: 'automation',
    status: 'active',
    firstDetectedAt: now,
    lastSeenAt: now,
    occurrenceCount: 1,
    metadata: {
      candidateSignal: {
        statement: input.statement,
        sourceUrl: input.sourceUrl ?? null,
        observedAt: input.observedAt,
        fromReport: input.fromReport,
        rationale: input.rationale ?? null,
        ...(input.extra ?? {}),
      },
    },
  });
  return 'written';
}
