#!/usr/bin/env tsx

/**
 * Thesis snapshot — read-only data surface for the /thesis conversational skill (D3).
 *
 * Gathers a thesis's *living underwriting* state in one JSON blob so the skill reads a
 * single surface instead of issuing six queries. Mirrors the relate-research worksheet
 * pattern: deterministic data-gather here, judgment in the skill. READ-ONLY — no writes.
 *
 * Resolves a thesis by --id (+ optional --type), --ticker (asset), or --title (ILIKE,
 * both layers), then assembles: latest articulation (the three faces) + version history,
 * active signals (the resolution section) grouped by type, linked claims WITH sources
 * (incl. conversation/deep_research observations via the D1.4 coalesce), linked
 * strategies, realized/attribution performance, and a best-effort allocation read
 * (pct-of-NAV per linked strategy) for the allocation-vs-conviction query (D5).
 *
 * Usage:
 *   npx tsx scripts/ops/thesis-snapshot.ts --ticker ENTG
 *   npx tsx scripts/ops/thesis-snapshot.ts --id <uuid> --type asset
 *   npx tsx scripts/ops/thesis-snapshot.ts --title "AI Infrastructure"
 *
 * Requires env sourced (set -a && source .env.local && set +a) — same as all skill scripts.
 */

import { db } from '@/db';
import { macroTheses, assetTheses, underlyings, strategyMetricsSnapshots, mainClaims, claimThesisMappings, assetThesisRelatedMacroTheses, journalEntries } from '@/db/schema';
import { eq, and, ilike, inArray, desc, sql } from 'drizzle-orm';
import { getLatestArticulation, getArticulationHistory, getActiveSignals } from '@/db/queries/thesisSynthesis';
import { getMainClaimsWithSourcesForThesis, getLinkedStrategiesForThesis } from '@/db/queries/macroTheses';
import { getMainClaimsWithSourcesForAssetThesis, getLinkedStrategiesForAssetThesis } from '@/db/queries/assetTheses';
import { getAssetThesisPerformance, getMacroThesisPerformance } from '@/db/queries/thesisPerformance';
import { gatherSignalQualityContext } from '@/lib/derived/signalQualityDiagnostics';
import { getBookmarkAttention } from '@/lib/derived/bookmarkAttention';

type ThesisType = 'macro' | 'asset';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = 'true';
      else { args[key] = next; i++; }
    }
  }
  return args;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Resolved { id: string; type: ThesisType; title: string; ticker: string | null; status: string; direction: string | null; confidenceLevel: string | null; }

async function resolve(args: Record<string, string>): Promise<Resolved | { error: string; candidates?: unknown[] }> {
  // By id (+ optional type)
  if (args.id && UUID_RE.test(args.id)) {
    if (args.type === 'macro' || !args.type) {
      const [m] = await db.select().from(macroTheses).where(eq(macroTheses.id, args.id));
      if (m) return { id: m.id, type: 'macro', title: m.title, ticker: null, status: m.status, direction: m.direction, confidenceLevel: m.confidenceLevel };
    }
    if (args.type === 'asset' || !args.type) {
      const [a] = await db.select({ a: assetTheses, ticker: underlyings.ticker }).from(assetTheses).leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id)).where(eq(assetTheses.id, args.id));
      if (a) return { id: a.a.id, type: 'asset', title: a.a.title, ticker: a.ticker, status: a.a.status, direction: a.a.direction, confidenceLevel: a.a.confidenceLevel };
    }
    return { error: `No thesis found with id ${args.id}` };
  }
  // By ticker (asset)
  if (args.ticker) {
    const t = args.ticker.toUpperCase();
    const rows = await db.select({ a: assetTheses, ticker: underlyings.ticker })
      .from(assetTheses).innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .where(and(eq(underlyings.ticker, t), inArray(assetTheses.status, ['developing', 'monitoring', 'closed', 'draft'])))
      .orderBy(desc(assetTheses.updatedAt));
    if (rows.length === 1) { const r = rows[0]; return { id: r.a.id, type: 'asset', title: r.a.title, ticker: r.ticker, status: r.a.status, direction: r.a.direction, confidenceLevel: r.a.confidenceLevel }; }
    if (rows.length > 1) return { error: `Multiple asset theses for ${t} — pass --id`, candidates: rows.map(r => ({ id: r.a.id, title: r.a.title, status: r.a.status })) };
    return { error: `No asset thesis for ticker ${t}` };
  }
  // By title (ILIKE, both layers)
  if (args.title) {
    const pat = `%${args.title}%`;
    const macros = await db.select().from(macroTheses).where(ilike(macroTheses.title, pat));
    const assets = await db.select({ a: assetTheses, ticker: underlyings.ticker }).from(assetTheses).leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id)).where(ilike(assetTheses.title, pat));
    const cands = [
      ...macros.map(m => ({ id: m.id, type: 'macro' as const, title: m.title, status: m.status })),
      ...assets.map(a => ({ id: a.a.id, type: 'asset' as const, title: a.a.title, status: a.a.status })),
    ];
    if (cands.length === 1) {
      const c = cands[0];
      return resolve({ id: c.id, type: c.type });
    }
    if (cands.length > 1) return { error: `Multiple theses match "${args.title}" — pass --id (+ --type)`, candidates: cands };
    return { error: `No thesis matches title "${args.title}"` };
  }
  return { error: 'Pass one of --ticker, --id (+ --type), or --title' };
}

/** Best-effort allocation: latest pct-of-NAV per linked strategy (summed across accounts on its latest date). */
async function allocation(strategyIds: string[]) {
  if (strategyIds.length === 0) return { perStrategy: [], sumPctNav: 0, note: 'no linked strategies' };
  const rows = await db.select({
    strategyId: strategyMetricsSnapshots.strategyId,
    snapshotDate: strategyMetricsSnapshots.snapshotDate,
    pctNavAbsNotional: strategyMetricsSnapshots.pctNavAbsNotional,
    totalAbsNotional: strategyMetricsSnapshots.totalAbsNotional,
  }).from(strategyMetricsSnapshots)
    .where(inArray(strategyMetricsSnapshots.strategyId, strategyIds))
    .orderBy(desc(strategyMetricsSnapshots.snapshotDate));
  // latest date per strategy; sum pct across that date's (multi-account) rows
  const latestDate = new Map<string, string>();
  for (const r of rows) if (!latestDate.has(r.strategyId)) latestDate.set(r.strategyId, r.snapshotDate);
  const perStrategy: Array<{ strategyId: string; date: string; pctNav: number; absNotional: number }> = [];
  for (const sid of strategyIds) {
    const d = latestDate.get(sid);
    if (!d) continue;
    const onDate = rows.filter(r => r.strategyId === sid && r.snapshotDate === d);
    const pctNav = onDate.reduce((s, r) => s + Number(r.pctNavAbsNotional ?? 0), 0);
    const absNotional = onDate.reduce((s, r) => s + Number(r.totalAbsNotional ?? 0), 0);
    perStrategy.push({ strategyId: sid, date: d, pctNav, absNotional });
  }
  const sumPctNav = perStrategy.reduce((s, p) => s + p.pctNav, 0);
  return {
    perStrategy,
    sumPctNav,
    note: 'sumPctNav = Σ pct_nav_abs_notional across linked strategies (per-account NAV-normalized; approximate book-level, not exact when strategies span accounts with different NAVs). For macro full-credit attribution use the performance block.',
  };
}

/**
 * Standardized completeness pre-check (asset theses): main_claims tagged with the
 * thesis's ticker that are NOT yet linked to this thesis. Surfaces the "un-incorporated
 * evidence" gap by default so re-underwrite never synthesizes on a silently-incomplete set.
 * Ticker-only: catches DB claims with a matching ticker; does NOT catch no-ticker/macro
 * claims or un-promoted Tana content (relate-research remains the primary mechanism).
 */
async function unlinkedByTicker(ticker: string | null, thesisId: string) {
  if (!ticker) return [];
  const tagged = await db
    .select({ id: mainClaims.id, title: mainClaims.title, qualifier: mainClaims.qualifier, status: mainClaims.status })
    .from(mainClaims)
    .where(sql`${ticker} = ANY(${mainClaims.relevantTickers})`);
  if (tagged.length === 0) return [];
  const linkedRows = await db
    .select({ id: claimThesisMappings.mainClaimId })
    .from(claimThesisMappings)
    .where(eq(claimThesisMappings.assetThesisId, thesisId));
  const linked = new Set(linkedRows.map((r) => r.id));
  return tagged.filter((t) => !linked.has(t.id));
}

/**
 * Macro completeness backstop: claims linked to the macro's CHILD asset theses but not
 * to the macro itself. The sector-free analogue of unlinkedByTicker — a claim that bears
 * on an asset under a macro often bears on the macro, so this surfaces evidence that
 * reached the assets but never propagated up. Deterministic; covers the macro side that
 * the ticker check can't.
 */
async function unlinkedViaChildAssets(macroId: string) {
  const children = await db
    .select({ id: assetThesisRelatedMacroTheses.assetThesisId })
    .from(assetThesisRelatedMacroTheses)
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, macroId));
  const childIds = children.map((c) => c.id).filter((x): x is string => !!x);
  if (childIds.length === 0) return [];
  const onChildren = await db
    .select({ id: claimThesisMappings.mainClaimId })
    .from(claimThesisMappings)
    .where(inArray(claimThesisMappings.assetThesisId, childIds));
  const childClaimIds = [...new Set(onChildren.map((c) => c.id).filter((x): x is string => !!x))];
  if (childClaimIds.length === 0) return [];
  const onMacro = await db
    .select({ id: claimThesisMappings.mainClaimId })
    .from(claimThesisMappings)
    .where(eq(claimThesisMappings.macroThesisId, macroId));
  const macroSet = new Set(onMacro.map((c) => c.id));
  const missingIds = childClaimIds.filter((id) => !macroSet.has(id));
  if (missingIds.length === 0) return [];
  return db
    .select({ id: mainClaims.id, title: mainClaims.title, qualifier: mainClaims.qualifier, status: mainClaims.status })
    .from(mainClaims)
    .where(inArray(mainClaims.id, missingIds));
}

/**
 * Active `candidate_signal` journal rows for this thesis (docs/v2/16 §1b) — the producer
 * side of the Lane A↔B contract. Lane A (thesis-observe ingest) writes these from no-signal
 * news; the re-underwrite (Lane B) reads them here and promotes the load-bearing ones into
 * real signals (marking the rest resolved/dismissed). Read-only surface — sibling of
 * `signalQuality`.
 */
async function candidateSignalsForThesis(thesisId: string) {
  const rows = await db
    .select({
      id: journalEntries.id,
      actionDescription: journalEntries.actionDescription,
      metadata: journalEntries.metadata,
      timestamp: journalEntries.timestamp,
    })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.objectId, thesisId),
      eq(journalEntries.actionType, 'candidate_signal'),
      eq(journalEntries.status, 'active'),
    ))
    .orderBy(desc(journalEntries.timestamp));
  return rows.map((r) => {
    const cs = (r.metadata as { candidateSignal?: { statement?: string; sourceUrl?: string | null; observedAt?: string } } | null)?.candidateSignal;
    return {
      id: r.id,
      statement: cs?.statement ?? r.actionDescription,
      sourceUrl: cs?.sourceUrl ?? null,
      observedAt: cs?.observedAt ?? (r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const r = await resolve(args);
  if ('error' in r) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(1);
  }

  const [articulation, history, sigs] = await Promise.all([
    getLatestArticulation(r.id, r.type),
    getArticulationHistory(r.id, r.type),
    getActiveSignals(r.id, r.type),
  ]);

  const claimsRaw = r.type === 'macro'
    ? await getMainClaimsWithSourcesForThesis(r.id)
    : await getMainClaimsWithSourcesForAssetThesis(r.id);
  const strategies = r.type === 'macro'
    ? await getLinkedStrategiesForThesis(r.id)
    : await getLinkedStrategiesForAssetThesis(r.id);

  let performance: unknown = null;
  try {
    performance = r.type === 'macro' ? await getMacroThesisPerformance(r.id) : await getAssetThesisPerformance(r.id);
  } catch (e) {
    performance = { error: `performance unavailable: ${(e as Error).message}` };
  }

  const alloc = await allocation(strategies.map((s: { id: string }) => s.id));

  // Standardized completeness pre-check: ticker-based for assets, child-asset-based for macros.
  const unlinked = r.type === 'asset' ? await unlinkedByTicker(r.ticker, r.id) : await unlinkedViaChildAssets(r.id);
  const unlinkedMethod = r.type === 'asset' ? 'ticker' : 'child_assets';

  // Signal-quality diagnostics (docs/v2/15 §6.3 — the P1→P3 handoff). Non-null only for a
  // monitoring thesis with active signals: which signals are chronic-neutral (sharpen/drop on
  // re-underwrite) + any price coverage-gap (author a covering signal). null otherwise.
  // candidate_signal rows (Lane A producer → Lane B consumer; docs/v2/16 §1b).
  const candidateSignals = await candidateSignalsForThesis(r.id);
  // Bookmark attention (docs/v2/17 P3) — human-curation intensity on this thesis (from
  // bookmark-origin candidate_signals), so the re-underwrite can weigh it. null if none.
  const attention = await getBookmarkAttention(r.id);

  const sq = await gatherSignalQualityContext(r.id, r.type);
  const signalQuality = sq
    ? {
        reunderwriteTrigger: sq.reunderwriteTrigger,
        reason: sq.reason,
        chronicNeutralSignals: sq.chronicNeutralSignals.map((s) => ({
          signalId: s.signalId, statement: s.statement, verdict: s.verdict,
          observedCount: s.observedCount, nonNeutralCount: s.nonNeutralCount,
        })),
        coverageGaps: sq.coverageGaps,
        signalVerdicts: sq.signals.map((s) => ({
          signalId: s.signalId, verdict: s.verdict, observedCount: s.observedCount, collectorTracked: s.collectorTracked,
        })),
      }
    : null;

  // Shape claims for the surface: the case-bearing fields + source type + the falsification view.
  const claims = claimsRaw.map((c) => ({
    id: c.claim.id,
    title: c.claim.title,
    claim: c.claim.claim,
    category: c.claim.category,
    qualifier: c.claim.qualifier,
    status: c.claim.status,
    mappingType: c.linkedTheses?.find?.((t: { id: string }) => t.id === r.id)?.mappingType
      ?? c.linkedViews?.find?.((v: { id: string }) => v.id === r.id)?.mappingType ?? null,
    rebuttal: c.claim.rebuttal ?? [],
    hasReasoning: !!c.claim.reasoning,
    hasBacking: !!c.claim.backing,
    sourceType: (c.artifact as { sourceType?: string } | null)?.sourceType ?? null,
    sourceTitle: (c.artifact as { title?: string } | null)?.title ?? null,
  }));

  const sigByType = {
    confirmation: sigs.filter((s) => s.type === 'confirmation').map((s) => ({ id: s.id, statement: s.statement, notes: s.notes, status: s.status })),
    invalidation: sigs.filter((s) => s.type === 'invalidation').map((s) => ({ id: s.id, statement: s.statement, notes: s.notes, status: s.status })),
    completion: sigs.filter((s) => s.type === 'completion').map((s) => ({ id: s.id, statement: s.statement, notes: s.notes, status: s.status })),
  };

  // "What's thin" hints, computed deterministically.
  const refutingClaims = claims.filter((c) => c.mappingType === 'refutes');
  const sparseToulmin = claims.filter((c) => !c.hasReasoning && !c.hasBacking);
  const thin = {
    hasArticulation: !!articulation,
    articulationVersions: history.length,
    claimCount: claims.length,
    sparseToulminCount: sparseToulmin.length,
    refutingClaimCount: refutingClaims.length,
    rebuttalsAvailable: claims.filter((c) => (c.rebuttal?.length ?? 0) > 0).length,
    evidenceGaps: (articulation?.evidenceGaps as string[] | undefined) ?? [],
    monitoringWithoutArticulation: r.status === 'monitoring' && history.length === 0,
    // Un-incorporated evidence backstop: asset = claims tagged with this ticker not yet
    // linked; macro = claims on child asset theses not yet on the macro. Non-zero ⇒ relate
    // them before re-underwriting. (See unlinkedMethod for which heuristic applied.)
    unlinkedClaimCount: unlinked.length,
  };

  console.log(JSON.stringify({
    thesis: r,
    underwriting: articulation
      ? {
          id: articulation.id,
          version: articulation.version,
          createdAt: articulation.createdAt,
          coreArgument: articulation.coreArgument,
          keyDrivers: articulation.keyDrivers,
          keyAssumptions: articulation.keyAssumptions,
          timeframe: articulation.timeframe,
          confidenceLevel: articulation.confidenceLevel,
          confidenceRationale: articulation.confidenceRationale,
          evidenceGaps: articulation.evidenceGaps,
          claimIdsUsed: articulation.claimIdsUsed,
          referencedTheses: articulation.referencedTheses,
        }
      : null,
    conviction: { current: articulation?.confidenceLevel ?? null, rationale: articulation?.confidenceRationale ?? null },
    versionHistory: history.map((h) => ({ version: h.version, confidenceLevel: h.confidenceLevel, createdAt: h.createdAt })),
    resolution: sigByType,
    claims,
    unlinkedClaims: unlinked,
    unlinkedMethod,
    strategies,
    performance,
    allocation: alloc,
    thin,
    signalQuality,
    candidateSignals,
    attention,
  }, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
