/**
 * relate-bookmark engine (docs/v2/17) — human-attention bookmarks → candidate signals.
 *
 * The monitoring-lane sibling of relate-research. Where relate-research lands #content
 * CLAIMS as belief-formation evidence, relate-bookmark routes the lighter #bookmark
 * stream (X saves etc. — attention, not argument) into the MONITORING lane:
 *   - bears on an active thesis, no covering signal → candidate_signal (channel A)
 *   - trivial / irrelevant / no active thesis        → left in Tana (no DB write)
 *
 * Architecture mirrors relate-research's split:
 *   - This module + scripts/relate-bookmark.ts are DETERMINISTIC: load the catalog,
 *     own the candidate_signal writes (via the shared candidateSignals writer).
 *   - The SEMANTIC JUDGMENT (which thesis a bookmark bears on, significance grade,
 *     whether a signal already covers it, the proposed statement) runs on Claude inside
 *     the /relate-bookmark skill, which reads bookmarks from Tana (MCP) and pipes a judged
 *     plan back into applyBookmarkPlan via --apply.
 *
 * Phase 1 (docs/v2/17 §10): candidate-signal harvest only. The attention-weight on
 * re_underwrite_due (channel B) is Phase 3. Bookmarks NEVER write a tracking
 * signal_data_snapshot (docs/v2/17 §4 — attention has no verdict; keep it out of the
 * chronic-neutral denominator).
 */

import { and, eq } from 'drizzle-orm';
import type { db as defaultDb } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { getActiveThesisCatalog } from './relateResearch.js';
import { upsertCandidateSignal, type CandidateSignalResult } from './candidateSignals.js';

type Db = typeof defaultDb;
const { signals, signalEntityLinks } = schema;

type CatalogThesis = Awaited<ReturnType<typeof getActiveThesisCatalog>>[number];

export interface CatalogSignal {
  id: string;
  statement: string;
  type: string | null;
}

/** A thesis the skill judges bookmarks against, with its active signals (so Claude can
 *  tell "no covering signal" → candidate from "already tracked" → leave it). */
export interface BookmarkCatalogThesis extends CatalogThesis {
  signals: CatalogSignal[];
}

/**
 * The active thesis set (developing + monitoring, via getActiveThesisCatalog) decorated
 * with each thesis's active signals. This is the whole judgment context for the skill —
 * Claude reads it and decides genuine bearing per bookmark (no keyword matching).
 */
export async function loadBookmarkCatalog(db: Db): Promise<BookmarkCatalogThesis[]> {
  const theses = await getActiveThesisCatalog(db);

  const links = await db
    .select({
      signalId: signalEntityLinks.signalId,
      thesisId: signalEntityLinks.thesisId,
      statement: signals.statement,
      type: signals.type,
    })
    .from(signals)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(and(eq(signalEntityLinks.entityType, 'thesis'), eq(signals.status, 'active')));

  const byThesis = new Map<string, CatalogSignal[]>();
  for (const l of links) {
    if (!l.thesisId) continue;
    const arr = byThesis.get(l.thesisId) ?? [];
    arr.push({ id: l.signalId, statement: l.statement, type: l.type });
    byThesis.set(l.thesisId, arr);
  }

  return theses.map((t) => ({ ...t, signals: byThesis.get(t.id) ?? [] }));
}

/** One Claude-judged routing: a notable/material bookmark → a proposed candidate signal. */
export interface BookmarkPlanEntry {
  bookmarkNodeId: string;
  bookmarkTitle?: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  /** The proposed signal statement Claude derived from the bookmark. */
  statement: string;
  significance: 'notable' | 'material';
  sourceUrl?: string | null;
  /** ISO-8601 — the bookmark's creation/observation time; defaults to now if absent. */
  observedAt?: string | null;
  /** Why it bears on the thesis (the bookmark's gist). */
  rationale?: string | null;
}

export interface BookmarkApplyResult {
  written: number;
  bumped: number;
  skipped: number;
  entries: Array<{ bookmarkNodeId: string; thesisId: string; statement: string; result: CandidateSignalResult }>;
}

/**
 * Apply a judged plan: one candidate_signal upsert per entry, through the shared writer
 * (so dedup + metadata match the observe producer exactly). Bookmark-origin candidates
 * carry { origin:'bookmark', significance, bookmarkNodeId } in metadata so a consumer can
 * tell them from observe-origin ones.
 */
export async function applyBookmarkPlan(
  db: Db,
  entries: BookmarkPlanEntry[],
  opts: { dryRun?: boolean } = {},
): Promise<BookmarkApplyResult> {
  let written = 0;
  let bumped = 0;
  let skipped = 0;
  const out: BookmarkApplyResult['entries'] = [];

  for (const e of entries) {
    const objectType = e.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
    const result = await upsertCandidateSignal(
      db,
      {
        objectType,
        objectId: e.thesisId,
        objectTitle: e.thesisTitle,
        statement: e.statement,
        sourceUrl: e.sourceUrl ?? null,
        observedAt: e.observedAt || new Date().toISOString(),
        fromReport: 'relate-bookmark',
        rationale: e.rationale ?? null,
        extra: { origin: 'bookmark', significance: e.significance, bookmarkNodeId: e.bookmarkNodeId },
      },
      opts,
    );

    if (result === 'written' || result === 'would-write') written++;
    else if (result === 'bumped' || result === 'would-bump') bumped++;
    else skipped++;

    out.push({ bookmarkNodeId: e.bookmarkNodeId, thesisId: e.thesisId, statement: e.statement, result });
  }

  return { written, bumped, skipped, entries: out };
}
