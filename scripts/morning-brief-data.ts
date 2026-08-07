#!/usr/bin/env tsx
/**
 * morning-brief-data — deterministic assembly for the morning brief (docs/v2/20 §A3).
 *
 * Gathers everything "what deserves my attention today" needs into ONE JSON bundle so
 * the /morning-brief skill reads a single surface (the relate-research worksheet
 * pattern: deterministic gather here, judgment in the skill). READ-ONLY — no writes.
 *
 * Sections:
 *   producerFreshness  — explicit status/timestamp for each required upstream producer
 *   navDelta            — day-over-day NAV + gross exposure (portfolio_snapshots, account level)
 *   overnightEvidence   — signal evidence last 24h (signal_data_snapshots, data_source
 *                         thesis_observe/price_watch), grouped by thesis, thesis-centric polarity
 *   openDecisions       — reuse of scripts/ops/list-decisions.ts --json (ages included)
 *   advisor             — active, unexpired advisor_recommendations
 *   sizingFindings      — A1 engine (src/lib/derived/sizingCoherence.ts) over live expression
 *   executionPatterns   — reuse of scripts/ops/execution-patterns.ts --json (A2)
 *   calendar            — next-48h economic + earnings events for held tickers (the orphaned
 *                         src/db/queries/{economicEvents,earningsEvents} modules' consumer)
 *
 * Usage: npx tsx scripts/morning-brief-data.ts --json   (from repo root; self-loads .env.local)
 */
// scripts/lib/db loads dotenv at import time — it MUST come before '@/db' (which creates
// its client from env at module eval). ESM evaluates imports in declaration order.
import { closeDb } from './lib/db.js';
import { db } from '@/db';
import {
  advisorRecommendations,
  assetTheses,
  assetThesisRelatedMacroTheses,
  macroTheses,
  portfolioSnapshots,
  positions,
  signalDataSnapshots,
  signalEntityLinks,
  signals,
  strategies,
  underlyings,
} from '@/db/schema';
import { and, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { getUpcomingEconomicEvents } from '@/db/queries/economicEvents';
import { getUpcomingEarnings } from '@/db/queries/earningsEvents';
import {
  computeSizingFindings,
  type SizingInputs,
  UNDER_PCT,
  OVER_PCT,
} from '@/lib/derived/sizingCoherence';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMorningBriefProducerFreshness } from '../capabilities/morning-attention-brief/evaluate-inputs.js';

const num = (v: string | number | null | undefined): number | null =>
  v == null ? null : Number(v);

/** Today's date in the owner's timezone — the brief_date key. */
function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

/** Run a sibling ops script and parse its --json output (deterministic reuse, no forked logic). */
function runJsonScript(script: string): unknown {
  const out = execFileSync('npx', ['tsx', script, '--json'], {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf('{')));
}

// --- NAV / exposure delta (day-over-day, account-level portfolio snapshots) ---
// Accounts snapshot on different cadences (IBKR hourly weekdays, crypto every 4h), so a
// naive latest-date sum reads low mid-ingestion. Instead: current NAV = Σ each account's
// OWN latest snapshot; delta = Σ (latest − prior) over accounts that have both.
async function gatherNavDelta() {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      accountId: portfolioSnapshots.accountId,
      date: portfolioSnapshots.snapshotDate,
      navUsd: sql<string>`COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot})`,
      exposureUsd: portfolioSnapshots.totalAbsNotionalUsd,
    })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.level, 'account'), gte(portfolioSnapshots.snapshotDate, since)))
    .orderBy(portfolioSnapshots.accountId, sql`${portfolioSnapshots.snapshotDate} DESC`);

  interface Snap { date: string; nav: number | null; exposure: number | null }
  const byAccount = new Map<string, Snap[]>();
  for (const r of rows) {
    (byAccount.get(r.accountId) ?? byAccount.set(r.accountId, []).get(r.accountId)!).push({
      date: r.date,
      nav: num(r.navUsd),
      exposure: num(r.exposureUsd),
    });
  }

  let latestNav = 0;
  let latestExposure = 0;
  let deltaUsd = 0;
  let accountsWithDelta = 0;
  let latestDate: string | null = null;
  let priorDate: string | null = null;
  let priorNavMatched = 0;
  for (const snaps of byAccount.values()) {
    const [latest, prior] = snaps; // ordered DESC per account
    if (!latest) continue;
    latestNav += latest.nav ?? 0;
    latestExposure += latest.exposure ?? 0;
    if (!latestDate || latest.date > latestDate) latestDate = latest.date;
    if (prior && latest.nav != null && prior.nav != null) {
      deltaUsd += latest.nav - prior.nav;
      priorNavMatched += prior.nav;
      accountsWithDelta++;
      if (!priorDate || prior.date > priorDate) priorDate = prior.date;
    }
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    latestDate,
    latestNavUsd: round2(latestNav),
    latestExposureUsd: round2(latestExposure),
    accountCount: byAccount.size,
    // Overnight change, matched per-account (each account's latest vs its prior snapshot day)
    priorDate,
    deltaUsd: accountsWithDelta > 0 ? round2(deltaUsd) : null,
    deltaPct: priorNavMatched !== 0 ? round2((deltaUsd / Math.abs(priorNavMatched)) * 100) : null,
    accountsWithDelta,
  };
}

// --- Overnight signal evidence (last 24h, observe/price-watch producers) ---
async function gatherOvernightEvidence() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await db
    .select({
      signalId: signals.id,
      statement: signals.statement,
      signalType: signals.type,
      assessment: signalDataSnapshots.assessment,
      evidenceSummary: signalDataSnapshots.evidenceSummary,
      dataSource: signalDataSnapshots.dataSource,
      snapshotAt: signalDataSnapshots.createdAt,
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
    })
    .from(signalDataSnapshots)
    .innerJoin(signals, eq(signalDataSnapshots.signalId, signals.id))
    .innerJoin(
      signalEntityLinks,
      and(eq(signalEntityLinks.signalId, signals.id), isNotNull(signalEntityLinks.thesisId))
    )
    .where(
      and(
        gte(signalDataSnapshots.createdAt, since),
        inArray(signalDataSnapshots.dataSource, ['thesis_observe', 'price_watch'])
      )
    );

  // Resolve thesis titles
  const macroIds = [...new Set(rows.filter((r) => r.thesisType === 'macro').map((r) => r.thesisId!))];
  const assetIds = [...new Set(rows.filter((r) => r.thesisType === 'asset').map((r) => r.thesisId!))];
  const titles = new Map<string, string>();
  if (macroIds.length > 0) {
    for (const t of await db.select({ id: macroTheses.id, title: macroTheses.title }).from(macroTheses).where(inArray(macroTheses.id, macroIds)))
      titles.set(`macro:${t.id}`, t.title);
  }
  if (assetIds.length > 0) {
    for (const t of await db.select({ id: assetTheses.id, title: assetTheses.title }).from(assetTheses).where(inArray(assetTheses.id, assetIds)))
      titles.set(`asset:${t.id}`, t.title);
  }

  const byThesis = new Map<string, {
    thesisId: string;
    thesisType: string;
    thesisTitle: string;
    nonNeutralCount: number;
    items: Array<{ signalStatement: string; signalType: string; assessment: string | null; evidenceSummary: string | null; dataSource: string; snapshotAt: Date | null }>;
  }>();
  for (const r of rows) {
    const key = `${r.thesisType}:${r.thesisId}`;
    let g = byThesis.get(key);
    if (!g) {
      g = {
        thesisId: r.thesisId!,
        thesisType: r.thesisType ?? 'unknown',
        thesisTitle: titles.get(key) ?? r.thesisId!,
        nonNeutralCount: 0,
        items: [],
      };
      byThesis.set(key, g);
    }
    if (r.assessment && r.assessment !== 'neutral') g.nonNeutralCount++;
    g.items.push({
      signalStatement: r.statement,
      signalType: r.signalType,
      // assessment is THESIS-centric: strengthening = the thesis got stronger.
      assessment: r.assessment,
      evidenceSummary: r.evidenceSummary ? r.evidenceSummary.slice(0, 400) : null,
      dataSource: r.dataSource,
      snapshotAt: r.snapshotAt,
    });
  }

  // Non-neutral theses first, most evidence first.
  return [...byThesis.values()].sort(
    (a, b) => b.nonNeutralCount - a.nonNeutralCount || b.items.length - a.items.length
  );
}

// --- Active advisor recommendations ---
async function gatherAdvisor() {
  const rows = await db
    .select({
      id: advisorRecommendations.id,
      scenario: advisorRecommendations.scenario,
      ticker: advisorRecommendations.ticker,
      exposureUsd: advisorRecommendations.exposureUsd,
      pctNav: advisorRecommendations.pctNav,
      structure: advisorRecommendations.structure,
      metrics: advisorRecommendations.metrics,
      rationale: advisorRecommendations.rationale,
      createdAt: advisorRecommendations.createdAt,
      expiresAt: advisorRecommendations.expiresAt,
    })
    .from(advisorRecommendations)
    .where(
      and(
        eq(advisorRecommendations.status, 'active'),
        or(sql`${advisorRecommendations.expiresAt} IS NULL`, gte(advisorRecommendations.expiresAt, new Date()))
      )
    )
    .orderBy(advisorRecommendations.scenario, advisorRecommendations.ticker);

  return rows.map((r) => ({
    ...r,
    exposureUsd: num(r.exposureUsd),
    pctNav: num(r.pctNav),
    rationale: r.rationale.slice(0, 400),
    structureType: (r.structure as { type?: string } | null)?.type ?? null,
  }));
}

// --- A1 sizing-coherence inputs (live expression per active thesis) ---
async function gatherSizingFindings(navUsd: number | null) {
  // Net Σ market_value_usd of open positions, grouped by the strategy's asset thesis.
  // positions holds DAILY SNAPSHOT rows — restrict to each account's latest snapshot_date
  // (same pattern as src/db/queries/portfolio.ts) or every prior day double-counts.
  const exposures = await db
    .select({
      assetThesisId: strategies.assetThesisId,
      expressionUsd: sql<string>`SUM(${positions.marketValueUsd})`,
    })
    .from(positions)
    .innerJoin(strategies, eq(positions.strategyId, strategies.id))
    .where(
      and(
        eq(positions.isOpen, true),
        isNotNull(strategies.assetThesisId),
        sql`${positions.snapshotDate} = (
          SELECT MAX(p2.snapshot_date) FROM positions p2 WHERE p2.account_id = ${positions.accountId}
        )`
      )
    )
    .groupBy(strategies.assetThesisId);
  const exposureByThesis = new Map(exposures.map((e) => [e.assetThesisId!, num(e.expressionUsd) ?? 0]));

  const activeAssets = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      ticker: underlyings.ticker,
      confidenceLevel: assetTheses.confidenceLevel,
      direction: assetTheses.direction,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(assetTheses.status, ['developing', 'monitoring']));

  const activeMacros = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      confidenceLevel: macroTheses.confidenceLevel,
      direction: macroTheses.direction,
    })
    .from(macroTheses)
    .where(inArray(macroTheses.status, ['developing', 'monitoring']));

  const links = activeMacros.length
    ? await db
        .select({
          macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
          assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
        })
        .from(assetThesisRelatedMacroTheses)
        .where(inArray(assetThesisRelatedMacroTheses.macroThesisId, activeMacros.map((m) => m.id)))
    : [];
  const linksByMacro = new Map<string, string[]>();
  for (const l of links) {
    (linksByMacro.get(l.macroThesisId) ?? linksByMacro.set(l.macroThesisId, []).get(l.macroThesisId)!).push(l.assetThesisId);
  }

  const inputs: SizingInputs = {
    navUsd: navUsd ?? 0,
    assetTheses: activeAssets.map((a) => ({
      thesisId: a.id,
      title: a.title,
      ticker: a.ticker,
      confidenceLevel: a.confidenceLevel,
      direction: a.direction,
      expressionUsd: exposureByThesis.get(a.id) ?? 0,
    })),
    macroTheses: activeMacros.map((m) => ({
      thesisId: m.id,
      title: m.title,
      confidenceLevel: m.confidenceLevel,
      direction: m.direction,
      linkedAssetThesisIds: linksByMacro.get(m.id) ?? [],
    })),
  };

  return {
    thresholds: { UNDER_PCT, OVER_PCT },
    findings: computeSizingFindings(inputs),
  };
}

// --- Next-48h calendar for held tickers ---
async function gatherCalendar() {
  // Same latest-snapshot-per-account rule as the sizing loader — an exited ticker's
  // older snapshot rows still carry is_open=true for their date.
  const held = await db
    .selectDistinct({ ticker: underlyings.ticker })
    .from(positions)
    .innerJoin(underlyings, eq(positions.underlyingId, underlyings.id))
    .where(
      and(
        eq(positions.isOpen, true),
        sql`${positions.snapshotDate} = (
          SELECT MAX(p2.snapshot_date) FROM positions p2 WHERE p2.account_id = ${positions.accountId}
        )`
      )
    );
  const heldTickers = new Set(held.map((h) => h.ticker));

  const [economic, earnings] = await Promise.all([
    getUpcomingEconomicEvents(2),
    getUpcomingEarnings(2),
  ]);

  return {
    heldTickers: [...heldTickers].sort(),
    // Economic events are country-level, not ticker-scoped — keep the market movers.
    economicEvents: economic
      .filter((e) => e.impact === 'high' || e.impact === 'medium')
      .slice(0, 20),
    earningsEvents: earnings.filter((e) => heldTickers.has(e.ticker)),
  };
}

// Latest regime read per source (docs/v2/21 Phase 1: radon CRI + VCG via
// scripts/ingest-regime-scan.ts, 07:40 run lands before this bundle). Stale
// snapshots (>24h) are flagged, not hidden — a dead feed should be visible.
async function gatherRegime() {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (source) source, scan_time, band, score, components
    FROM regime_snapshots
    ORDER BY source, scan_time DESC
  `);
  const now = Date.now();
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => {
    const scanTime = new Date(String(r.scan_time));
    const components = r.components as Record<string, unknown>;
    const prior = components?.crash_trigger as Record<string, unknown> | undefined;
    return {
      source: String(r.source), // 'cri' | 'vcg'
      band: String(r.band), // CRI: LOW/ELEVATED/HIGH/CRITICAL · VCG: NORMAL/…
      score: r.score !== null ? Number(r.score) : null,
      scanTime: scanTime.toISOString(),
      staleHours: Math.round((now - scanTime.getTime()) / 3600_000),
      stale: now - scanTime.getTime() > 24 * 3600_000,
      // CRI extras the brief may cite directly
      ...(String(r.source) === 'cri'
        ? {
            vix: components?.vix ?? null,
            crashTriggered: (prior?.triggered as boolean) ?? null,
            ctaForcedSellingBn: (components?.cta as Record<string, unknown>)?.est_selling_bn ?? null,
          }
        : { regime: (components?.regime as string) ?? null }),
    };
  });
}

async function main() {
  const navDelta = await gatherNavDelta();
  const [overnightEvidence, advisor, sizing, calendar, regime] = await Promise.all([
    gatherOvernightEvidence(),
    gatherAdvisor(),
    gatherSizingFindings(navDelta.latestNavUsd),
    gatherCalendar(),
    gatherRegime(),
  ]);

  // Deterministic reuse of the sibling --json surfaces (each runs in its own process).
  const openDecisions = runJsonScript('scripts/ops/list-decisions.ts');
  const executionPatterns = runJsonScript('scripts/ops/execution-patterns.ts');
  const generatedAt = new Date().toISOString();
  const cronStatusPath = resolve(process.cwd(), 'logs/cron-status.tsv');
  const cronStatusTsv = existsSync(cronStatusPath)
    ? readFileSync(cronStatusPath, 'utf8')
    : '';
  const producerFreshness = buildMorningBriefProducerFreshness({
    generatedAt,
    cronStatusTsv,
    portfolioObservedAt: navDelta.latestDate
      ? `${navDelta.latestDate}T00:00:00Z`
      : null,
    decisionsObservedAt: generatedAt,
    calendarObservedAt: generatedAt,
  });

  const bundle = {
    generatedAt,
    briefDate: londonToday(),
    producerFreshness,
    navDelta,
    regime,
    overnightEvidence,
    openDecisions,
    advisor,
    sizing,
    executionPatterns,
    calendar,
  };

  console.log(JSON.stringify(bundle, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
