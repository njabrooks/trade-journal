/**
 * Today's scanner snapshots for the /vol-curve "Scanner Today" tab.
 *
 * Returns the latest vol_scan_runs row for the most recent run_date and all
 * its ticker snapshots, joined with the linked asset_thesis title (if any)
 * for inline display.
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  const rows = await db.execute(sql`
    WITH latest_run AS (
      SELECT id, run_date, universe_source, status, started_at, completed_at, universe_size
      FROM vol_scan_runs
      ORDER BY started_at DESC
      LIMIT 1
    ),
    thesis_titles AS (
      SELECT
        s.id AS snapshot_id,
        STRING_AGG(at.title, ', ') AS thesis_titles
      FROM vol_scan_ticker_snapshots s
      LEFT JOIN asset_theses at ON at.id = ANY(s.linked_asset_thesis_ids)
      GROUP BY s.id
    ),
    -- Canonical "currently held" check: a ticker is held only if it appears
    -- in the LATEST positions snapshot for at least one account with non-zero
    -- quantity. Stale rows (e.g., LLY closed weeks ago but old is_open=true
    -- rows never overwritten) are excluded because they're not in the most
    -- recent snapshot. This is the right semantic for covered-call eligibility.
    latest_account_snapshots AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM positions
      GROUP BY account_id
    ),
    live_positions AS (
      SELECT DISTINCT p.underlying_id
      FROM positions p
      JOIN latest_account_snapshots las
        ON las.account_id = p.account_id AND las.latest_date = p.snapshot_date
      WHERE p.is_open = true
        AND p.quantity::numeric != 0
        AND p.underlying_id IS NOT NULL
    ),
    existing_reports AS (
      SELECT scanner_snapshot_id, COUNT(*)::int AS report_count, MAX(id::text) AS latest_report_id
      FROM vol_curve_reports
      WHERE scanner_snapshot_id IS NOT NULL
      GROUP BY scanner_snapshot_id
    )
    SELECT
      s.id,
      s.ticker,
      s.regime,
      s.cheapness_score,
      s.richness_score,
      s.iv_percentile_252,
      s.iv_rv20_ratio,
      s.term_structure_slope,
      s.skew_25d,
      (lp.underlying_id IS NOT NULL) AS has_open_position,
      s.iv30,
      s.rv20,
      s.spot,
      s.data_source,
      s.linked_asset_thesis_ids,
      tt.thesis_titles,
      er.report_count,
      er.latest_report_id,
      r.id AS run_id,
      r.run_date,
      r.universe_source,
      r.status AS run_status
    FROM latest_run r
    JOIN vol_scan_ticker_snapshots s ON s.run_id = r.id
    LEFT JOIN thesis_titles tt ON tt.snapshot_id = s.id
    LEFT JOIN live_positions lp ON lp.underlying_id = s.underlying_id
    LEFT JOIN existing_reports er ON er.scanner_snapshot_id = s.id
    ORDER BY
      CASE s.regime
        WHEN 'rich' THEN 1
        WHEN 'cheap' THEN 2
        WHEN 'mixed' THEN 3
        ELSE 4
      END,
      GREATEST(COALESCE(s.cheapness_score::numeric, 0), COALESCE(s.richness_score::numeric, 0)) DESC;
  `);

  const data = rows as unknown as Record<string, unknown>[];
  if (data.length === 0) {
    return NextResponse.json({ run: null, snapshots: [] });
  }

  const first = data[0];
  return NextResponse.json({
    run: {
      id: first.run_id,
      runDate: first.run_date,
      universeSource: first.universe_source,
      status: first.run_status,
    },
    snapshots: data.map((r) => ({
      id: r.id,
      ticker: r.ticker,
      regime: r.regime,
      cheapnessScore: r.cheapness_score != null ? Number(r.cheapness_score) : null,
      richnessScore: r.richness_score != null ? Number(r.richness_score) : null,
      ivPercentile252: r.iv_percentile_252 != null ? Number(r.iv_percentile_252) : null,
      ivRv20Ratio: r.iv_rv20_ratio != null ? Number(r.iv_rv20_ratio) : null,
      termStructureSlope: r.term_structure_slope != null ? Number(r.term_structure_slope) : null,
      skew25d: r.skew_25d != null ? Number(r.skew_25d) : null,
      hasOpenPosition: r.has_open_position === true,
      iv30: r.iv30 != null ? Number(r.iv30) : null,
      rv20: r.rv20 != null ? Number(r.rv20) : null,
      spot: r.spot != null ? Number(r.spot) : null,
      dataSource: r.data_source ?? null,
      thesisTitles: r.thesis_titles ?? null,
      reportCount: r.report_count != null ? Number(r.report_count) : 0,
      latestReportId: r.latest_report_id ?? null,
    })),
  });
}
