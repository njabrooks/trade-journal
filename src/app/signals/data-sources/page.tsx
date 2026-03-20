import { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DataSourcesGrid } from "@/components/signals/DataSourcesGrid";
import type { DataSourceRow } from "@/components/signals/DataSourceCard";

export const metadata: Metadata = {
  title: "Signal Data Sources",
};

async function getDataSources(): Promise<DataSourceRow[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.key,
      r.name,
      r.description,
      r.category,
      r.measure_type as "measureType",
      r.available_metrics as "availableMetrics",
      r.asset_scope as "assetScope",
      r.ingestion_method as "ingestionMethod",
      r.ingestion_script as "ingestionScript",
      r.ingestion_schedule as "ingestionSchedule",
      COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END)::int as "activeSignals",
      COUNT(DISTINCT sds.id)::int as "totalSnapshots",
      MAX(sds.snapshot_date)::text as "lastSnapshot"
    FROM signal_data_source_registry r
    LEFT JOIN signal_data_snapshots sds ON sds.data_source = r.key
    LEFT JOIN signals s ON s.id = sds.signal_id AND s.status = 'active'
    WHERE r.is_active = true
    GROUP BY r.id
    ORDER BY r.category, r.name
  `);

  return rows as unknown as DataSourceRow[];
}

export default async function DataSourcesPage() {
  const sources = await getDataSources();
  const totalSnapshots = sources.reduce((sum, s) => sum + s.totalSnapshots, 0);

  return (
    <DashboardShell
      activeNav="signals-data-sources"
      title="Signal Data Sources"
      subtitle={`${sources.length} active sources with ${totalSnapshots.toLocaleString()} total snapshots`}
    >
      <DataSourcesGrid sources={sources} />
    </DashboardShell>
  );
}
