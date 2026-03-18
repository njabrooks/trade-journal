import { desc, eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import {
  signals,
  signalDataSnapshots,
  signalEntityLinks,
  macroTheses,
  assetTheses,
  underlyings,
  strategies,
} from "@/db/schema";

export interface SignalEntityInfo {
  entityType: string;          // 'thesis' | 'strategy'
  thesisId: string | null;
  thesisType: string | null;
  strategyId: string | null;
  entityTitle: string | null;
  entityStatus: string | null;
  strategyKey: string | null;
  positionPct: number | null;
  ticker: string | null;
  entityLink: string | null;   // URL path
}

export interface SignalWithContext {
  id: string;
  type: string;
  statement: string;
  status: string;
  category: string;
  importance: string;
  notes: string | null;
  explicitDetails: unknown;
  createdAt: Date;
  updatedAt: Date;

  // All linked entities
  entities: SignalEntityInfo[];

  // Underlying grouping — union of all linked entities' tickers
  underlyingTickers: string[];

  // Latest quantitative snapshot
  latestObservedValue: string | null;
  latestThresholdValue: string | null;
  latestPctToThreshold: string | null;
  latestUnit: string | null;
  latestQuantDate: Date | null;
  latestQuantSource: string | null;

  // Latest qualitative snapshot
  latestAssessment: string | null;
  latestEvidenceSummary: string | null;
  latestQualDate: Date | null;
}

export interface SignalFilterCounts {
  total: number;
  active: number;
  complete: number;
  draft: number;
  rejected: number;
  macroThesis: number;
  assetThesis: number;
  strategy: number;
  confirmation: number;
  invalidation: number;
  completion: number;
}

export async function getAllSignalsWithContext(): Promise<{
  signals: SignalWithContext[];
  counts: SignalFilterCounts;
}> {
  // 1. Fetch all signals (no entity joins — entities come from junction table)
  const rawSignals = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      status: signals.status,
      category: signals.category,
      importance: signals.importance,
      notes: signals.notes,
      explicitDetails: signals.explicitDetails,
      createdAt: signals.createdAt,
      updatedAt: signals.updatedAt,
    })
    .from(signals)
    .orderBy(desc(signals.updatedAt));

  // 2. Fetch all entity links with context
  const entityLinks = await db.execute<{
    signal_id: string;
    entity_type: string;
    strategy_id: string | null;
    thesis_id: string | null;
    thesis_type: string | null;
    position_pct: number | null;
    strategy_key: string | null;
    strategy_status: string | null;
    macro_title: string | null;
    macro_status: string | null;
    asset_title: string | null;
    asset_status: string | null;
    ticker: string | null;
  }>(sql`
    SELECT
      sel.signal_id,
      sel.entity_type,
      sel.strategy_id,
      sel.thesis_id,
      sel.thesis_type,
      sel.position_pct,
      st.strategy_key,
      st.status as strategy_status,
      mt.title as macro_title,
      mt.status as macro_status,
      at.title as asset_title,
      at.status as asset_status,
      COALESCE(u_at.ticker, u_st.ticker) as ticker
    FROM signal_entity_links sel
    LEFT JOIN strategies st ON sel.strategy_id = st.id
    LEFT JOIN asset_theses sat ON st.asset_thesis_id = sat.id
    LEFT JOIN underlyings u_st ON sat.underlying_id = u_st.id
    LEFT JOIN macro_theses mt ON sel.thesis_type = 'macro' AND sel.thesis_id = mt.id
    LEFT JOIN asset_theses at ON sel.thesis_type = 'asset' AND sel.thesis_id = at.id
    LEFT JOIN underlyings u_at ON at.underlying_id = u_at.id
    ORDER BY sel.signal_id, sel.entity_type
  `);

  // Build entity links map: signal_id → SignalEntityInfo[]
  const entityMap = new Map<string, SignalEntityInfo[]>();
  for (const link of entityLinks) {
    const entities = entityMap.get(link.signal_id) || [];

    let entityTitle: string | null = null;
    let entityStatus: string | null = null;
    let entityLink: string | null = null;

    if (link.entity_type === 'strategy') {
      entityTitle = link.strategy_key;
      entityStatus = link.strategy_status;
      if (link.strategy_id) entityLink = `/strategies/${link.strategy_id}`;
    } else if (link.thesis_type === 'macro') {
      entityTitle = link.macro_title;
      entityStatus = link.macro_status;
      if (link.thesis_id) entityLink = `/macro-theses/${link.thesis_id}`;
    } else if (link.thesis_type === 'asset') {
      entityTitle = link.asset_title;
      entityStatus = link.asset_status;
      if (link.thesis_id) entityLink = `/asset-theses/${link.thesis_id}`;
    }

    entities.push({
      entityType: link.entity_type,
      thesisId: link.thesis_id,
      thesisType: link.thesis_type,
      strategyId: link.strategy_id,
      entityTitle,
      entityStatus,
      strategyKey: link.strategy_key,
      positionPct: link.position_pct,
      ticker: link.ticker,
      entityLink,
    });

    entityMap.set(link.signal_id, entities);
  }

  // 3. Fetch latest quantitative snapshot per signal (DISTINCT ON)
  const latestQuantSnapshots = await db.execute<{
    signal_id: string;
    observed_value: string | null;
    threshold_value: string | null;
    pct_to_threshold: string | null;
    unit: string | null;
    snapshot_date: string;
    data_source: string;
  }>(sql`
    SELECT DISTINCT ON (signal_id)
      signal_id, observed_value, threshold_value, pct_to_threshold, unit, snapshot_date, data_source
    FROM signal_data_snapshots
    WHERE observed_value IS NOT NULL
    ORDER BY signal_id, snapshot_date DESC
  `);

  // 4. Fetch latest qualitative snapshot per signal
  const latestQualSnapshots = await db.execute<{
    signal_id: string;
    assessment: string | null;
    evidence_summary: string | null;
    snapshot_date: string;
  }>(sql`
    SELECT DISTINCT ON (signal_id)
      signal_id, assessment, evidence_summary, snapshot_date
    FROM signal_data_snapshots
    WHERE assessment IS NOT NULL
    ORDER BY signal_id, snapshot_date DESC
  `);

  // 5. Resolve macro thesis → underlying tickers
  const macroUnderlyings = await db.execute<{
    macro_thesis_id: string;
    ticker: string;
  }>(sql`
    SELECT atrm.macro_thesis_id, u.ticker
    FROM asset_thesis_related_macro_theses atrm
    JOIN asset_theses at ON at.id = atrm.asset_thesis_id
    JOIN underlyings u ON u.id = at.underlying_id
  `);
  const macroTickerMap = new Map<string, string[]>();
  for (const r of macroUnderlyings) {
    const existing = macroTickerMap.get(r.macro_thesis_id) || [];
    if (!existing.includes(r.ticker)) existing.push(r.ticker);
    macroTickerMap.set(r.macro_thesis_id, existing);
  }

  // Build snapshot lookup maps
  const quantMap = new Map(latestQuantSnapshots.map(s => [s.signal_id, s]));
  const qualMap = new Map(latestQualSnapshots.map(s => [s.signal_id, s]));

  // 6. Merge
  const merged: SignalWithContext[] = rawSignals.map(s => {
    const quant = quantMap.get(s.id);
    const qual = qualMap.get(s.id);
    const entities = entityMap.get(s.id) || [];

    // Resolve underlying tickers from all linked entities
    const tickerSet = new Set<string>();
    for (const e of entities) {
      if (e.ticker) tickerSet.add(e.ticker);
      // Macro thesis signals: add all linked underlyings
      if (e.thesisType === 'macro' && e.thesisId) {
        const macroTickers = macroTickerMap.get(e.thesisId) || [];
        for (const t of macroTickers) tickerSet.add(t);
      }
    }

    return {
      id: s.id,
      type: s.type,
      statement: s.statement,
      status: s.status,
      category: s.category,
      importance: s.importance,
      notes: s.notes,
      explicitDetails: s.explicitDetails,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      entities,
      underlyingTickers: [...tickerSet].sort(),
      latestObservedValue: quant?.observed_value ?? null,
      latestThresholdValue: quant?.threshold_value ?? null,
      latestPctToThreshold: quant?.pct_to_threshold ?? null,
      latestUnit: quant?.unit ?? null,
      latestQuantDate: quant?.snapshot_date ? new Date(quant.snapshot_date) : null,
      latestQuantSource: quant?.data_source ?? null,
      latestAssessment: qual?.assessment ?? null,
      latestEvidenceSummary: qual?.evidence_summary ?? null,
      latestQualDate: qual?.snapshot_date ? new Date(qual.snapshot_date) : null,
    };
  });

  // 7. Compute counts
  const counts: SignalFilterCounts = {
    total: merged.length,
    active: 0,
    complete: 0,
    draft: 0,
    rejected: 0,
    macroThesis: 0,
    assetThesis: 0,
    strategy: 0,
    confirmation: 0,
    invalidation: 0,
    completion: 0,
  };

  for (const s of merged) {
    if (s.status === 'active') counts.active++;
    else if (s.status === 'complete') counts.complete++;
    else if (s.status === 'draft') counts.draft++;
    else if (s.status === 'rejected') counts.rejected++;

    const hasMacro = s.entities.some(e => e.entityType === 'thesis' && e.thesisType === 'macro');
    const hasAsset = s.entities.some(e => e.entityType === 'thesis' && e.thesisType === 'asset');
    const hasStrategy = s.entities.some(e => e.entityType === 'strategy');
    if (hasMacro) counts.macroThesis++;
    if (hasAsset) counts.assetThesis++;
    if (hasStrategy) counts.strategy++;

    if (s.type === 'confirmation') counts.confirmation++;
    else if (s.type === 'warning') counts.invalidation++;
    else if (s.type === 'completion') counts.completion++;
  }

  return { signals: merged, counts };
}
