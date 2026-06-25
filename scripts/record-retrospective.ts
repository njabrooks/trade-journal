#!/usr/bin/env tsx
/**
 * Record a thesis retrospective (W8 — docs/v2/07 §4d, B7).
 *
 * Called by the thesis-review skill (retrospective mode) after it writes the
 * "was I right, did it pay" narrative. Deterministically:
 *   - appends a journal entry (action_type='retrospective') with the narrative;
 *   - sets the thesis outcome / outcome_notes (surfaced by the W5 RetrospectiveCard)
 *     and actual_outcome_date (if unset);
 *   - supersedes any still-active signals → 'complete' (monitoring is over).
 *
 * Idempotent-ish: findThesesNeedingRetrospective excludes theses that already have a
 * retrospective journal entry, so this won't normally double-write.
 *
 * Input JSON (stdin or --input <file>):
 * {
 *   "thesisId": "...", "thesisType": "macro|asset",
 *   "outcome": "validated|invalidated|partial",   // optional
 *   "headline": "Right and it paid — +$X over Nd",  // journal action_description
 *   "narrative": "..."                              // full was-I-right writeup → outcome_notes + rationale
 * }
 */
import * as fs from 'fs';
import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { and, eq, inArray, desc, isNull, isNotNull } from 'drizzle-orm';

const { macroTheses, assetTheses, signals: signalsTable, signalEntityLinks, thesisExpressionEpisodes } = schema;

interface Input {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  /** Which expression episode this retrospective is for (from the worklist). Defaults to the
   *  latest closed episode still awaiting one. (docs/v2/13 §2 — episodic performance.) */
  episodeNo?: number;
  outcome?: string;
  headline: string;
  narrative: string;
  /** True exit date (from the gathered context's closedAt) — used to set actual_outcome_date if unset. NOT defaulted to today. */
  closedDate?: string;
  /** Execution-quality judgment (docs/v2/07 §4d): 'excellent' | 'good' | 'fair' | 'poor'. */
  executionQuality?: string;
  /** The computed excursion object from the gathered context (MFE/MAE/capture/etc.) — frozen into retrospective_metrics. */
  excursion?: Record<string, unknown>;
}

async function readInput(): Promise<Input> {
  const argv = process.argv.slice(2);
  const fileIdx = argv.indexOf('--input');
  if (fileIdx !== -1) return JSON.parse(fs.readFileSync(argv[fileIdx + 1], 'utf-8'));
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function main() {
  const input = await readInput();
  const { thesisId, thesisType, headline, narrative } = input;
  if (!thesisId || !thesisType || !headline || !narrative) {
    console.error('Required: thesisId, thesisType, headline, narrative');
    process.exit(1);
  }
  const thesisTable = thesisType === 'macro' ? macroTheses : assetTheses;
  const objectType = thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
  const [thesis] = await db
    .select({ title: thesisTable.title, actualOutcomeDate: thesisTable.actualOutcomeDate, status: thesisTable.status })
    .from(thesisTable)
    .where(eq(thesisTable.id, thesisId))
    .limit(1);
  if (!thesis) { console.error(`Thesis not found: ${thesisType}/${thesisId}`); process.exit(1); }

  const now = new Date();

  // 1. Set outcome / outcome_notes / actual_outcome_date.
  // Use the true exit date (closedDate, derived from the P&L series) — never "today",
  // which would misdate a thesis that exited weeks ago.
  const set: Record<string, unknown> = { outcomeNotes: narrative, updatedAt: now };
  if (input.outcome) set.outcome = input.outcome;
  if (!thesis.actualOutcomeDate && input.closedDate) set.actualOutcomeDate = input.closedDate.slice(0, 10);
  // Freeze the two-axis execution metrics (docs/v2/07 §4d): the excursion numbers
  // (computed by the gathered context) + the executionQuality judgment.
  if (input.excursion || input.executionQuality) {
    set.retrospectiveMetrics = {
      ...(input.excursion ?? {}),
      executionQuality: input.executionQuality ?? null,
    };
  }
  await db.update(thesisTable).set(set).where(eq(thesisTable.id, thesisId));

  // 2. Supersede still-active signals → 'complete' (monitoring is over).
  const activeSignals = await db
    .select({ id: signalsTable.id })
    .from(signalsTable)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signalsTable.id))
    .where(and(eq(signalEntityLinks.thesisId, thesisId), eq(signalEntityLinks.thesisType, thesisType), eq(signalsTable.status, 'active')));
  let supersededSignals = 0;
  if (activeSignals.length > 0) {
    const ids = activeSignals.map((s) => s.id);
    await db.update(signalsTable).set({ status: 'complete', updatedAt: now }).where(inArray(signalsTable.id, ids));
    supersededSignals = ids.length;
  }

  // 3. Append the retrospective journal entry.
  const journalId = await logToJournal({
    objectType,
    objectId: thesisId,
    objectTitle: thesis.title,
    actionType: 'retrospective',
    actionDescription: headline,
    rationale: narrative,
    skillInvoked: '/thesis-review',
    newState: { outcome: input.outcome ?? null, executionQuality: input.executionQuality ?? null, supersededSignals },
    source: 'automation',
  });

  // 4. Record the per-episode retrospective on the expression episode (docs/v2/13 §2).
  // Resolve the episode: the input's episodeNo, else the latest closed episode still awaiting one.
  let episodeNo = input.episodeNo ?? null;
  if (episodeNo == null) {
    const [ep] = await db
      .select({ episodeNo: thesisExpressionEpisodes.episodeNo })
      .from(thesisExpressionEpisodes)
      .where(and(
        eq(thesisExpressionEpisodes.thesisId, thesisId),
        eq(thesisExpressionEpisodes.thesisType, thesisType),
        isNotNull(thesisExpressionEpisodes.closedAt),
        isNull(thesisExpressionEpisodes.retrospectiveAt),
      ))
      .orderBy(desc(thesisExpressionEpisodes.closedAt))
      .limit(1);
    episodeNo = ep?.episodeNo ?? null;
  }
  let episodeRecorded = false;
  if (episodeNo != null) {
    const epSet: Record<string, unknown> = { outcomeNotes: narrative, retrospectiveAt: now, updatedAt: now };
    if (input.outcome) epSet.outcome = input.outcome;
    if (input.executionQuality) epSet.executionQuality = input.executionQuality;
    if (input.excursion || input.executionQuality) {
      epSet.retrospectiveMetrics = { ...(input.excursion ?? {}), executionQuality: input.executionQuality ?? null };
    }
    await db
      .update(thesisExpressionEpisodes)
      .set(epSet)
      .where(and(
        eq(thesisExpressionEpisodes.thesisId, thesisId),
        eq(thesisExpressionEpisodes.thesisType, thesisType),
        eq(thesisExpressionEpisodes.episodeNo, episodeNo),
      ));
    episodeRecorded = true;
  }

  console.log(JSON.stringify({ thesis: thesis.title, status: thesis.status, outcome: input.outcome ?? null, executionQuality: input.executionQuality ?? null, episodeNo, episodeRecorded, supersededSignals, journalId }, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
