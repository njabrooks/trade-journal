#!/usr/bin/env tsx
/**
 * Raise `re_underwrite_due` decisions — the unified producer for the re-underwrite
 * channel (docs/v2/15 §6; docs/v2/09 §8). Gathers BOTH triggers and merges them into
 * ONE packet per thesis (§6.1 — never two re-underwrite decisions for the same thesis):
 *   - claim-delta   (src/lib/derived/reunderwriteDue.ts) — accumulated new claims / a
 *     new refuting claim since the last articulation. Developing OR monitoring.
 *   - signal-quality (src/lib/derived/signalQualityDiagnostics.ts) — chronic-neutral
 *     signals and/or a price coverage-gap. Monitoring only.
 *
 * Both resolve the same way (`/thesis <X>` re-underwrite), so they share the type and
 * differ only by `evidence_context.triggers`. Deduped per object exactly like
 * raise-decision.ts (§8.2): an existing active decision for the thesis is bumped, not
 * duplicated — so re-runs heal. (A packet already active is left as-is; a newly-added
 * trigger lands on the next clean raise after the user resolves the current one.)
 *
 * Read-only by default — prints what it WOULD raise. Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/ops/raise-reunderwrite-decisions.ts            # preview (dry-run)
 *   npx tsx scripts/ops/raise-reunderwrite-decisions.ts --apply    # raise/bump packets
 *   npx tsx scripts/ops/raise-reunderwrite-decisions.ts --json
 */
import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { and, eq } from 'drizzle-orm';
import { buildDecisionPacket, type RelatedObject } from '@/lib/types/decisions';
import { findThesesDueForReunderwrite } from '@/lib/derived/reunderwriteDue';
import { computeSignalQualityDiagnostics, type ThesisSignalQuality } from '@/lib/derived/signalQualityDiagnostics';

const { journalEntries } = schema;

interface MergedDue {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  claimDelta?: { reason: string; claimsDelta: number; newRefutes: number; lastVersion: number };
  signalQuality?: Pick<ThesisSignalQuality, 'reason' | 'chronicNeutralSignals' | 'coverageGaps'>;
}

function objectTypeOf(t: 'macro' | 'asset'): 'macro_thesis' | 'asset_thesis' {
  return t === 'macro' ? 'macro_thesis' : 'asset_thesis';
}

/** Gather both triggers and merge per thesis (keyed by type:id). */
async function gatherMerged(): Promise<MergedDue[]> {
  const claim = await findThesesDueForReunderwrite();
  const sq = (await computeSignalQualityDiagnostics()).filter((t) => t.reunderwriteTrigger);

  const merged = new Map<string, MergedDue>();
  for (const c of claim) {
    merged.set(`${c.thesisType}:${c.thesisId}`, {
      thesisId: c.thesisId, thesisType: c.thesisType, title: c.title,
      claimDelta: { reason: c.reason, claimsDelta: c.claimsDelta, newRefutes: c.newRefutes, lastVersion: c.lastVersion },
    });
  }
  for (const t of sq) {
    const key = `${t.thesisType}:${t.thesisId}`;
    const existing = merged.get(key);
    const signalQuality = { reason: t.reason, chronicNeutralSignals: t.chronicNeutralSignals, coverageGaps: t.coverageGaps };
    if (existing) existing.signalQuality = signalQuality;
    else merged.set(key, { thesisId: t.thesisId, thesisType: t.thesisType, title: t.title, signalQuality });
  }
  return [...merged.values()];
}

function buildPacketFor(m: MergedDue) {
  const triggers: string[] = [];
  const reasons: string[] = [];
  if (m.claimDelta) { triggers.push('claim_delta'); reasons.push(m.claimDelta.reason); }
  if (m.signalQuality) { triggers.push('signal_quality'); reasons.push(m.signalQuality.reason); }

  // Weak signals become related objects so the re-underwrite knows which to sharpen/drop.
  const related: RelatedObject[] = (m.signalQuality?.chronicNeutralSignals ?? []).map((s) => ({
    type: 'signal', id: s.signalId, title: s.statement.slice(0, 80), role: 'weak_signal',
  }));

  const strong = (m.signalQuality?.coverageGaps?.length ?? 0) > 0 || (m.claimDelta?.newRefutes ?? 0) > 0;

  return buildDecisionPacket({
    decision_type: 're_underwrite_due',
    why_raised: reasons.join('; '),
    related_objects: related,
    evidence_context: {
      triggers,
      ...(m.claimDelta ? { claimDelta: m.claimDelta } : {}),
      ...(m.signalQuality ? {
        signalQuality: {
          reason: m.signalQuality.reason,
          chronicNeutralSignals: m.signalQuality.chronicNeutralSignals.map((s) => ({
            signalId: s.signalId, statement: s.statement, observedCount: s.observedCount,
            nonNeutralCount: s.nonNeutralCount, verdict: s.verdict,
          })),
          coverageGaps: m.signalQuality.coverageGaps,
        },
      } : {}),
    },
    recommended_actions: [
      { action: 're_underwrite', label: `Re-underwrite via /thesis ${m.title}` },
      { action: 'dismiss_tactical', label: 'Dismiss — not worth re-underwriting now' },
    ],
    default_recommendation: { action: 're_underwrite', confidence: strong ? 'high' : 'medium' },
  });
}

/** Dedup-or-insert, mirroring raise-decision.ts §8.2 (one active decision per object). */
async function raiseOrBump(m: MergedDue, title: string, apply: boolean): Promise<'insert' | 'bump'> {
  const existing = await db
    .select({ id: journalEntries.id, occ: journalEntries.occurrenceCount })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.objectId, m.thesisId),
      eq(journalEntries.actionType, 'decision_required'),
      eq(journalEntries.status, 'active'),
    ))
    .limit(1);

  if (existing.length > 0) {
    if (apply) {
      await db.update(journalEntries)
        .set({ lastSeenAt: new Date(), occurrenceCount: (existing[0].occ ?? 1) + 1 })
        .where(eq(journalEntries.id, existing[0].id));
    }
    return 'bump';
  }
  if (apply) {
    await logToJournal({
      objectType: objectTypeOf(m.thesisType),
      objectId: m.thesisId,
      objectTitle: m.title,
      actionType: 'decision_required',
      actionDescription: title,
      rationale: buildPacketFor(m).why_raised,
      source: 'automation',
      metadata: { decision: buildPacketFor(m) },
    });
  }
  return 'insert';
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const asJson = argv.includes('--json');

  const merged = await gatherMerged();
  const results: Array<{ title: string; thesisType: string; triggers: string[]; disposition: string }> = [];

  for (const m of merged) {
    const triggers = [m.claimDelta && 'claim_delta', m.signalQuality && 'signal_quality'].filter(Boolean) as string[];
    const short = m.signalQuality && m.claimDelta ? 'signal set weak + new evidence'
      : m.signalQuality ? 'signal set weak' : 'new evidence since last version';
    const title = `Re-underwrite ${m.title} — ${short}`;
    const disposition = await raiseOrBump(m, title, apply);
    results.push({ title: m.title, thesisType: m.thesisType, triggers, disposition });
  }

  const inserted = results.filter((r) => r.disposition === 'insert').length;
  const bumped = results.filter((r) => r.disposition === 'bump').length;

  if (asJson) {
    console.log(JSON.stringify({ applied: apply, dueCount: merged.length, inserted, bumped, results }, null, 2));
  } else {
    console.log(`\nre_underwrite_due — ${merged.length} due thesis(es) ${apply ? '(APPLIED)' : '(dry-run; pass --apply to write)'}`);
    for (const r of results) {
      const verb = apply ? (r.disposition === 'insert' ? 'raised' : 'bumped') : (r.disposition === 'insert' ? 'would raise' : 'would bump (active exists)');
      console.log(`  [${r.thesisType}] ${r.title} — ${verb} (${r.triggers.join(' + ')})`);
    }
    console.log(apply ? `\n${inserted} raised, ${bumped} bumped.\n` : `\n${inserted} new, ${bumped} already active.\n`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
