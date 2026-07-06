import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Latest regime snapshot per source (docs/v2/21 Phase 1) — the dashboard
 * RegimeStrip module's data surface. Rows are written by
 * scripts/ingest-regime-scan.ts (radon CRI + VCG scanners, 3x weekdays).
 */
export async function GET() {
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (source) source, scan_time, market_open, score, band, components
      FROM regime_snapshots
      ORDER BY source, scan_time DESC
    `);

    const now = Date.now();
    const snapshots = (rows as unknown as Array<Record<string, unknown>>).map((r) => {
      const scanTime = new Date(String(r.scan_time));
      const components = (r.components ?? {}) as Record<string, unknown>;
      return {
        source: String(r.source),
        band: String(r.band),
        score: r.score !== null ? Number(r.score) : null,
        scanTime: scanTime.toISOString(),
        stale: now - scanTime.getTime() > 24 * 3600_000,
        vix: (components.vix as number) ?? null,
        crashTriggered:
          ((components.crash_trigger as Record<string, unknown>)?.triggered as boolean) ?? null,
        regime: (components.regime as string) ?? null,
      };
    });

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error('Failed to fetch regime snapshots:', error);
    return NextResponse.json({ error: 'Failed to fetch regime snapshots' }, { status: 500 });
  }
}
