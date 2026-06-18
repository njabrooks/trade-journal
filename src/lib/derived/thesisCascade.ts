/**
 * Deterministic thesis lifecycle cascade (W8 — docs/v2/07 §3, build step B2).
 *
 * Expression-driven monitoring: a thesis is `monitoring` iff it has live
 * expression (an active strategy — directly for an asset thesis, or via a linked
 * asset thesis for a macro). Signals are no longer the promotion gate; they
 * become an artifact of being in monitoring (B5). This module derives asset and
 * macro thesis status purely from strategy status and propagates upward. It runs
 * after the strategy-status recompute settles (B0), inside the post-ingestion
 * recompute path.
 *
 * Pure, idempotent, flap-safe: it reads the current global picture and only
 * writes / journals genuine transitions. Re-running it within a run is a no-op,
 * which is why it is safe to fire from the per-account recompute hook even though
 * the cascade itself is global.
 *
 * Scope: only theses already in the cascade-managed set {developing, monitoring,
 * closed} are touched. draft / active (legacy) / complete / rejected are
 * judgment states and are left alone.
 *
 * The pure status derivations live in ./thesisCascadeRules (DB-free, unit-tested);
 * this file is the DB orchestration that applies them.
 */
import { db } from '@/db';
import { assetTheses, macroTheses, strategies, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';
import {
  CASCADE_ELIGIBLE,
  deriveAssetThesisStatus,
  deriveMacroThesisStatus,
  type CascadeStatus,
} from '@/lib/derived/thesisCascadeRules';

export {
  CASCADE_ELIGIBLE,
  deriveAssetThesisStatus,
  deriveMacroThesisStatus,
} from '@/lib/derived/thesisCascadeRules';
export type {
  CascadeStatus,
  AssetThesisStatusInputs,
  MacroThesisStatusInputs,
} from '@/lib/derived/thesisCascadeRules';

// ---------------------------------------------------------------------------
// DB orchestration
// ---------------------------------------------------------------------------

export interface CascadeTransition {
  level: 'asset' | 'macro';
  id: string;
  title: string;
  from: string;
  to: CascadeStatus;
  reason: string;
}

export interface CascadeOptions {
  /** Compute transitions without writing them or logging to journal. */
  dryRun?: boolean;
  /** Journal source attribution (default 'automation'). */
  source?: 'automation' | 'user' | 'skill';
}

export interface CascadeResult {
  dryRun: boolean;
  transitions: CascadeTransition[];
  /** Cascade-eligible asset theses examined. */
  assetCount: number;
  /** Cascade-eligible macro theses examined. */
  macroCount: number;
}

function assetReason(to: CascadeStatus): string {
  return to === 'monitoring'
    ? 'active strategy attached — thesis has live expression'
    : to === 'closed'
      ? 'no active strategy — expression fully closed out'
      : 'no live expression yet';
}

function macroReason(to: CascadeStatus): string {
  return to === 'monitoring'
    ? 'a linked asset thesis is live (monitoring)'
    : to === 'closed'
      ? 'all linked asset theses have closed out'
      : 'no linked asset thesis is live yet';
}

async function logTransition(
  objectType: 'asset_thesis' | 'macro_thesis',
  id: string,
  title: string,
  from: string,
  to: CascadeStatus,
  reason: string,
  source: 'automation' | 'user' | 'skill',
): Promise<void> {
  await logToJournal({
    objectType,
    objectId: id,
    objectTitle: title,
    actionType: 'status_change',
    actionDescription: `Lifecycle cascade: ${from} → ${to} (${reason})`,
    previousState: { status: from },
    newState: { status: to },
    rationale: reason,
    source,
  });
}

/**
 * Run the deterministic asset→macro lifecycle cascade across all cascade-eligible
 * theses. Order: assets first (from strategy status), then macros (from the
 * freshly-derived asset statuses). Idempotent — only genuine transitions are
 * written and journaled.
 */
export async function cascadeThesisStatuses(opts: CascadeOptions = {}): Promise<CascadeResult> {
  const dryRun = opts.dryRun ?? false;
  const source = opts.source ?? 'automation';
  const transitions: CascadeTransition[] = [];

  // --- Asset theses: derive from active strategy count ---
  const assetRows = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      status: assetTheses.status,
      activeStrategies: sql<number>`count(${strategies.id}) filter (where ${strategies.status} = 'active')`,
    })
    .from(assetTheses)
    .leftJoin(strategies, eq(strategies.assetThesisId, assetTheses.id))
    .where(inArray(assetTheses.status, CASCADE_ELIGIBLE))
    .groupBy(assetTheses.id, assetTheses.title, assetTheses.status);

  // Effective (post-cascade) status per asset thesis, consumed by the macro pass.
  const effectiveAssetStatus = new Map<string, string>();

  for (const a of assetRows) {
    const target = deriveAssetThesisStatus({
      current: a.status,
      activeStrategyCount: Number(a.activeStrategies ?? 0),
    });
    effectiveAssetStatus.set(a.id, target ?? a.status);

    if (target && target !== a.status) {
      const reason = assetReason(target);
      transitions.push({ level: 'asset', id: a.id, title: a.title, from: a.status, to: target, reason });
      if (!dryRun) {
        await db.update(assetTheses).set({ status: target, updatedAt: new Date() }).where(eq(assetTheses.id, a.id));
        await logTransition('asset_thesis', a.id, a.title, a.status, target, reason, source);
      }
    }
  }

  // --- Macro theses: derive from linked asset thesis statuses ---
  const macroRows = await db
    .select({ id: macroTheses.id, title: macroTheses.title, status: macroTheses.status })
    .from(macroTheses)
    .where(inArray(macroTheses.status, CASCADE_ELIGIBLE));

  // For every macro→asset link, is the (effective) asset status monitoring?
  // Prefer the freshly-derived status for cascade-eligible assets; fall back to
  // the link's own DB status for non-eligible ones (complete/rejected — never
  // monitoring, so they cannot keep a macro alive).
  const links = await db
    .select({
      macroId: assetThesisRelatedMacroTheses.macroThesisId,
      assetId: assetThesisRelatedMacroTheses.assetThesisId,
      assetStatus: assetTheses.status,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId));

  const monitoringByMacro = new Map<string, boolean>();
  for (const l of links) {
    const eff = effectiveAssetStatus.get(l.assetId) ?? l.assetStatus;
    if (eff === 'monitoring') monitoringByMacro.set(l.macroId, true);
  }

  for (const m of macroRows) {
    const target = deriveMacroThesisStatus({
      current: m.status,
      anyLinkedAssetMonitoring: monitoringByMacro.get(m.id) ?? false,
    });
    if (target && target !== m.status) {
      const reason = macroReason(target);
      transitions.push({ level: 'macro', id: m.id, title: m.title, from: m.status, to: target, reason });
      if (!dryRun) {
        await db.update(macroTheses).set({ status: target, updatedAt: new Date() }).where(eq(macroTheses.id, m.id));
        await logTransition('macro_thesis', m.id, m.title, m.status, target, reason, source);
      }
    }
  }

  return { dryRun, transitions, assetCount: assetRows.length, macroCount: macroRows.length };
}
