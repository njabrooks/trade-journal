import { db } from '@/db';
import { sql } from 'drizzle-orm';

export interface QuantDailySnapshot {
  id: string;
  signalId: string;
  signalStatement: string;
  signalType: string;
  signalImportance: string;
  snapshotDate: Date;
  observedValue: number | null;
  thresholdValue: number | null;
  pctToThreshold: number | null;
  unit: string | null;
  assessment: string | null;
  evidenceSummary: string | null;
  dataSource: string | null;
  thesisTitle: string | null;
  thesisType: string | null;
  thesisId: string | null;
  ticker: string | null;
}

export interface QuantDailySummary {
  date: string;
  snapshots: QuantDailySnapshot[];
  assessmentCounts: {
    strengthening: number;
    confirmed: number;
    weakening: number;
    invalidated: number;
    neutral: number;
  };
}

interface QuantSnapshotRow {
  id: string;
  signal_id: string;
  signal_statement: string;
  signal_type: string;
  signal_importance: string;
  snapshot_date: string;
  observed_value: string | null;
  threshold_value: string | null;
  pct_to_threshold: string | null;
  unit: string | null;
  assessment: string | null;
  evidence_summary: string | null;
  data_source: string | null;
  thesis_title: string | null;
  thesis_type: string | null;
  thesis_id: string | null;
  ticker: string | null;
}

export async function getQuantSnapshotsByDate(dateStr: string): Promise<QuantDailySummary | null> {
  const result = await db.execute(sql`
    SELECT
      sds.id,
      sds.signal_id,
      s.statement AS signal_statement,
      s.type AS signal_type,
      s.importance AS signal_importance,
      sds.snapshot_date::text,
      sds.observed_value::text,
      sds.threshold_value::text,
      sds.pct_to_threshold::text,
      sds.unit,
      sds.assessment,
      sds.evidence_summary,
      sds.data_source,
      COALESCE(mt.title, at.title) AS thesis_title,
      sel.thesis_type,
      sel.thesis_id,
      u.ticker
    FROM signal_data_snapshots sds
    JOIN signals s ON s.id = sds.signal_id
    LEFT JOIN signal_entity_links sel ON sel.signal_id = s.id AND sel.entity_type = 'thesis'
    LEFT JOIN macro_theses mt ON mt.id = sel.thesis_id AND sel.thesis_type = 'macro'
    LEFT JOIN asset_theses at ON at.id = sel.thesis_id AND sel.thesis_type = 'asset'
    LEFT JOIN underlyings u ON u.id = at.underlying_id
    WHERE DATE(sds.snapshot_date) = ${dateStr}
      AND sds.data_source NOT IN ('thesis_monitor', 'research_routing')
      AND sds.observed_value IS NOT NULL
      AND sds.status = 'accepted'
    ORDER BY
      CASE s.importance WHEN 'critical' THEN 1 WHEN 'significant' THEN 2 WHEN 'supporting' THEN 3 ELSE 4 END,
      CASE sds.assessment
        WHEN 'invalidated' THEN 1 WHEN 'weakening' THEN 2
        WHEN 'strengthening' THEN 3 WHEN 'confirmed' THEN 4
        ELSE 5
      END,
      s.statement
  `);

  const rows = result as unknown as QuantSnapshotRow[];

  if (rows.length === 0) return null;

  const snapshots: QuantDailySnapshot[] = rows.map((r) => ({
    id: r.id,
    signalId: r.signal_id,
    signalStatement: r.signal_statement,
    signalType: r.signal_type,
    signalImportance: r.signal_importance,
    snapshotDate: new Date(r.snapshot_date),
    observedValue: r.observed_value ? Number(r.observed_value) : null,
    thresholdValue: r.threshold_value ? Number(r.threshold_value) : null,
    pctToThreshold: r.pct_to_threshold ? Number(r.pct_to_threshold) : null,
    unit: r.unit,
    assessment: r.assessment,
    evidenceSummary: r.evidence_summary,
    dataSource: r.data_source,
    thesisTitle: r.thesis_title,
    thesisType: r.thesis_type,
    thesisId: r.thesis_id,
    ticker: r.ticker,
  }));

  const counts = { strengthening: 0, confirmed: 0, weakening: 0, invalidated: 0, neutral: 0 };
  for (const s of snapshots) {
    const key = s.assessment as keyof typeof counts;
    if (key in counts) counts[key]++;
    else counts.neutral++;
  }

  return { date: dateStr, snapshots, assessmentCounts: counts };
}
