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

  // Bundle output: per-thesis context (signals + recent prior evidence) for the requested tiers.
  const due = ranked.filter((t) => tiers.has(t.tier));
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
      signals: ctx.signals.map((s) => ({
        id: s.id,
        type: s.type,
        statement: s.statement,
        notes: s.notes,
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
    tiers: [...tiers].sort(),
    thesisCount: bundles.length,
    signalCount: bundles.reduce((n, b) => n + b.signals.length, 0),
    bundles,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
