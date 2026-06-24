#!/usr/bin/env tsx
/**
 * Candidate-signal consumer (docs/v2/16 §1b — the Lane B side of the shared contract).
 *
 * Lane A's observe surface PROPOSES coverage-hole signals as journal rows
 * (`action_type='candidate_signal'`, `status='active'`, `metadata.candidateSignal =
 * { statement, sourceUrl, observedAt, fromReport, rationale }`). Lane B's
 * observation-driven re-underwrite (build-core-argument) READS them, promotes the
 * genuinely load-bearing ones into real signals via the articulation it writes, and then
 * marks each consumed row `resolved` (promoted) or `dismissed` (rejected) so it stops
 * resurfacing. This script is that read + close-out.
 *
 * It reads candidate rows directly from the journal (not via thesis-snapshot) so it works
 * regardless of whether Lane A has wired its thesis-snapshot.candidateSignals surface yet —
 * the journal-row shape (§1b) is the contract both honor.
 *
 * Modes:
 *   --list --thesis-id <id> [--type asset|macro]     active candidate rows for a thesis (JSON)
 *   --list --all                                     every active candidate row (JSON)
 *   --resolve <journalId> [--signal-id <newSignalId>]  promoted → 'resolved'
 *   --dismiss <journalId> [--reason "..."]             rejected → 'dismissed'
 *
 * Requires env sourced. Import order: ../lib/db.js loads dotenv before @/db resolves.
 */
import { db, closeDb, schema } from '../lib/db.js';
import { and, eq, desc } from 'drizzle-orm';

const { journalEntries } = schema;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2).replace(/-/g, '_');
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { a[k] = n; i++; } else { a[k] = true; }
    }
  }
  return a;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CandidateMeta {
  statement?: string;
  sourceUrl?: string;
  observedAt?: string;
  fromReport?: string;
  rationale?: string;
}

function shape(row: { id: string; objectId: string; objectType: string; objectTitle: string | null; actionDescription: string; metadata: unknown; status: string | null; firstDetectedAt: Date | null }) {
  const cs = ((row.metadata as { candidateSignal?: CandidateMeta } | null)?.candidateSignal) ?? {};
  return {
    id: row.id,
    thesisId: row.objectId,
    thesisType: row.objectType === 'macro_thesis' ? 'macro' : 'asset',
    thesisTitle: row.objectTitle,
    statement: cs.statement ?? row.actionDescription,
    sourceUrl: cs.sourceUrl ?? null,
    observedAt: cs.observedAt ?? (row.firstDetectedAt ? row.firstDetectedAt.toISOString() : null),
    fromReport: cs.fromReport ?? null,
    rationale: cs.rationale ?? null,
    status: row.status,
  };
}

async function list(args: Record<string, string | boolean>) {
  const conds = [eq(journalEntries.actionType, 'candidate_signal'), eq(journalEntries.status, 'active')];
  if (!args.all) {
    const thesisId = args.thesis_id as string;
    if (!thesisId || !UUID_RE.test(thesisId)) {
      console.error('--list requires --thesis-id <uuid> (or --all)');
      process.exit(1);
    }
    conds.push(eq(journalEntries.objectId, thesisId));
  }
  const rows = await db
    .select({
      id: journalEntries.id, objectId: journalEntries.objectId, objectType: journalEntries.objectType,
      objectTitle: journalEntries.objectTitle, actionDescription: journalEntries.actionDescription,
      metadata: journalEntries.metadata, status: journalEntries.status, firstDetectedAt: journalEntries.firstDetectedAt,
    })
    .from(journalEntries)
    .where(and(...conds))
    .orderBy(desc(journalEntries.firstDetectedAt));
  console.log(JSON.stringify({ count: rows.length, candidates: rows.map(shape) }, null, 2));
}

/** Merge-update a candidate row's status + metadata. Idempotent + validates the row is a candidate. */
async function closeOut(journalId: string, nextStatus: 'resolved' | 'dismissed', extraMeta: Record<string, unknown>) {
  if (!UUID_RE.test(journalId)) { console.error(`Invalid journal id: ${journalId}`); process.exit(1); }
  const [row] = await db
    .select({ id: journalEntries.id, actionType: journalEntries.actionType, status: journalEntries.status, metadata: journalEntries.metadata })
    .from(journalEntries)
    .where(eq(journalEntries.id, journalId))
    .limit(1);
  if (!row) { console.error(`No journal entry ${journalId}`); process.exit(1); }
  if (row.actionType !== 'candidate_signal') { console.error(`Journal entry ${journalId} is '${row.actionType}', not 'candidate_signal'`); process.exit(1); }
  if (row.status === nextStatus) {
    console.log(JSON.stringify({ id: journalId, status: nextStatus, changed: false, note: 'already in target status' }, null, 2));
    return;
  }
  const mergedMeta = { ...((row.metadata as Record<string, unknown>) ?? {}), ...extraMeta };
  await db
    .update(journalEntries)
    .set({ status: nextStatus, metadata: mergedMeta, lastSeenAt: new Date() })
    .where(eq(journalEntries.id, journalId));
  console.log(JSON.stringify({ id: journalId, status: nextStatus, changed: true, previousStatus: row.status }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await list(args);
  } else if (args.resolve) {
    const id = (args.resolve === true ? (args.id as string) : (args.resolve as string));
    await closeOut(id, 'resolved', {
      promotedToSignalId: (args.signal_id as string) ?? null,
      resolvedAt: new Date().toISOString(),
      resolvedBy: '/build-core-argument',
    });
  } else if (args.dismiss) {
    const id = (args.dismiss === true ? (args.id as string) : (args.dismiss as string));
    await closeOut(id, 'dismissed', {
      dismissReason: (args.reason as string) ?? 'not load-bearing on re-underwrite',
      dismissedAt: new Date().toISOString(),
      dismissedBy: '/build-core-argument',
    });
  } else {
    console.error('Usage: --list (--thesis-id <id> | --all) | --resolve <journalId> [--signal-id <id>] | --dismiss <journalId> [--reason "..."]');
    process.exit(1);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
