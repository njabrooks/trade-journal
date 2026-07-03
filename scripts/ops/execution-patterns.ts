#!/usr/bin/env tsx
/**
 * execution-patterns — the execution-pattern coach's deterministic layer (docs/v2/20 §A2).
 *
 * Read-only aggregation over episode retrospectives (`thesis_expression_episodes` +
 * retrospectiveMetrics, the 07§4d execution-quality fields) — counts, medians, worst
 * instances per recurring behavioural pattern. No new tables; computed on read. The
 * morning brief's judgment layer turns this into at most one nudge line when relevant.
 *
 * Patterns (v1 definitions — all derivable from data we already store):
 *   - give_back: closed episodes that peaked in profit and gave most of it back
 *     (captureRatio < GIVE_BACK_CAPTURE_MAX with a peak ≥ GIVE_BACK_MIN_PEAK_USD).
 *   - early_exit: closed episodes where the SAME thesis re-expressed within
 *     REENTRY_WINDOW_DAYS — the "sold, then bought back" signature.
 *   - expression_before_conviction: episodes opened before the thesis had ANY
 *     articulation version (expressed before underwritten).
 *
 * Usage:
 *   npx tsx scripts/ops/execution-patterns.ts          # human summary
 *   npx tsx scripts/ops/execution-patterns.ts --json   # structured (morning-brief-data consumes this)
 */
import { closeDb, db, schema } from '../lib/db.js';
import { asc, inArray, sql } from 'drizzle-orm';

const { thesisExpressionEpisodes, thesisArticulations, macroTheses, assetTheses } = schema;

/** A give-back instance requires the peak to have been real money, not noise. */
export const GIVE_BACK_MIN_PEAK_USD = 1_000;
/** Below this capture ratio (final / peak), a profitable episode counts as give-back. */
export const GIVE_BACK_CAPTURE_MAX = 0.5;
/** Re-expression within this many days of an episode close reads as an early exit. */
export const REENTRY_WINDOW_DAYS = 60;

interface RetroMetrics {
  mfe?: number | null;
  finalCumulative?: number | null;
  captureRatio?: number | null;
  giveBackFromPeak?: number | null;
  executionQuality?: string | null;
  confidence?: string | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 100) / 100;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

async function main() {
  const json = process.argv.includes('--json');

  const episodes = await db
    .select()
    .from(thesisExpressionEpisodes)
    .orderBy(
      asc(thesisExpressionEpisodes.thesisId),
      asc(thesisExpressionEpisodes.thesisType),
      asc(thesisExpressionEpisodes.episodeNo)
    );

  // Thesis titles for readable instances.
  const macroIds = [...new Set(episodes.filter((e) => e.thesisType === 'macro').map((e) => e.thesisId))];
  const assetIds = [...new Set(episodes.filter((e) => e.thesisType === 'asset').map((e) => e.thesisId))];
  const titleByKey = new Map<string, string>();
  if (macroIds.length > 0) {
    const rows = await db.select({ id: macroTheses.id, title: macroTheses.title }).from(macroTheses).where(inArray(macroTheses.id, macroIds));
    for (const r of rows) titleByKey.set(`macro:${r.id}`, r.title);
  }
  if (assetIds.length > 0) {
    const rows = await db.select({ id: assetTheses.id, title: assetTheses.title }).from(assetTheses).where(inArray(assetTheses.id, assetIds));
    for (const r of rows) titleByKey.set(`asset:${r.id}`, r.title);
  }
  const titleOf = (e: { thesisId: string; thesisType: string }) =>
    titleByKey.get(`${e.thesisType}:${e.thesisId}`) ?? e.thesisId;

  // First articulation per thesis — the "conviction exists in writing" timestamp.
  const firstArticulations = await db
    .select({
      thesisId: thesisArticulations.thesisId,
      thesisType: thesisArticulations.thesisType,
      firstAt: sql<string>`MIN(${thesisArticulations.createdAt})`,
    })
    .from(thesisArticulations)
    .groupBy(thesisArticulations.thesisId, thesisArticulations.thesisType);
  const firstArticulationByKey = new Map(
    firstArticulations.map((a) => [`${a.thesisType}:${a.thesisId}`, new Date(a.firstAt)])
  );

  const closed = episodes.filter((e) => e.closedAt !== null);
  const withMetrics = closed.filter((e) => e.retrospectiveMetrics != null);

  // --- Pattern 1: give-back (peaked in profit, captured little of it) ---
  const giveBackInstances = withMetrics
    .map((e) => ({ e, m: e.retrospectiveMetrics as RetroMetrics }))
    .filter(
      ({ m }) =>
        typeof m.giveBackFromPeak === 'number' &&
        m.giveBackFromPeak > 0 &&
        typeof m.captureRatio === 'number' &&
        m.captureRatio < GIVE_BACK_CAPTURE_MAX &&
        typeof m.mfe === 'number' &&
        m.mfe >= GIVE_BACK_MIN_PEAK_USD
    )
    .map(({ e, m }) => ({
      thesisId: e.thesisId,
      thesisType: e.thesisType,
      thesisTitle: titleOf(e),
      episodeNo: e.episodeNo,
      closedAt: e.closedAt,
      mfe: m.mfe ?? null,
      finalCumulative: m.finalCumulative ?? null,
      giveBackFromPeak: m.giveBackFromPeak ?? null,
      captureRatio: m.captureRatio ?? null,
      executionQuality: m.executionQuality ?? e.executionQuality ?? null,
    }))
    .sort((a, b) => (b.giveBackFromPeak ?? 0) - (a.giveBackFromPeak ?? 0));

  // --- Pattern 2: early exit (closed, then re-expressed within the window) ---
  const earlyExitInstances: Array<{
    thesisId: string;
    thesisType: string;
    thesisTitle: string;
    episodeNo: number;
    closedAt: Date;
    reopenedAt: Date;
    gapDays: number;
  }> = [];
  for (const e of closed) {
    const next = episodes.find(
      (n) => n.thesisId === e.thesisId && n.thesisType === e.thesisType && n.episodeNo === e.episodeNo + 1
    );
    if (!next || !e.closedAt) continue;
    const gapDays = daysBetween(new Date(e.closedAt), new Date(next.openedAt));
    if (gapDays >= 0 && gapDays <= REENTRY_WINDOW_DAYS) {
      earlyExitInstances.push({
        thesisId: e.thesisId,
        thesisType: e.thesisType,
        thesisTitle: titleOf(e),
        episodeNo: e.episodeNo,
        closedAt: new Date(e.closedAt),
        reopenedAt: new Date(next.openedAt),
        gapDays,
      });
    }
  }
  earlyExitInstances.sort((a, b) => a.gapDays - b.gapDays);

  // --- Pattern 3: expression before conviction (opened before any articulation) ---
  const ebcInstances = episodes
    .filter((e) => {
      const firstAt = firstArticulationByKey.get(`${e.thesisType}:${e.thesisId}`);
      return !firstAt || new Date(e.openedAt) < firstAt;
    })
    .map((e) => {
      const firstAt = firstArticulationByKey.get(`${e.thesisType}:${e.thesisId}`) ?? null;
      return {
        thesisId: e.thesisId,
        thesisType: e.thesisType,
        thesisTitle: titleOf(e),
        episodeNo: e.episodeNo,
        openedAt: e.openedAt,
        firstArticulationAt: firstAt,
        daysToArticulation: firstAt ? daysBetween(new Date(e.openedAt), firstAt) : null,
        neverUnderwritten: firstAt === null,
      };
    })
    .sort((a, b) => (b.daysToArticulation ?? Number.MAX_SAFE_INTEGER) - (a.daysToArticulation ?? Number.MAX_SAFE_INTEGER));

  const result = {
    generatedAt: new Date().toISOString(),
    thresholds: { GIVE_BACK_MIN_PEAK_USD, GIVE_BACK_CAPTURE_MAX, REENTRY_WINDOW_DAYS },
    universe: {
      episodes: episodes.length,
      closedEpisodes: closed.length,
      closedWithRetrospective: withMetrics.length,
      openEpisodes: episodes.length - closed.length,
    },
    patterns: {
      giveBack: {
        count: giveBackInstances.length,
        of: withMetrics.length,
        medianGiveBackUsd: median(giveBackInstances.map((i) => i.giveBackFromPeak ?? 0)),
        worst: giveBackInstances[0] ?? null,
        instances: giveBackInstances.slice(0, 10),
      },
      earlyExit: {
        count: earlyExitInstances.length,
        of: closed.length,
        medianGapDays: median(earlyExitInstances.map((i) => i.gapDays)),
        worst: earlyExitInstances[0] ?? null,
        instances: earlyExitInstances.slice(0, 10),
      },
      expressionBeforeConviction: {
        count: ebcInstances.length,
        of: episodes.length,
        neverUnderwritten: ebcInstances.filter((i) => i.neverUnderwritten).length,
        instances: ebcInstances.slice(0, 10),
      },
    },
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const { universe, patterns } = result;
    console.log(`\n=== Execution patterns (${universe.closedEpisodes} closed episodes, ${universe.closedWithRetrospective} with retrospective) ===`);
    console.log(
      `\n• Give-back: ${patterns.giveBack.count}/${patterns.giveBack.of} retrospected episodes captured < ${GIVE_BACK_CAPTURE_MAX * 100}% of their peak` +
        (patterns.giveBack.medianGiveBackUsd != null ? ` (median give-back $${patterns.giveBack.medianGiveBackUsd})` : '')
    );
    if (patterns.giveBack.worst) {
      const w = patterns.giveBack.worst;
      console.log(`    worst: ${w.thesisTitle} ep${w.episodeNo} — peaked $${w.mfe}, closed $${w.finalCumulative} (gave back $${w.giveBackFromPeak})`);
    }
    console.log(
      `\n• Early exit: ${patterns.earlyExit.count}/${patterns.earlyExit.of} closed episodes re-expressed within ${REENTRY_WINDOW_DAYS}d` +
        (patterns.earlyExit.medianGapDays != null ? ` (median gap ${patterns.earlyExit.medianGapDays}d)` : '')
    );
    for (const i of patterns.earlyExit.instances.slice(0, 3)) {
      console.log(`    ${i.thesisTitle} ep${i.episodeNo} — reopened after ${i.gapDays}d`);
    }
    console.log(
      `\n• Expression before conviction: ${patterns.expressionBeforeConviction.count}/${patterns.expressionBeforeConviction.of} episodes opened before any articulation existed` +
        ` (${patterns.expressionBeforeConviction.neverUnderwritten} never underwritten)`
    );
    console.log('');
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
