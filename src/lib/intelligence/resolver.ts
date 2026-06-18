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

import { and, eq, inArray, notInArray } from 'drizzle-orm';
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
  matchSource?: 'ticker' | 'sector'; // how this thesis was matched
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
 * Resolve tickers (and optionally text) to the full belief hierarchy.
 * Returns all non-terminal theses (developing, monitoring) and their linked signals/strategies.
 *
 * When `text` is provided, also matches macro theses by sector/theme/title keywords,
 * catching broad thematic theses that have no direct ticker linkage.
 */
export async function resolveRelevanceContext(
  tickers: string[],
  dbInstance?: typeof db,
  text?: string,
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

  if (upperTickers.length === 0 && !text) return empty;

  // Step 1: Tickers → underlyings → asset theses (non-terminal)
  const resolvedAssetTheses: ResolvedThesis[] = [];
  const tickerMap: Record<string, string> = {};
  const assetThesisIds: string[] = [];

  if (upperTickers.length > 0) {
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

    for (const row of atRows) {
      if (!row.atId || !['developing', 'monitoring'].includes(row.atStatus ?? '')) continue;
      resolvedAssetTheses.push({
        id: row.atId,
        title: row.atTitle ?? '',
        type: 'asset',
        status: row.atStatus ?? 'developing',
        direction: row.atDirection,
        ticker: row.ticker,
        matchSource: 'ticker',
      });
      tickerMap[row.atId] = row.ticker;
      assetThesisIds.push(row.atId);
    }
  }

  // Step 2: Asset theses → macro theses (via junction, non-terminal)
  const resolvedMacroTheses: ResolvedThesis[] = [];
  const seenMacroIds = new Set<string>();

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

    for (const row of macroLinks) {
      if (!['developing', 'monitoring'].includes(row.macroStatus ?? '') || seenMacroIds.has(row.macroId)) continue;
      seenMacroIds.add(row.macroId);
      resolvedMacroTheses.push({
        id: row.macroId,
        title: row.macroTitle ?? '',
        type: 'macro',
        status: row.macroStatus ?? 'developing',
        direction: row.macroDirection,
        sectors: row.macroSectors,
        matchSource: 'ticker',
      });
    }
  }

  // Step 2b: Text-based macro thesis matching (sector/theme/title keywords)
  if (text) {
    const lowerText = text.toLowerCase();

    // Query all non-terminal macro theses not already found via ticker path
    const candidateFilter = seenMacroIds.size > 0
      ? notInArray(macroTheses.id, Array.from(seenMacroIds))
      : undefined;

    const candidates = await d
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        direction: macroTheses.direction,
        sectors: macroTheses.sectors,
        themes: macroTheses.themes,
      })
      .from(macroTheses)
      .where(
        candidateFilter
          ? and(
              inArray(macroTheses.status, ['developing', 'monitoring']),
              candidateFilter,
            )
          : inArray(macroTheses.status, ['developing', 'monitoring']),
      );

    for (const row of candidates) {
      const matchTerms: string[] = [];

      // Collect sectors
      if (row.sectors && Array.isArray(row.sectors)) {
        matchTerms.push(...row.sectors);
      }

      // Collect themes
      if (row.themes && Array.isArray(row.themes)) {
        matchTerms.push(...row.themes);
      }

      // Collect title words > 4 characters
      if (row.title) {
        const titleWords = row.title.split(/\s+/).filter(w => w.length > 4);
        matchTerms.push(...titleWords);
      }

      // Check if any term appears in the text (case-insensitive)
      const matched = matchTerms.some(term => lowerText.includes(term.toLowerCase()));

      if (matched) {
        seenMacroIds.add(row.id);
        resolvedMacroTheses.push({
          id: row.id,
          title: row.title ?? '',
          type: 'macro',
          status: row.status ?? 'developing',
          direction: row.direction,
          sectors: row.sectors,
          matchSource: 'sector',
        });
      }
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
        and(
          eq(signals.status, 'active'),
          inArray(signalEntityLinks.thesisId, allThesisIds),
        ),
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
