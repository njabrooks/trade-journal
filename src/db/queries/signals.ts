import { desc, eq, sql, and, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  signals,
  signalDataSnapshots,
  macroTheses,
  assetTheses,
  underlyings,
  strategies,
} from "@/db/schema";

export interface SignalWithContext {
  id: string;
  entityType: string;
  type: string;
  statement: string;
  status: string;
  category: string;
  importance: string;
  notes: string | null;
  explicitDetails: unknown;
  thesisId: string | null;
  thesisType: string | null;
  strategyId: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Entity context
  entityTitle: string | null;
  entityStatus: string | null;
  ticker: string | null;
  strategyKey: string | null;

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
  thesis: number;
  strategy: number;
  confirmation: number;
  invalidation: number;
  completion: number;
}

export async function getAllSignalsWithContext(): Promise<{
  signals: SignalWithContext[];
  counts: SignalFilterCounts;
}> {
  // 1. Fetch all signals with entity joins
  const rawSignals = await db
    .select({
      id: signals.id,
      entityType: signals.entityType,
      type: signals.type,
      statement: signals.statement,
      status: signals.status,
      category: signals.category,
      importance: signals.importance,
      notes: signals.notes,
      explicitDetails: signals.explicitDetails,
      thesisId: signals.thesisId,
      thesisType: signals.thesisType,
      strategyId: signals.strategyId,
      createdAt: signals.createdAt,
      updatedAt: signals.updatedAt,
      // Macro thesis context
      macroTitle: macroTheses.title,
      macroStatus: macroTheses.status,
      // Asset thesis context
      assetTitle: assetTheses.title,
      assetStatus: assetTheses.status,
      // Underlying ticker (via asset thesis)
      ticker: underlyings.ticker,
      // Strategy context
      strategyKey: strategies.strategyKey,
      strategyStatus: strategies.status,
      strategyDirection: strategies.direction,
    })
    .from(signals)
    .leftJoin(macroTheses, and(
      eq(signals.thesisType, 'macro'),
      eq(signals.thesisId, macroTheses.id),
    ))
    .leftJoin(assetTheses, and(
      eq(signals.thesisType, 'asset'),
      eq(signals.thesisId, assetTheses.id),
    ))
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .leftJoin(strategies, eq(signals.strategyId, strategies.id))
    .orderBy(
      desc(signals.updatedAt),
    );

  // 2. Fetch latest quantitative snapshot per signal (DISTINCT ON)
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

  // 3. Fetch latest qualitative snapshot per signal
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

  // Build lookup maps
  const quantMap = new Map(latestQuantSnapshots.map(s => [s.signal_id, s]));
  const qualMap = new Map(latestQualSnapshots.map(s => [s.signal_id, s]));

  // 4. Merge
  const merged: SignalWithContext[] = rawSignals.map(s => {
    const quant = quantMap.get(s.id);
    const qual = qualMap.get(s.id);

    // Determine entity title
    let entityTitle: string | null = null;
    let entityStatus: string | null = null;
    if (s.entityType === 'strategy') {
      entityTitle = s.strategyKey;
      entityStatus = s.strategyStatus;
    } else if (s.thesisType === 'macro') {
      entityTitle = s.macroTitle;
      entityStatus = s.macroStatus;
    } else if (s.thesisType === 'asset') {
      entityTitle = s.assetTitle;
      entityStatus = s.assetStatus;
    }

    // For strategy signals, get ticker from the strategy's asset thesis
    let ticker = s.ticker;
    if (!ticker && s.entityType === 'strategy' && s.strategyKey) {
      // Extract ticker hint from strategy key (e.g., "GLXY-STK" → "GLXY")
      const parts = s.strategyKey.split(/[-_ ]/);
      if (parts.length > 0) ticker = parts[0];
    }

    return {
      id: s.id,
      entityType: s.entityType,
      type: s.type,
      statement: s.statement,
      status: s.status,
      category: s.category,
      importance: s.importance,
      notes: s.notes,
      explicitDetails: s.explicitDetails,
      thesisId: s.thesisId,
      thesisType: s.thesisType,
      strategyId: s.strategyId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      entityTitle,
      entityStatus,
      ticker,
      strategyKey: s.strategyKey,
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

  // 5. Compute counts
  const counts: SignalFilterCounts = {
    total: merged.length,
    active: 0,
    complete: 0,
    draft: 0,
    rejected: 0,
    thesis: 0,
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

    if (s.entityType === 'thesis') counts.thesis++;
    else if (s.entityType === 'strategy') counts.strategy++;

    if (s.type === 'confirmation') counts.confirmation++;
    else if (s.type === 'warning') counts.invalidation++;
    else if (s.type === 'completion') counts.completion++;
  }

  return { signals: merged, counts };
}
