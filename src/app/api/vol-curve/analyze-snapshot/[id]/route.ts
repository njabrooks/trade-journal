/**
 * Scanner-triggered vol-curve analysis.
 *
 * POST /api/vol-curve/analyze-snapshot/[id]
 *
 * Given a vol_scan_ticker_snapshots row id, derive direction + targets from
 * portfolio/thesis context, run analyzeTicker(), persist as vol_curve_reports
 * with trigger_source='scanner', and return the new report id + analysis.
 *
 * Decision-making remains manual: the user clicks "Analyze" on a scanner row
 * → this endpoint runs once → user reviews the report at /vol-curve/[id].
 * No auto-batch synthesis runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { volScanTickerSnapshots, assetTheses, underlyings, volCurveReports } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { analyzeTicker, type AnalyzeOptions } from '@/lib/volCurveAnalyzer';

export const maxDuration = 60;

interface SnapshotRow {
  id: string;
  ticker: string;
  underlyingId: string | null;
  spot: number | null;
  iv30: number | null;
  rv20: number | null;
  atr20: number | null;
  regime: string | null;
  hasOpenPosition: boolean;
  linkedAssetThesisIds: string[] | null;
  cheapnessScore: number | null;
  richnessScore: number | null;
}

async function getSnapshot(id: string): Promise<SnapshotRow | null> {
  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.ticker,
      s.underlying_id,
      s.spot,
      s.iv30,
      s.rv20,
      u.atr20 AS atr20,
      s.regime,
      s.has_open_position,
      s.linked_asset_thesis_ids,
      s.cheapness_score,
      s.richness_score
    FROM vol_scan_ticker_snapshots s
    LEFT JOIN underlyings u ON u.id = s.underlying_id
    WHERE s.id = ${id}
    LIMIT 1;
  `);
  const r = (rows as unknown as Record<string, unknown>[])[0];
  if (!r) return null;
  return {
    id: r.id as string,
    ticker: r.ticker as string,
    underlyingId: (r.underlying_id as string) ?? null,
    spot: r.spot != null ? Number(r.spot) : null,
    iv30: r.iv30 != null ? Number(r.iv30) : null,
    rv20: r.rv20 != null ? Number(r.rv20) : null,
    atr20: r.atr20 != null ? Number(r.atr20) : null,
    regime: (r.regime as string) ?? null,
    hasOpenPosition: r.has_open_position === true,
    linkedAssetThesisIds: (r.linked_asset_thesis_ids as string[]) ?? null,
    cheapnessScore: r.cheapness_score != null ? Number(r.cheapness_score) : null,
    richnessScore: r.richness_score != null ? Number(r.richness_score) : null,
  };
}

async function getLinkedThesis(thesisIds: string[] | null) {
  if (!thesisIds || thesisIds.length === 0) return null;
  const rows = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      direction: assetTheses.direction,
      targetPrice: assetTheses.targetPrice,
    })
    .from(assetTheses)
    .where(eq(assetTheses.id, thesisIds[0]))
    .limit(1);
  return rows[0] ?? null;
}

interface InferredContext {
  direction: 'bullish' | 'bearish' | 'neutral';
  targetBase: number;
  targetHigh: number;
  downsideFloor: number;
  useCase: string;
  horizonMonths: number;
}

/**
 * Derive direction + price targets + use_case from snapshot + thesis context.
 * The user can override via POST body if needed.
 */
function inferContext(snap: SnapshotRow, thesis: { direction: string | null; targetPrice: string | null } | null): InferredContext {
  const spot = snap.spot ?? 0;
  const atr20 = snap.atr20 ?? spot * 0.02;
  const regime = snap.regime ?? 'neutral';

  // Direction
  let direction: 'bullish' | 'bearish' | 'neutral' = 'bullish';
  let useCase = 'cheap_access';

  if (thesis?.direction === 'bullish' || thesis?.direction === 'bearish' || thesis?.direction === 'neutral') {
    direction = thesis.direction;
    useCase = regime === 'cheap' ? 'accentuate' : regime === 'rich' ? 'yield_harvest' : 'thesis_aligned';
  } else if (regime === 'cheap' && snap.hasOpenPosition) {
    direction = 'bearish';
    useCase = 'hedge';
  } else if (regime === 'rich' && snap.hasOpenPosition) {
    direction = 'bullish';
    useCase = 'yield_harvest';
  } else if (regime === 'rich' && !snap.hasOpenPosition) {
    direction = 'bullish';
    useCase = 'accumulation';
  } else if (regime === 'mixed') {
    direction = 'bullish';
    useCase = 'mixed_review';
  }

  // Targets
  const thesisTarget = thesis?.targetPrice ? Number(thesis.targetPrice) : null;
  let targetBase: number;
  let targetHigh: number;
  let downsideFloor: number;

  if (thesisTarget && thesisTarget > 0) {
    targetBase = thesisTarget;
    targetHigh = direction === 'bearish' ? thesisTarget * 0.85 : thesisTarget * 1.15;
  } else {
    if (direction === 'bullish') {
      targetBase = spot * 1.05;
      targetHigh = spot * 1.15;
    } else if (direction === 'bearish') {
      targetBase = spot * 0.95;
      targetHigh = spot * 0.85;
    } else {
      targetBase = spot;
      targetHigh = spot * 1.10;
    }
  }

  // Downside floor: 2 ATR below spot, with 15% floor
  downsideFloor = Math.max(spot - 2 * atr20, spot * 0.85);
  if (direction === 'bearish') {
    downsideFloor = spot * 0.5; // unused for bearish strategies
  }

  // Horizon: rich-regime / yield-harvest plays favor shorter (~30-45 days);
  // cheap-regime accentuators favor longer (3-6m); LEAP-style only when explicit
  let horizonMonths = 3;
  if (useCase === 'yield_harvest' || useCase === 'accumulation') horizonMonths = 1.5;
  if (useCase === 'accentuate' || useCase === 'cheap_access') horizonMonths = 4;
  if (useCase === 'hedge') horizonMonths = 2;

  return {
    direction,
    targetBase,
    targetHigh,
    downsideFloor,
    useCase,
    horizonMonths,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing snapshot id' }, { status: 400 });
  }

  // Allow body overrides for direction / targets / horizon
  let bodyOverrides: Partial<AnalyzeOptions> = {};
  try {
    const text = await request.text();
    if (text) bodyOverrides = JSON.parse(text);
  } catch {
    // empty body is fine
  }

  const snap = await getSnapshot(id);
  if (!snap) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  // Fall back to live spot lookup if snapshot doesn't have one. Older
  // snapshots from earlier scanner runs may have null spot; the freshest
  // value lives in underlyings_iv_history or underlyings.spot.
  if (!snap.spot || snap.spot <= 0) {
    const fallback = await db.execute(sql`
      SELECT
        COALESCE(
          (SELECT spot::numeric FROM underlyings_iv_history
           WHERE ticker = ${snap.ticker} AND spot IS NOT NULL
           ORDER BY as_of_date DESC LIMIT 1),
          (SELECT spot::numeric FROM underlyings WHERE ticker = ${snap.ticker} LIMIT 1)
        ) AS spot;
    `);
    const liveSpot = (fallback as unknown as { spot: number | null }[])[0]?.spot;
    if (liveSpot && Number(liveSpot) > 0) {
      snap.spot = Number(liveSpot);
    } else {
      return NextResponse.json(
        { error: `No spot price available for ${snap.ticker} (snapshot or live lookup)` },
        { status: 400 }
      );
    }
  }

  const thesis = await getLinkedThesis(snap.linkedAssetThesisIds);
  const ctx = inferContext(snap, thesis);

  const opts: AnalyzeOptions = {
    ticker: snap.ticker,
    direction: bodyOverrides.direction ?? ctx.direction,
    targetBase: bodyOverrides.targetBase ?? ctx.targetBase,
    targetHigh: bodyOverrides.targetHigh ?? ctx.targetHigh,
    horizonMonths: bodyOverrides.horizonMonths ?? ctx.horizonMonths,
    horizonRange: bodyOverrides.horizonRange ?? 1.5,
    downsideFloor: bodyOverrides.downsideFloor ?? ctx.downsideFloor,
    riskFreeRate: bodyOverrides.riskFreeRate,
    snapshotDate: bodyOverrides.snapshotDate,
    regime: (snap.regime as 'cheap' | 'rich' | 'mixed' | 'neutral' | null) ?? 'neutral',
    useCase: ctx.useCase,
    hasOpenPosition: snap.hasOpenPosition,
  };

  let analysis;
  try {
    analysis = await analyzeTicker(opts);
  } catch (err) {
    console.error(`[scanner-analyze] ${snap.ticker} failed:`, err);
    return NextResponse.json(
      {
        error: 'Analysis failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  // Persist as vol_curve_reports row
  const top = analysis.strategies[0];
  const inserted = await db
    .insert(volCurveReports)
    .values({
      ticker: opts.ticker,
      direction: opts.direction,
      targetBase: opts.targetBase.toString(),
      targetHigh: opts.targetHigh.toString(),
      horizonMonths: opts.horizonMonths.toString(),
      downsideFloor: opts.downsideFloor.toString(),
      spot: analysis.context.spot.toString(),
      iv30: analysis.context.iv30 != null ? analysis.context.iv30.toString() : null,
      rv20: analysis.context.rv20 != null ? analysis.context.rv20.toString() : null,
      ivRvRatio: analysis.context.ivRvRatio != null ? analysis.context.ivRvRatio.toString() : null,
      ivRank: analysis.volRank.ivRank != null ? analysis.volRank.ivRank.toString() : null,
      strategyCount: analysis.strategies.length,
      topStrategyLabel: top?.label ?? null,
      topStrategyType: top?.type ?? null,
      reportData: analysis,
      triggerSource: 'scanner',
      regime: snap.regime,
      useCase: ctx.useCase,
      scannerSnapshotId: snap.id,
    })
    .returning({ id: volCurveReports.id });

  return NextResponse.json({
    reportId: inserted[0]?.id,
    snapshotId: snap.id,
    inferredContext: ctx,
    analysis,
  });
}
