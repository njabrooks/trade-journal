/**
 * Core intelligence evaluation — lifecycle-aware routing.
 *
 * For each intel item:
 * 1. Resolve tickers to belief hierarchy
 * 2. For ALL matched theses: write contextual intel link
 * 3. For MONITORING theses: score against signals → write signal evidence
 * 4. For DEVELOPING theses with rich content: log claim candidate to the journal
 */

import { eq, and, inArray } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  intelItems,
  signalDataSnapshots,
  journalEntries,
  underlyings,
  assetTheses,
  type IntelItem,
} from '../../db/schema.js';
import { resolveRelevanceContext, type RelevanceContext, type ResolvedSignal } from './resolver.js';
import { scoreContentAgainstSignal, hasNeutralIndicators, type ContentForScoring } from './scoring.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvaluationAction =
  | { type: 'signal_evidence'; signalId: string; thesisId: string; thesisType: string; assessment: string; evidenceSummary: string }
  | { type: 'contextual'; thesisId: string; thesisType: string }
  | { type: 'claim_candidate'; thesisIds: string[] }
  | { type: 'skipped'; reason: string };

export interface EvaluationResult {
  atomId: string;
  processingResult: 'signal_evidence' | 'contextual' | 'claim_candidate' | null;
  actions: EvaluationAction[];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a single intel item against the belief hierarchy.
 * Returns the actions to take (does not write to DB — caller handles that).
 */
export async function evaluateIntelItem(
  item: IntelItem,
  dbInstance?: typeof defaultDb,
): Promise<EvaluationResult> {
  const d = dbInstance ?? defaultDb;
  const tickers = item.tickers ?? [];

  // 1. Resolve tickers (and text) to belief hierarchy
  const itemText = `${item.headline} ${item.body ?? ''}`;
  const context = await resolveRelevanceContext(tickers, d, itemText);

  if (context.allTheses.length === 0) {
    return {
      atomId: item.id,
      processingResult: null,
      actions: [{ type: 'skipped', reason: 'no relevant theses' }],
    };
  }

  const actions: EvaluationAction[] = [];
  const content: ContentForScoring = {
    text: `${item.headline} ${item.body ?? ''}`,
    tickers,
  };

  // 2. Contextual intel for ALL matched theses (both phases)
  for (const thesis of context.allTheses) {
    actions.push({
      type: 'contextual',
      thesisId: thesis.id,
      thesisType: thesis.type,
    });
  }

  // 3. Signal evidence for MONITORING theses
  const monitoringTheses = context.allTheses.filter(t => t.status === 'monitoring');
  const monitoringThesisIds = new Set(monitoringTheses.map(t => t.id));
  const monitoringSignals = context.signals.filter(s => monitoringThesisIds.has(s.thesisId));

  for (const signal of monitoringSignals) {
    const thesisTicker = context.tickerMap[signal.thesisId] ?? null;
    const parentThesis = context.allTheses.find(t => t.id === signal.thesisId);
    const sectorMatched = parentThesis?.matchSource === 'sector';
    const score = scoreContentAgainstSignal(content, signal, thesisTicker, sectorMatched);

    if (score > 0) {
      const assessment = assessFromHeuristic(item.headline, item.body, signal.type, score);
      const evidenceSummary = buildEvidenceSummary(item, signal, assessment);

      actions.push({
        type: 'signal_evidence',
        signalId: signal.id,
        thesisId: signal.thesisId,
        thesisType: signal.thesisType,
        assessment,
        evidenceSummary,
      });
    }
  }

  // 4. Claim candidate for DEVELOPING theses (rich content only)
  const developingTheses = context.allTheses.filter(t => t.status === 'developing');
  if (developingTheses.length > 0 && item.body && item.body.length > 300) {
    actions.push({
      type: 'claim_candidate',
      thesisIds: developingTheses.map(t => t.id),
    });
  }

  // Determine primary result
  const hasSignalEvidence = actions.some(a => a.type === 'signal_evidence');
  const hasClaimCandidate = actions.some(a => a.type === 'claim_candidate');
  const processingResult = hasSignalEvidence
    ? 'signal_evidence' as const
    : hasClaimCandidate
    ? 'claim_candidate' as const
    : 'contextual' as const;

  return { atomId: item.id, processingResult, actions };
}

/**
 * Evaluate and persist results for a batch of pending intel items.
 */
export async function evaluatePendingIntelItems(
  limit: number = 100,
  dbInstance?: typeof defaultDb,
): Promise<{ processed: number; signalEvidence: number; contextual: number; claimCandidates: number; skipped: number }> {
  const d = dbInstance ?? defaultDb;

  // Fetch pending items
  const pending = await d
    .select()
    .from(intelItems)
    .where(eq(intelItems.processingStatus, 'pending'))
    .orderBy(intelItems.occurredAt)
    .limit(limit);

  // Pre-load all tickers that have non-terminal asset theses
  const trackedTickers = await d
    .selectDistinct({ ticker: underlyings.ticker })
    .from(underlyings)
    .innerJoin(assetTheses, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(assetTheses.status, ['developing', 'monitoring']));

  const trackedTickerSet = new Set(trackedTickers.map(r => r.ticker.toUpperCase()));

  let signalEvidenceCount = 0;
  let contextualCount = 0;
  let claimCandidateCount = 0;
  let skippedCount = 0;
  let passedFilter = 0;

  for (const item of pending) {
    // Pre-filter: skip items with no tracked tickers AND no headline/body text
    // Items with text may still match macro theses via sector/theme keywords
    const itemTickers = (item.tickers ?? []).map(t => t.toUpperCase());
    const hasRelevantTicker = itemTickers.some(t => trackedTickerSet.has(t));
    const hasText = !!(item.headline || item.body);

    if (!hasRelevantTicker && !hasText) {
      await d.update(intelItems)
        .set({ processingStatus: 'skipped', processedAt: new Date() })
        .where(eq(intelItems.id, item.id));
      skippedCount++;
      continue;
    }

    passedFilter++;
    const result = await evaluateIntelItem(item, d);

    // Write signal evidence snapshots
    const signalActions = result.actions.filter(a => a.type === 'signal_evidence') as Array<Extract<EvaluationAction, { type: 'signal_evidence' }>>;
    if (signalActions.length > 0) {
      // Insert one snapshot per signal, deduped by (signal_id, snapshot_date, data_source)
      for (const a of signalActions) {
        await d.insert(signalDataSnapshots).values({
          signalId: a.signalId,
          snapshotDate: item.occurredAt,
          assessment: a.assessment,
          evidenceSummary: a.evidenceSummary,
          dataSource: 'intelligence_routing',
          status: 'pending',
        }).onConflictDoNothing();
      }
      signalEvidenceCount += signalActions.length;
    }

    // Log claim candidates to the journal (Tier 3 — discoverable for user review)
    const claimActions = result.actions.filter(a => a.type === 'claim_candidate') as Array<Extract<EvaluationAction, { type: 'claim_candidate' }>>;
    if (claimActions.length > 0) {
      // Resolve thesis context for journal entry metadata
      const contextText = `${item.headline} ${item.body ?? ''}`;
      const context = await resolveRelevanceContext(item.tickers ?? [], d, contextText);
      for (const action of claimActions) {
        for (const thesisId of action.thesisIds) {
          const thesis = context.allTheses.find(t => t.id === thesisId);
          if (!thesis) continue;

          await d.insert(journalEntries).values({
            objectType: thesis.type === 'macro' ? 'macro_thesis' : 'asset_thesis',
            objectId: thesisId,
            objectTitle: thesis.title,
            actionType: 'claim_candidate_identified',
            actionDescription: `Intel item may contain claim material for "${thesis.title}": "${item.headline}"`,
            source: 'automation',
            metadata: { intelItemId: item.id, headline: item.headline, sourceKey: item.sourceKey },
          });
          claimCandidateCount++;
        }
      }
    }

    // Update intel item processing status
    if (result.actions.some(a => a.type === 'skipped')) {
      await d.update(intelItems)
        .set({ processingStatus: 'skipped', processedAt: new Date() })
        .where(eq(intelItems.id, item.id));
      skippedCount++;
    } else {
      await d.update(intelItems)
        .set({
          processingStatus: 'processed',
          processingResult: result.processingResult,
          processedAt: new Date(),
        })
        .where(eq(intelItems.id, item.id));
    }

    if (result.processingResult === 'contextual') contextualCount++;
  }

  console.log(`Pre-filter: ${pending.length} items, ${passedFilter} with tracked tickers or text, ${pending.length - passedFilter} skipped`);

  return {
    processed: pending.length,
    signalEvidence: signalEvidenceCount,
    contextual: contextualCount,
    claimCandidates: claimCandidateCount,
    skipped: skippedCount,
  };
}

// ---------------------------------------------------------------------------
// Heuristic assessment
// ---------------------------------------------------------------------------

function assessFromHeuristic(
  headline: string,
  body: string | null | undefined,
  signalType: string,
  score: number,
): string {
  // Low-confidence match — not enough signal overlap to assert direction
  if (score < 3) {
    return 'neutral';
  }

  const text = `${headline} ${body ?? ''}`;
  if (hasNeutralIndicators(text)) {
    return 'neutral';
  }

  // Direction depends on signal type:
  // - confirmation: evidence confirming thesis → strengthening
  // - invalidation: evidence of risk materialising → weakening
  // - completion: thesis playing out → strengthening
  switch (signalType) {
    case 'confirmation':
      return 'strengthening';
    case 'invalidation':
      return 'weakening';
    case 'completion':
      return 'strengthening';
    default:
      return 'strengthening';
  }
}

function buildEvidenceSummary(item: IntelItem, signal: ResolvedSignal, assessment: string): string {
  const source = item.sourceKey.replace(/_/g, ' ');
  const headline = item.headline.length > 150 ? item.headline.slice(0, 150) + '...' : item.headline;
  return `[${source}] ${headline}`;
}
