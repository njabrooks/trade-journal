#!/usr/bin/env tsx
/**
 * Record a thesis-health pass result (W8 — docs/v2/07 §4c, B5c).
 *
 * Called by the thesis-review skill (health mode) after it renders per-signal
 * verdicts. Enforces the change-only + decision-only policy deterministically:
 *   - writes a `thesis_health` signal_data_snapshot ONLY for verdicts flagged
 *     materialChange (verdict differs from the signal's last health verdict);
 *   - ALWAYS stamps thesis.last_reviewed_at so the cadence advances even when
 *     nothing changed (a quiet thesis records no snapshot but is marked reviewed);
 *   - raises a DecisionStrip item (journal action_type='decision_required') ONLY
 *     when `decision` is provided (weakening/invalidation), and dedupes against an
 *     existing active decision for the thesis.
 *
 * Input JSON (stdin or --input <file>):
 * {
 *   "thesisId": "...", "thesisType": "macro|asset",
 *   "verdicts": [
 *     { "signalId": "...", "assessment": "strengthening|confirmed|neutral|weakening|invalidated",
 *       "evidenceSummary": "...", "materialChange": true }
 *   ],
 *   "decision": { "title": "...", "description": "..." }   // optional
 * }
 */
import * as fs from 'fs';
import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { and, eq } from 'drizzle-orm';

const { signalDataSnapshots, journalEntries, macroTheses, assetTheses } = schema;

interface Verdict {
  signalId: string;
  assessment: string;
  evidenceSummary?: string;
  materialChange?: boolean;
}
interface Input {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  verdicts: Verdict[];
  decision?: { title: string; description: string };
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
  const { thesisId, thesisType, verdicts } = input;
  if (!thesisId || !thesisType || !Array.isArray(verdicts)) {
    console.error('Required: thesisId, thesisType, verdicts[]');
    process.exit(1);
  }
  const thesisTable = thesisType === 'macro' ? macroTheses : assetTheses;
  const objectType = thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
  const [thesis] = await db.select({ title: thesisTable.title }).from(thesisTable).where(eq(thesisTable.id, thesisId)).limit(1);
  if (!thesis) { console.error(`Thesis not found: ${thesisType}/${thesisId}`); process.exit(1); }

  const now = new Date();

  // 1. Material-change snapshots only.
  const changed = verdicts.filter((v) => v.materialChange);
  if (changed.length > 0) {
    await db.insert(signalDataSnapshots).values(
      changed.map((v) => ({
        signalId: v.signalId,
        snapshotDate: now,
        assessment: v.assessment,
        evidenceSummary: v.evidenceSummary ?? null,
        dataSource: 'thesis_health',
        status: 'active',
      })),
    );
  }

  // 2. Always advance the review clock (cadence marker; preserves change-only).
  await db.update(thesisTable).set({ lastReviewedAt: now, updatedAt: now }).where(eq(thesisTable.id, thesisId));

  // 3. Thesis-level health summary to the journal (audit trail; not a decision).
  const counts = verdicts.reduce<Record<string, number>>((a, v) => { a[v.assessment] = (a[v.assessment] ?? 0) + 1; return a; }, {});
  const summary = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ');
  await logToJournal({
    objectType, objectId: thesisId, objectTitle: thesis.title,
    actionType: 'thesis_health_check',
    actionDescription: `Health pass: ${verdicts.length} signal(s) re-assessed (${summary || 'no verdicts'}); ${changed.length} material change(s)`,
    skillInvoked: '/thesis-review',
    source: 'automation',
  });

  // 4. DecisionStrip item only on weakening/invalidation, deduped.
  let decisionRaised = false;
  if (input.decision) {
    const existing = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.objectId, thesisId), eq(journalEntries.actionType, 'decision_required'), eq(journalEntries.status, 'active')))
      .limit(1);
    if (existing.length === 0) {
      await logToJournal({
        objectType, objectId: thesisId, objectTitle: thesis.title,
        actionType: 'decision_required',
        actionDescription: input.decision.title,
        rationale: input.decision.description,
        skillInvoked: '/thesis-review',
        source: 'automation',
      });
      decisionRaised = true;
    }
  }

  console.log(JSON.stringify({
    thesis: thesis.title,
    signalsAssessed: verdicts.length,
    snapshotsWritten: changed.length,
    decisionRaised,
    decisionSkippedExisting: !!input.decision && !decisionRaised,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
