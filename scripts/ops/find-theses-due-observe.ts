#!/usr/bin/env tsx
/**
 * The thesis-OBSERVE worklist (docs/v2/14 §3.6 — the tracking-evidence producer).
 *
 * Walks the active monitoring set, ranks each thesis by PORTFOLIO MATERIALITY, assigns
 * a tier (1/2/3), and emits the per-thesis observation bundle (signals + recent prior
 * evidence for the change-from-prior delta) that the `/thesis-observe` skill consumes.
 *
 * Tiering is the token-cost lever that killed v1 (docs/v2/14 §3.6). Materiality drives
 * the tier; a manual override map can promote/demote a specific thesis (e.g. promote
 * Bearish Oil when it matters — the canonical 04-06 miss). Phase 1 runs TIER-1 ONLY.
 *
 * Materiality:
 *   - asset thesis  → Σ open positions.market_value_usd across its ACTIVE strategies
 *   - macro thesis  → Σ materiality of its linked asset theses (exposure view; the
 *                     full-credit attribution rule means this deliberately double-counts
 *                     vs the asset $, so asset and macro thresholds are scaled separately)
 *
 * Only theses WITH active signals are observable (nothing to observe otherwise).
 *
 * Usage:
 *   npx tsx scripts/ops/find-theses-due-observe.ts                 # Tier-1 bundle (JSON) — what the skill reads
 *   npx tsx scripts/ops/find-theses-due-observe.ts --tier 1,2     # multiple tiers
 *   npx tsx scripts/ops/find-theses-due-observe.ts --all          # every observable thesis, with its tier
 *   npx tsx scripts/ops/find-theses-due-observe.ts --summary      # human-readable ranking (no bundles)
 */
import { db, closeDb } from '../lib/db.js';
import { sql } from 'drizzle-orm';
import { gatherHealthContext } from '@/lib/derived/thesisHealth';
import { getLiveQuotes } from '@/lib/services/livePrices';

// ── Tier thresholds (USD). Materiality ≥ tier1 ⇒ Tier 1, ≥ tier2 ⇒ Tier 2, else Tier 3. ──
// Asset = open MV of the thesis's own strategies. Macro = summed exposure of linked assets
// (double-counts by design), so its bands sit higher. Tunable — this is the cost dial.
const TIER_BANDS = {
  asset: { tier1: 100_000_000, tier2: 10_000_000 },
  macro: { tier1: 180_000_000, tier2: 25_000_000 },
} as const;

// Manual tier override, keyed by asset ticker or exact macro title. Materiality is the
// default driver; this is the escape hatch (docs/v2/14 §3.6 "with a manual override").
//   e.g. CL: 1  — promote Bearish Oil (CL) to daily regardless of its small book.
const TIER_OVERRIDE: Record<string, 1 | 2 | 3> = {};

// ── Tier-2/3 cadence floors (P4 #3, docs/v2/14 §3.6). A thesis is cadence-"due" when the
// floor interval for its tier has elapsed since its last thesis_observe snapshot: Tier-1
// daily (floor 0 ⇒ always due on a scheduled run), Tier-2 every ~2–3d, Tier-3 weekly. This
// is what lets a single daily `--due` run pick the right per-tier slice. Tunable. ──
const CADENCE_FLOOR_DAYS: Record<1 | 2 | 3, number> = { 1: 0, 2: 2, 3: 6 };

type ThesisType = 'asset' | 'macro';

interface MaterialityRow {
  id: string;
  thesisType: ThesisType;
  title: string;
  direction: string | null;
  confidence: string | null;
  ticker: string | null;     // asset only
  sectors: string[] | null;  // macro only
  materialityUsd: number;
  tier: 1 | 2 | 3;
}

function tierFor(thesisType: ThesisType, materialityUsd: number, overrideKey: string): 1 | 2 | 3 {
  if (TIER_OVERRIDE[overrideKey] != null) return TIER_OVERRIDE[overrideKey];
  const bands = TIER_BANDS[thesisType];
  if (materialityUsd >= bands.tier1) return 1;
  if (materialityUsd >= bands.tier2) return 2;
  return 3;
}

/** Monitoring asset theses that have ≥1 active signal, with open-position materiality. */
async function assetMateriality(): Promise<MaterialityRow[]> {
  const rows = await db.execute<{
    id: string; title: string; direction: string | null; conf: string | null;
    ticker: string; materiality: string | null;
  }>(sql`
    WITH mv AS (
      SELECT st.asset_thesis_id AS tid,
             SUM(p.market_value_usd) FILTER (WHERE p.is_open) AS open_mv
      FROM strategies st JOIN positions p ON p.strategy_id = st.id
      WHERE st.status = 'active'
      GROUP BY st.asset_thesis_id
    )
    SELECT at.id, at.title, at.direction, at.confidence_level AS conf,
           u.ticker, mv.open_mv AS materiality
    FROM asset_theses at
    JOIN underlyings u ON at.underlying_id = u.id
    LEFT JOIN mv ON mv.tid = at.id
    WHERE at.status = 'monitoring'
      AND EXISTS (
        SELECT 1 FROM signal_entity_links sel JOIN signals s ON s.id = sel.signal_id
        WHERE sel.thesis_id = at.id AND sel.thesis_type = 'asset'
          AND sel.entity_type = 'thesis' AND s.status = 'active')
  `);
  return rows.map((r) => {
    const materialityUsd = r.materiality != null ? Number(r.materiality) : 0;
    return {
      id: r.id, thesisType: 'asset' as const, title: r.title, direction: r.direction,
      confidence: r.conf, ticker: r.ticker, sectors: null, materialityUsd,
      tier: tierFor('asset', materialityUsd, r.ticker),
    };
  });
}

/** Monitoring macro theses that have ≥1 active signal, with linked-asset exposure materiality. */
async function macroMateriality(): Promise<MaterialityRow[]> {
  const rows = await db.execute<{
    id: string; title: string; direction: string | null; conf: string | null;
    sectors: string[] | null; materiality: string | null;
  }>(sql`
    WITH mv AS (
      SELECT st.asset_thesis_id AS tid,
             SUM(p.market_value_usd) FILTER (WHERE p.is_open) AS open_mv
      FROM strategies st JOIN positions p ON p.strategy_id = st.id
      WHERE st.status = 'active'
      GROUP BY st.asset_thesis_id
    ),
    macro_mv AS (
      SELECT atm.macro_thesis_id AS tid, SUM(mv.open_mv) AS open_mv
      FROM asset_thesis_related_macro_theses atm
      JOIN mv ON mv.tid = atm.asset_thesis_id
      GROUP BY atm.macro_thesis_id
    )
    SELECT mt.id, mt.title, mt.direction, mt.confidence_level AS conf,
           mt.sectors, macro_mv.open_mv AS materiality
    FROM macro_theses mt
    LEFT JOIN macro_mv ON macro_mv.tid = mt.id
    WHERE mt.status = 'monitoring'
      AND EXISTS (
        SELECT 1 FROM signal_entity_links sel JOIN signals s ON s.id = sel.signal_id
        WHERE sel.thesis_id = mt.id AND sel.thesis_type = 'macro'
          AND sel.entity_type = 'thesis' AND s.status = 'active')
  `);
  return rows.map((r) => {
    const materialityUsd = r.materiality != null ? Number(r.materiality) : 0;
    return {
      id: r.id, thesisType: 'macro' as const, title: r.title, direction: r.direction,
      confidence: r.conf, ticker: null, sectors: r.sectors ?? [], materialityUsd,
      tier: tierFor('macro', materialityUsd, r.title),
    };
  });
}

// ── PRICE & DATA WATCH (P4 #1, docs/v2/14 §4) ───────────────────────────────────────
// Freshest spot per constituent underlying off the W6 livePrices overlay (Yahoo → IBKR),
// NOT the stale underlyings.spot — the direct fix for the Bearish-Oil stale-price miss.
// Δ-vs-stored shows how far the daily-ingest spot has drifted since last close; target
// proximity reads the asset thesis target. Known gaps (futures/private/bonds) degrade
// gracefully (unpriced=true + a note) — we don't pre-build a collector for them (§4).

type LiveKind = 'STK' | 'CRYPTO';

interface PriceWatchEntry {
  ticker: string;
  assetClass: string | null;
  direction: string | null;
  live: number | null;            // freshest spot (livePrices)
  liveSource: 'yahoo' | 'ibkr' | null;
  asOf: string | null;            // ISO of the live quote
  storedSpot: number | null;      // underlyings.spot (last daily ingest — the "prior")
  deltaVsStoredPct: number | null;  // (live − stored)/stored × 100 — drift since last close
  targetPrice: number | null;
  toTargetPct: number | null;     // (target − live)/live × 100 (signed; +ve = upside to target)
  unpriced: boolean;
  note: string | null;
}

/** Map an underlyings.asset_class to the livePrices kind, or null when not live-priceable. */
function liveKindFor(assetClass: string | null): LiveKind | null {
  switch ((assetClass ?? '').toUpperCase()) {
    case 'STK': case 'EQUITY': case 'ETF': return 'STK';
    case 'CRYPTO': case 'PERP': case 'STABLECOIN': return 'CRYPTO';
    default: return null; // FUT/FSFOP/BOND/COMMODITY/REAL_ESTATE/null/… — accepted gaps (§4)
  }
}

function unpricedNote(assetClass: string | null): string {
  const ac = (assetClass ?? '').toUpperCase();
  if (ac === 'FUT' || ac === 'FSFOP') return 'futures — not live-priced';
  if (ac === 'BOND') return 'bond — not live-priced';
  if (!ac) return 'private/unclassified — no live quote';
  return `${ac.toLowerCase()} — not live-priced`;
}

interface Constituent {
  ticker: string; assetClass: string | null; spot: string | null;
  targetPrice: string | null; direction: string | null;
}

/**
 * Build the PRICE & DATA WATCH map (thesisKey → entries[]) for the due set, off live
 * prices. Asset thesis → its own underlying; macro thesis → its monitoring child-asset
 * constituents (the exposure-bearing underlyings). All live-priceable tickers are fetched
 * in ONE batched getLiveQuotes call (TTL-cached, concurrency-limited). Non-fatal: a source
 * miss yields live=null with a note, never throws.
 */
async function gatherPriceWatch(due: MaterialityRow[]): Promise<Map<string, PriceWatchEntry[]>> {
  const assetIds = due.filter((d) => d.thesisType === 'asset').map((d) => d.id);
  const macroIds = due.filter((d) => d.thesisType === 'macro').map((d) => d.id);
  const byKey = new Map<string, Constituent[]>();

  if (assetIds.length > 0) {
    const rows = await db.execute<{
      tid: string; ticker: string; asset_class: string | null; spot: string | null;
      target_price: string | null; direction: string | null;
    }>(sql`
      SELECT at.id AS tid, u.ticker, u.asset_class, u.spot, at.target_price, at.direction
      FROM asset_theses at JOIN underlyings u ON at.underlying_id = u.id
      WHERE at.id IN (${sql.join(assetIds.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const r of rows) {
      byKey.set(`asset:${r.tid}`, [{
        ticker: r.ticker, assetClass: r.asset_class, spot: r.spot,
        targetPrice: r.target_price, direction: r.direction,
      }]);
    }
  }

  if (macroIds.length > 0) {
    const rows = await db.execute<{
      mid: string; ticker: string; asset_class: string | null; spot: string | null;
      target_price: string | null; direction: string | null;
    }>(sql`
      SELECT atm.macro_thesis_id AS mid, u.ticker, u.asset_class, u.spot,
             at.target_price, at.direction
      FROM asset_thesis_related_macro_theses atm
      JOIN asset_theses at ON at.id = atm.asset_thesis_id
      JOIN underlyings u ON at.underlying_id = u.id
      WHERE atm.macro_thesis_id IN (${sql.join(macroIds.map((id) => sql`${id}`), sql`, `)})
        AND at.status = 'monitoring'
      ORDER BY u.ticker
    `);
    for (const r of rows) {
      const key = `macro:${r.mid}`;
      if (!byKey.has(key)) byKey.set(key, []);
      const list = byKey.get(key)!;
      if (!list.some((c) => c.ticker === r.ticker)) {
        list.push({ ticker: r.ticker, assetClass: r.asset_class, spot: r.spot, targetPrice: r.target_price, direction: r.direction });
      }
    }
  }

  // Batch every live-priceable ticker into one overlay call.
  const stk = new Set<string>(), crypto = new Set<string>();
  for (const list of byKey.values()) for (const c of list) {
    const kind = liveKindFor(c.assetClass);
    if (kind === 'STK') stk.add(c.ticker);
    else if (kind === 'CRYPTO') crypto.add(c.ticker);
  }
  const quotes = (stk.size + crypto.size) > 0
    ? await getLiveQuotes({ stk: [...stk], crypto: [...crypto] })
    : new Map();

  const out = new Map<string, PriceWatchEntry[]>();
  for (const [key, list] of byKey.entries()) {
    out.set(key, list.map((c) => {
      const kind = liveKindFor(c.assetClass);
      const q = kind ? quotes.get(`${kind}:${c.ticker.toUpperCase()}`) : undefined;
      const live = q?.price ?? null;
      const storedSpot = c.spot != null ? Number(c.spot) : null;
      const target = c.targetPrice != null ? Number(c.targetPrice) : null;
      const deltaVsStoredPct = live != null && storedSpot ? ((live - storedSpot) / storedSpot) * 100 : null;
      const toTargetPct = live != null && target ? ((target - live) / live) * 100 : null;
      return {
        ticker: c.ticker,
        assetClass: c.assetClass,
        direction: c.direction,
        live,
        liveSource: q?.source ?? null,
        asOf: q ? new Date(q.asOfMs).toISOString() : null,
        storedSpot,
        deltaVsStoredPct: deltaVsStoredPct != null ? Number(deltaVsStoredPct.toFixed(2)) : null,
        targetPrice: target,
        toTargetPct: toTargetPct != null ? Number(toTargetPct.toFixed(1)) : null,
        unpriced: kind === null,
        note: kind === null ? unpricedNote(c.assetClass) : (live == null ? 'no live quote (source miss)' : null),
      };
    }));
  }
  return out;
}

/** Last thesis_observe snapshot per thesis (the cadence clock for --due). */
async function lastObservedByThesis(): Promise<Map<string, Date>> {
  const rows = await db.execute<{ thesis_type: string; thesis_id: string; last_obs: string | null }>(sql`
    SELECT sel.thesis_type, sel.thesis_id, max(sds.snapshot_date) AS last_obs
    FROM signal_data_snapshots sds
    JOIN signal_entity_links sel ON sel.signal_id = sds.signal_id
    WHERE sds.data_source = 'thesis_observe' AND sel.entity_type = 'thesis'
    GROUP BY sel.thesis_type, sel.thesis_id
  `);
  const out = new Map<string, Date>();
  for (const r of rows) if (r.last_obs) out.set(`${r.thesis_type}:${r.thesis_id}`, new Date(r.last_obs));
  return out;
}

/** Cadence-due iff never observed (baseline) or the tier floor has elapsed since last observe. */
function cadenceDue(tier: 1 | 2 | 3, last: Date | null, now: number): boolean {
  if (!last) return true;
  return (now - last.getTime()) / 86_400_000 >= CADENCE_FLOOR_DAYS[tier];
}

function parseTiers(argv: string[]): Set<number> {
  const idx = argv.indexOf('--tier');
  if (idx === -1) return new Set([1]); // Phase 1 default: Tier-1 only
  const val = argv[idx + 1];
  if (!val) return new Set([1]);
  return new Set(val.split(',').map((t) => Number(t.trim())).filter((n) => n >= 1 && n <= 3));
}

async function main() {
  const argv = process.argv.slice(2);
  const summary = argv.includes('--summary');
  const all = argv.includes('--all');
  const dueMode = argv.includes('--due');
  const tiers = all ? new Set([1, 2, 3]) : parseTiers(argv);

  const ranked = [...(await assetMateriality()), ...(await macroMateriality())]
    .sort((a, b) => b.materialityUsd - a.materialityUsd);

  if (summary) {
    const m = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
    console.log(`\n=== Thesis-observe ranking (${ranked.length} observable theses) ===`);
    console.log(`Bands: asset T1≥${m(TIER_BANDS.asset.tier1)}/T2≥${m(TIER_BANDS.asset.tier2)} · macro T1≥${m(TIER_BANDS.macro.tier1)}/T2≥${m(TIER_BANDS.macro.tier2)}\n`);
    for (const t of ranked) {
      const tag = t.thesisType === 'asset' ? (t.ticker ?? '?') : 'macro';
      const ov = TIER_OVERRIDE[t.thesisType === 'asset' ? (t.ticker ?? '') : t.title] != null ? ' (override)' : '';
      console.log(`  T${t.tier}${ov}  ${m(t.materialityUsd).padStart(9)}  [${tag}] ${t.title}`);
    }
    const counts = [1, 2, 3].map((tt) => `T${tt}=${ranked.filter((r) => r.tier === tt).length}`).join(' · ');
    console.log(`\n  ${counts}\n`);
    await closeDb();
    process.exit(0);
  }

  // Selection: --due ⇒ cadence-aware across all tiers (T1 daily, T2 ~2–3d, T3 weekly — the
  // scheduled producer's slice); otherwise the explicit tier filter (default Tier-1 only).
  let due: MaterialityRow[];
  if (dueMode) {
    const lastObs = await lastObservedByThesis();
    const now = Date.now();
    due = ranked.filter((t) => cadenceDue(t.tier, lastObs.get(`${t.thesisType}:${t.id}`) ?? null, now));
  } else {
    due = ranked.filter((t) => tiers.has(t.tier));
  }

  // PRICE & DATA WATCH (P4 #1): one batched live-price pass over the due set's underlyings.
  const priceWatch = await gatherPriceWatch(due);

  // Bundle output: per-thesis context (signals + recent prior evidence) for the selected set.
  const bundles = [];
  for (const t of due) {
    const ctx = await gatherHealthContext(t.id, t.thesisType);
    if (!ctx || ctx.signals.length === 0) continue; // belt-and-braces (EXISTS already guards)
    bundles.push({
      tier: t.tier,
      thesisId: t.id,
      thesisType: t.thesisType,
      title: t.title,
      direction: t.direction,
      confidence: t.confidence,
      ticker: t.ticker,
      sectors: t.sectors,
      spot: ctx.thesis.spot ?? null,
      materialityUsd: Math.round(t.materialityUsd),
      priceWatch: priceWatch.get(`${t.thesisType}:${t.id}`) ?? [],
      signals: ctx.signals.map((s) => ({
        id: s.id,
        type: s.type,
        statement: s.statement,
        notes: s.notes,
        collectorTracked: s.collectorTracked, // docs/v2/15 §8 — observe DEFERS these deterministically
        recentEvidence: s.recentEvidence.map((e) => ({
          assessment: e.assessment,
          evidenceSummary: e.evidenceSummary,
          dataSource: e.dataSource,
          snapshotDate: e.snapshotDate,
        })),
      })),
    });
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    selection: dueMode ? 'cadence-due' : 'tier',
    tiers: dueMode ? [...new Set(due.map((d) => d.tier))].sort() : [...tiers].sort(),
    thesisCount: bundles.length,
    signalCount: bundles.reduce((n, b) => n + b.signals.length, 0),
    bundles,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
