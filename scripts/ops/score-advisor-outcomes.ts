#!/usr/bin/env tsx
/**
 * score-advisor-outcomes — Lane C (docs/v2/20), the advisor arm of the
 * execution-quality retrospective (07§4d).
 *
 * Two maintenance passes over advisor_recommendations:
 *   1. Expiry flip: status 'active' with expires_at in the past → 'expired'.
 *      Today recommendations expire into silence; the acted/expired/dismissed
 *      tally is exactly the data that says whether the advisor has edge.
 *   2. Outcome scoring: acted recs whose structure has expired and whose
 *      `outcome` is still null get scored — entry net premium (at the quoted
 *      mids) vs intrinsic value at expiry spot (underlyings_iv_history, nearest
 *      as_of_date within ±5 days of expiry, preferring on-or-before). Frozen
 *      into `outcome` jsonb. Recs whose expiry has no spot yet are skipped and
 *      retried on the next run.
 *
 * Runs daily from the signal-day-synthesis GH workflow; safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/ops/score-advisor-outcomes.ts             # apply
 *   npx tsx scripts/ops/score-advisor-outcomes.ts --dry-run   # report only
 *   npx tsx scripts/ops/score-advisor-outcomes.ts --json      # structured output
 */
import { closeDb, db, schema } from '../lib/db.js';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import {
  scoreAdvisorOutcome,
  structureExpiry,
  type AdvisorStructure,
} from '../../src/lib/derived/advisorOutcome';

const { advisorRecommendations, underlyingsIvHistory } = schema;

/** How far from expiry a spot observation may be and still settle the score. */
const SPOT_TOLERANCE_DAYS = 5;

interface ScoredRow {
  id: string;
  ticker: string;
  scenario: string;
  expiry: string;
  spotAtExpiry: number;
  spotDate: string;
  realizedPnlPerShare: number;
  win: boolean;
}

/** Nearest spot to `expiry` within ±tolerance, preferring on-or-before. */
async function spotNearExpiry(
  ticker: string,
  expiry: string
): Promise<{ spot: number; spotDate: string } | null> {
  const rows = await db
    .select({
      asOfDate: underlyingsIvHistory.asOfDate,
      spot: underlyingsIvHistory.spot,
    })
    .from(underlyingsIvHistory)
    .where(
      and(
        eq(underlyingsIvHistory.ticker, ticker.toUpperCase()),
        sql`${underlyingsIvHistory.asOfDate} BETWEEN ${expiry}::date - ${SPOT_TOLERANCE_DAYS}::int AND ${expiry}::date + ${SPOT_TOLERANCE_DAYS}::int`,
        sql`${underlyingsIvHistory.spot} IS NOT NULL`
      )
    );

  let best: { spot: number; spotDate: string } | null = null;
  let bestRank = Infinity;
  for (const r of rows) {
    const spot = Number(r.spot);
    if (!Number.isFinite(spot) || spot <= 0) continue;
    const diffDays =
      (new Date(r.asOfDate).getTime() - new Date(expiry).getTime()) / 86_400_000;
    // on-or-before wins over after at equal distance
    const rank = Math.abs(diffDays) * 2 + (diffDays > 0 ? 1 : 0);
    if (rank < bestRank) {
      bestRank = rank;
      best = { spot, spotDate: r.asOfDate };
    }
  }
  return best;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const asJson = process.argv.includes('--json');
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Pass 1 — flip lapsed actives to expired
  let expiredCount = 0;
  if (dryRun) {
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(advisorRecommendations)
      .where(
        and(eq(advisorRecommendations.status, 'active'), lte(advisorRecommendations.expiresAt, now))
      );
    expiredCount = Number(c?.n ?? 0);
  } else {
    const flipped = await db
      .update(advisorRecommendations)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(eq(advisorRecommendations.status, 'active'), lte(advisorRecommendations.expiresAt, now))
      )
      .returning({ id: advisorRecommendations.id });
    expiredCount = flipped.length;
  }

  // Pass 2 — score acted recs whose structure has settled
  const due = await db
    .select({
      id: advisorRecommendations.id,
      ticker: advisorRecommendations.ticker,
      scenario: advisorRecommendations.scenario,
      structure: advisorRecommendations.structure,
    })
    .from(advisorRecommendations)
    .where(
      and(eq(advisorRecommendations.status, 'acted'), isNull(advisorRecommendations.outcome))
    );

  const scored: ScoredRow[] = [];
  const waiting: { id: string; ticker: string; expiry: string; reason: string }[] = [];

  for (const rec of due) {
    const structure = rec.structure as AdvisorStructure;
    const expiry = structureExpiry(structure);
    if (!expiry) {
      waiting.push({ id: rec.id, ticker: rec.ticker, expiry: '?', reason: 'no leg expiry in structure' });
      continue;
    }
    if (expiry > today) continue; // not settled yet — not part of the worklist

    const spot = await spotNearExpiry(rec.ticker, expiry);
    if (!spot) {
      waiting.push({ id: rec.id, ticker: rec.ticker, expiry, reason: 'no spot near expiry yet' });
      continue;
    }

    const outcome = scoreAdvisorOutcome(structure, spot.spot, spot.spotDate, now.toISOString());
    if (!outcome) {
      waiting.push({ id: rec.id, ticker: rec.ticker, expiry, reason: 'unscorable structure' });
      continue;
    }

    if (!dryRun) {
      await db
        .update(advisorRecommendations)
        .set({ outcome, updatedAt: now })
        .where(eq(advisorRecommendations.id, rec.id));
    }
    scored.push({
      id: rec.id,
      ticker: rec.ticker,
      scenario: rec.scenario,
      expiry,
      spotAtExpiry: outcome.spotAtExpiry,
      spotDate: outcome.spotDate,
      realizedPnlPerShare: outcome.realizedPnlPerShare,
      win: outcome.win,
    });
  }

  if (asJson) {
    console.log(JSON.stringify({ dryRun, expiredCount, scored, waiting }, null, 2));
  } else {
    console.log(`${dryRun ? '[dry-run] ' : ''}expired: ${expiredCount} lapsed active rec(s)`);
    console.log(`scored: ${scored.length} acted rec(s)`);
    for (const s of scored) {
      console.log(
        `  ${s.ticker} ${s.scenario} exp ${s.expiry} — spot ${s.spotAtExpiry} (${s.spotDate}) → ${s.realizedPnlPerShare >= 0 ? '+' : ''}${s.realizedPnlPerShare}/share ${s.win ? 'WIN' : 'LOSS'}`
      );
    }
    for (const w of waiting) {
      console.log(`  waiting: ${w.ticker} exp ${w.expiry} — ${w.reason}`);
    }
  }

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('score-advisor-outcomes failed:', err);
  await closeDb();
  process.exit(1);
});
