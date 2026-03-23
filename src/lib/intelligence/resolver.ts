/**
 * Relevance resolver: maps tickers/sectors to the belief hierarchy.
 *
 * Given tickers (and optionally sectors), resolves to:
 * - Asset theses (via underlyings)
 * - Macro theses (via asset_thesis_related_macro_theses + sector matching)
 * - Signals (via signal_entity_links)
 * - Strategies (via strategies.asset_thesis_id)
 *
 * Each thesis includes its lifecycle phase (developing/monitoring) for routing.
 */

import { eq, inArray, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  underlyings,
  assetTheses,
  macroTheses,
  strategies,
  signals,
  signalEntityLinks,
  assetThesisRelatedMacroTheses,
} from '../../db/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedThesis {
  id: string;
  title: string;
  type: 'macro' | 'asset';
  status: string; // 'developing' | 'monitoring' | 'draft' | 'complete' | 'rejected'
  direction?: string | null;
  ticker?: string | null; // only for asset theses
  sectors?: string[] | null; // only for macro theses
}

export interface ResolvedSignal {
  id: string;
  statement: string;
  type: string; // 'confirmation' | 'invalidation' | 'completion'
  importance: string | null;
  category: string | null;
  explicitDetails: unknown;
  thesisId: string;
  thesisType: string;
}

export interface ResolvedStrategy {
  id: string;
  strategyKey: string | null;
  status: string;
}

export interface RelevanceContext {
  assetTheses: ResolvedThesis[];
  macroTheses: ResolvedThesis[];
  signals: ResolvedSignal[];
  strategies: ResolvedStrategy[];
  /** All theses combined for convenience */
  allTheses: ResolvedThesis[];
  /** Ticker → thesis ID map for scoring */
  tickerMap: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve tickers to the full belief hierarchy.
 * Returns all non-terminal theses (developing, monitoring) and their linked signals/strategies.
 */
export async function resolveRelevanceContext(
  tickers: string[],
  dbInstance?: typeof db,
): Promise<RelevanceContext> {
  const d = dbInstance ?? db;
  const upperTickers = tickers.map(t => t.toUpperCase()).filter(Boolean);

  const empty: RelevanceContext = {
    assetTheses: [],
    macroTheses: [],
    signals: [],
    strategies: [],
    allTheses: [],
    tickerMap: {},
  };

  if (upperTickers.length === 0) return empty;

  // Step 1: Tickers → underlyings → asset theses (non-terminal)
  const atRows = await d
    .select({
      ticker: underlyings.ticker,
      atId: assetTheses.id,
      atTitle: assetTheses.title,
      atStatus: assetTheses.status,
      atDirection: assetTheses.direction,
    })
    .from(underlyings)
    .innerJoin(assetTheses, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(underlyings.ticker, upperTickers));

  const resolvedAssetTheses: ResolvedThesis[] = [];
  const tickerMap: Record<string, string> = {};
  const assetThesisIds: string[] = [];

  for (const row of atRows) {
    if (!row.atId || !['developing', 'monitoring'].includes(row.atStatus ?? '')) continue;
    resolvedAssetTheses.push({
      id: row.atId,
      title: row.atTitle ?? '',
      type: 'asset',
      status: row.atStatus ?? 'developing',
      direction: row.atDirection,
      ticker: row.ticker,
    });
    tickerMap[row.atId] = row.ticker;
    assetThesisIds.push(row.atId);
  }

  // Step 2: Asset theses → macro theses (via junction, non-terminal)
  const resolvedMacroTheses: ResolvedThesis[] = [];
  if (assetThesisIds.length > 0) {
    const macroLinks = await d
      .select({
        macroId: macroTheses.id,
        macroTitle: macroTheses.title,
        macroStatus: macroTheses.status,
        macroDirection: macroTheses.direction,
        macroSectors: macroTheses.sectors,
      })
      .from(assetThesisRelatedMacroTheses)
      .innerJoin(macroTheses, eq(macroTheses.id, assetThesisRelatedMacroTheses.macroThesisId))
      .where(inArray(assetThesisRelatedMacroTheses.assetThesisId, assetThesisIds));

    const seen = new Set<string>();
    for (const row of macroLinks) {
      if (!['developing', 'monitoring'].includes(row.macroStatus ?? '') || seen.has(row.macroId)) continue;
      seen.add(row.macroId);
      resolvedMacroTheses.push({
        id: row.macroId,
        title: row.macroTitle ?? '',
        type: 'macro',
        status: row.macroStatus ?? 'developing',
        direction: row.macroDirection,
        sectors: row.macroSectors,
      });
    }
  }

  const allTheses = [...resolvedAssetTheses, ...resolvedMacroTheses];
  const allThesisIds = allTheses.map(t => t.id);

  // Step 3: Theses → signals (via signal_entity_links, active only)
  const resolvedSignals: ResolvedSignal[] = [];
  if (allThesisIds.length > 0) {
    const signalRows = await d
      .select({
        signalId: signals.id,
        statement: signals.statement,
        signalType: signals.type,
        importance: signals.importance,
        category: signals.category,
        explicitDetails: signals.explicitDetails,
        thesisId: signalEntityLinks.thesisId,
        thesisType: signalEntityLinks.thesisType,
      })
      .from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(
        or(
          inArray(signalEntityLinks.thesisId, allThesisIds),
        )
      );

    for (const row of signalRows) {
      if (!row.signalId || !row.thesisId) continue;
      resolvedSignals.push({
        id: row.signalId,
        statement: row.statement ?? '',
        type: row.signalType ?? 'confirmation',
        importance: row.importance,
        category: row.category,
        explicitDetails: row.explicitDetails,
        thesisId: row.thesisId,
        thesisType: row.thesisType ?? 'asset',
      });
    }
  }

  // Step 4: Asset theses → strategies (non-terminal)
  const resolvedStrategies: ResolvedStrategy[] = [];
  if (assetThesisIds.length > 0) {
    const stratRows = await d
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        status: strategies.status,
      })
      .from(strategies)
      .where(inArray(strategies.assetThesisId, assetThesisIds));

    for (const row of stratRows) {
      if (row.status === 'complete' || row.status === 'rejected') continue;
      resolvedStrategies.push({
        id: row.id,
        strategyKey: row.strategyKey,
        status: row.status ?? 'active',
      });
    }
  }

  return {
    assetTheses: resolvedAssetTheses,
    macroTheses: resolvedMacroTheses,
    signals: resolvedSignals,
    strategies: resolvedStrategies,
    allTheses,
    tickerMap,
  };
}
