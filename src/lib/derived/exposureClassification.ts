/**
 * classify_exposure detection + raise — DB layer (C5b — docs/v2/09 §7).
 *
 *   1. findUnclassifiedExposures — auto-created placeholder theses, above a size bar,
 *      not yet classified (the position→backfill ambiguity: belief or tactical hedge?).
 *   2. raiseExposureDecision — raise the classify_exposure decision (deterministic;
 *      no agent judgment is needed to *ask*). Deduped per thesis.
 *
 * Notional uses strategy_metrics_snapshots.total_abs_notional (latest snapshot per
 * strategy) — NOT raw positions, whose is_open freezes on exit (the B0 gotcha).
 */
import { db } from '@/db';
import { assetTheses, underlyings, strategies, strategyMetricsSnapshots, journalEntries } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';
import { buildDecisionPacket } from '@/lib/types/decisions';
import { needsExposureClassification, DEFAULT_EXPOSURE_BAR_USD } from '@/lib/derived/exposureClassificationRules';

export { DEFAULT_EXPOSURE_BAR_USD } from '@/lib/derived/exposureClassificationRules';

const ACTIVE = ['developing', 'monitoring'] as const;

export interface ExposureItem {
  thesisId: string;
  title: string;
  ticker: string | null;
  status: string;
  notionalUsd: number;
  strategyId: string | null;
  strategyKey: string | null;
}

/** Auto-created placeholder asset thesis ids (notes marker ∪ creation-journal fallback). */
async function placeholderThesisIds(): Promise<string[]> {
  const marker = await db
    .select({ id: assetTheses.id })
    .from(assetTheses)
    .where(sql`${assetTheses.notes}->>'auto_placeholder' = 'true'`);
  const journaled = await db
    .selectDistinct({ id: journalEntries.objectId })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.objectType, 'asset_thesis'),
      eq(journalEntries.actionType, 'created'),
      sql`${journalEntries.actionDescription} LIKE 'Placeholder asset thesis auto-created%'`,
    ));
  return Array.from(new Set([...marker.map((r) => r.id), ...journaled.map((r) => r.id)]));
}

export async function findUnclassifiedExposures(minNotionalUsd = DEFAULT_EXPOSURE_BAR_USD): Promise<ExposureItem[]> {
  const phIds = await placeholderThesisIds();
  if (phIds.length === 0) return [];

  const theses = await db
    .select({ id: assetTheses.id, title: assetTheses.title, status: assetTheses.status, ticker: underlyings.ticker })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(and(inArray(assetTheses.id, phIds), inArray(assetTheses.status, [...ACTIVE])));
  if (theses.length === 0) return [];
  const thesisIds = theses.map((t) => t.id);

  // strategies attached to these placeholder theses
  const strat = await db
    .select({ id: strategies.id, key: strategies.strategyKey, thesisId: strategies.assetThesisId })
    .from(strategies)
    .where(inArray(strategies.assetThesisId, thesisIds));
  const stratIds = strat.map((s) => s.id);

  // latest total_abs_notional per strategy (most recent snapshot_date)
  const notionalByStrategy = new Map<string, number>();
  if (stratIds.length) {
    const mrows = await db
      .select({ strategyId: strategyMetricsSnapshots.strategyId, notional: strategyMetricsSnapshots.totalAbsNotional, date: strategyMetricsSnapshots.snapshotDate })
      .from(strategyMetricsSnapshots)
      .where(inArray(strategyMetricsSnapshots.strategyId, stratIds));
    const latest = new Map<string, { date: string; notional: number }>();
    for (const r of mrows) {
      const cur = latest.get(r.strategyId);
      const d = r.date ?? '';
      if (!cur || d > cur.date) latest.set(r.strategyId, { date: d, notional: Number(r.notional ?? 0) });
    }
    for (const [k, v] of latest) notionalByStrategy.set(k, v.notional);
  }

  // theses that already carry a classify_exposure decision (ANY status) — don't re-ask
  const classifiedRows = await db
    .select({ id: journalEntries.objectId })
    .from(journalEntries)
    .where(and(
      inArray(journalEntries.objectId, thesisIds),
      sql`${journalEntries.metadata}->'decision'->>'decision_type' = 'classify_exposure'`,
    ));
  const classified = new Set(classifiedRows.map((r) => r.id));

  const items: ExposureItem[] = [];
  for (const t of theses) {
    const tStrats = strat.filter((s) => s.thesisId === t.id);
    const notionalUsd = tStrats.reduce((a, s) => a + (notionalByStrategy.get(s.id) ?? 0), 0);
    const primary = tStrats[0] ?? null;
    if (needsExposureClassification({ isPlaceholder: true, status: t.status, notionalUsd, alreadyClassified: classified.has(t.id), minNotionalUsd })) {
      items.push({ thesisId: t.id, title: t.title, ticker: t.ticker, status: t.status, notionalUsd, strategyId: primary?.id ?? null, strategyKey: primary?.key ?? null });
    }
  }
  items.sort((a, b) => Math.abs(b.notionalUsd) - Math.abs(a.notionalUsd));
  return items;
}

/** Raise the classify_exposure decision for one placeholder (deduped per thesis). */
export async function raiseExposureDecision(item: ExposureItem, opts: { dryRun?: boolean } = {}): Promise<'raised' | 'exists' | 'would-raise'> {
  const existing = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.objectId, item.thesisId),
      eq(journalEntries.actionType, 'decision_required'),
      eq(journalEntries.status, 'active'),
    ))
    .limit(1);
  if (existing.length) return 'exists';
  if (opts.dryRun) return 'would-raise';

  const notionalLabel = `$${Math.round(Math.abs(item.notionalUsd)).toLocaleString('en-US')}`;
  await logToJournal({
    objectType: 'asset_thesis',
    objectId: item.thesisId,
    objectTitle: item.title,
    actionType: 'decision_required',
    actionDescription: `${item.ticker ?? item.title}: belief to develop, or tactical hedge? (~${notionalLabel} live)`,
    source: 'automation',
    metadata: {
      decision: buildDecisionPacket({
        decision_type: 'classify_exposure',
        why_raised: `Placeholder thesis auto-created for live exposure ${item.ticker ?? ''} (~${notionalLabel}). Classify it so it's developed as a belief or marked tactical (and the placeholder rejected).`,
        related_objects: item.strategyId ? [{ type: 'strategy', id: item.strategyId, title: item.strategyKey ?? undefined, role: 'expression' }] : [],
        evidence_context: { notionalUsd: item.notionalUsd, ticker: item.ticker },
        recommended_actions: [
          { action: 'thesis_backed', label: 'Belief — keep & develop' },
          { action: 'tactical', label: 'Tactical/hedge — mark & reject placeholder' },
        ],
        default_recommendation: { action: 'thesis_backed', confidence: 'low' },
      }),
    },
  });
  return 'raised';
}
