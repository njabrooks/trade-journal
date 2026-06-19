#!/usr/bin/env tsx
/**
 * Raise a DecisionStrip item — the generic, deduped writer for the "needs decision"
 * strip (docs/v2/09 §8). Claude review jobs (relate-research, /thesis-review modes,
 * strategy auto-link) call this to surface a genuine decision to the user.
 *
 * Writes a journal entry with action_type='decision_required' (status 'active', which
 * the strip surfaces). When a `decision_type` is supplied it also writes the full
 * **decision packet** to `journal_entries.metadata.decision` (the v2 contract — see
 * src/lib/types/decisions.ts). Without one it stays backward-compatible: a bare
 * title/rationale row, no packet (legacy callers are untouched until C4 upgrades them).
 *
 * Deduped per object: if an active decision_required already exists for the object it
 * is NOT re-inserted — instead lastSeenAt/occurrenceCount are bumped (docs/v2/09 §8.2),
 * keeping the strip (hard-capped at 5) free of duplicates.
 *
 * Usage:
 *   # legacy / bare:
 *   npx tsx scripts/ops/raise-decision.ts --object-type asset_thesis --id <uuid> \
 *     --title "Live position on X, thin thesis" --description "Sources to develop it: ..."
 *   # typed packet (scalars via flags, arrays/context via --stdin):
 *   npx tsx scripts/ops/raise-decision.ts --object-type asset_thesis --id <uuid> \
 *     --title "..." --decision-type develop_thin_thesis --why "position before research"
 *   echo '{"objectType":"asset_thesis","objectId":"<uuid>","title":"...","decisionType":"develop_thin_thesis",
 *          "relatedObjects":[{"type":"strategy","id":"<uuid>","role":"expression"}],
 *          "recommendedActions":[{"action":"capture_sources","label":"Capture via /tana-inbox"}]}' \
 *     | npx tsx scripts/ops/raise-decision.ts --stdin
 *   # preview without writing:
 *   ... --dry-run
 */
import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { and, eq } from 'drizzle-orm';
import {
  buildDecisionPacket,
  isDecisionType,
  type DecisionPacket,
  type DecisionType,
  type RelatedObject,
  type RecommendedAction,
  type DecisionConfidence,
} from '@/lib/types/decisions';

const { journalEntries } = schema;

interface Input {
  objectType: string; // 'macro_thesis' | 'asset_thesis' | 'strategy' | 'claim' | 'signal' | ...
  objectId: string;
  objectTitle?: string;
  title: string; // the decision headline (action_description)
  description?: string; // rationale / detail
  source?: 'automation' | 'skill' | 'user';
  // --- decision packet (optional; when decisionType is set the envelope is written) ---
  decisionType?: DecisionType;
  relatedObjects?: RelatedObject[];
  whyRaised?: string;
  evidenceContext?: Record<string, unknown>;
  recommendedActions?: RecommendedAction[];
  agentRunbook?: string;
  defaultRecommendation?: { action: string; confidence: DecisionConfidence };
  dryRun?: boolean;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2).replace(/-/g, '');
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { a[k] = n; i++; } else { a[k] = true; }
    }
  }
  return a;
}

async function readInput(): Promise<Input> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  if (argv.includes('--stdin')) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Input;
    return { ...parsed, dryRun: parsed.dryRun ?? dryRun };
  }
  const a = parseArgs(argv);
  return {
    objectType: a.objecttype as string,
    objectId: a.id as string,
    objectTitle: a.objecttitle as string | undefined,
    title: a.title as string,
    description: a.description as string | undefined,
    source: (a.source as Input['source']) || 'automation',
    decisionType: a.decisiontype as DecisionType | undefined,
    whyRaised: a.why as string | undefined,
    agentRunbook: a.runbook as string | undefined,
    defaultRecommendation: a.defaultaction
      ? { action: a.defaultaction as string, confidence: (a.defaultconfidence as DecisionConfidence) || 'medium' }
      : undefined,
    dryRun,
  };
}

/** Build the decision packet envelope, or undefined for a bare/legacy decision. */
function buildPacket(input: Input): DecisionPacket | undefined {
  if (!input.decisionType) return undefined;
  if (!isDecisionType(input.decisionType)) {
    throw new Error(`Unknown decision_type: ${input.decisionType}`);
  }
  return buildDecisionPacket({
    decision_type: input.decisionType,
    why_raised: input.whyRaised ?? input.description ?? input.title,
    related_objects: input.relatedObjects,
    evidence_context: input.evidenceContext,
    recommended_actions: input.recommendedActions,
    agent_runbook: input.agentRunbook,
    default_recommendation: input.defaultRecommendation,
  });
}

async function main() {
  const input = await readInput();
  if (!input.objectType || !input.objectId || !input.title) {
    console.error('Required: objectType, objectId (--id), title');
    process.exit(1);
  }

  const packet = buildPacket(input);
  const metadata = packet ? { decision: packet } : undefined;

  const existing = await db
    .select({ id: journalEntries.id, occurrenceCount: journalEntries.occurrenceCount })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.objectId, input.objectId),
      eq(journalEntries.actionType, 'decision_required'),
      eq(journalEntries.status, 'active'),
    ))
    .limit(1);

  const dedup = existing.length > 0 ? 'bump' : 'insert';

  if (input.dryRun) {
    console.log(JSON.stringify({ dryRun: true, wouldRaise: dedup === 'insert', dedup, metadata: metadata ?? null }, null, 2));
    await closeDb();
    process.exit(0);
  }

  if (dedup === 'bump') {
    // An active decision already exists for this object — bump its dedup counters
    // rather than inserting a duplicate (docs/v2/09 §8.2). Packet left as-is.
    const next = (existing[0].occurrenceCount ?? 1) + 1;
    await db
      .update(journalEntries)
      .set({ lastSeenAt: new Date(), occurrenceCount: next })
      .where(eq(journalEntries.id, existing[0].id));
    console.log(JSON.stringify({ raised: false, bumped: true, existingId: existing[0].id, occurrenceCount: next }, null, 2));
    await closeDb();
    process.exit(0);
  }

  const id = await logToJournal({
    objectType: input.objectType,
    objectId: input.objectId,
    objectTitle: input.objectTitle,
    actionType: 'decision_required',
    actionDescription: input.title,
    rationale: input.description,
    source: input.source ?? 'automation',
    metadata,
  });

  console.log(JSON.stringify({ raised: true, journalEntryId: id, decisionType: packet?.decision_type ?? null }, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
