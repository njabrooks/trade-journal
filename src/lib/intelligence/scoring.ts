/**
 * Shared intelligence scoring module.
 *
 * Extracts the signal-matching algorithm used by:
 * - ingest-world-monitor.ts (generateQualitativeSnapshots)
 * - assess-validation-evidence skill (runtime instructions)
 * - process-inbox skill (runtime instructions)
 *
 * Canonical weights: ticker +3, keyword +1, statement word +0.5
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalForScoring {
  id: string;
  statement: string;
  explicitDetails: unknown;
}

export interface ContentForScoring {
  text: string;
  tickers: string[];
}

export interface ScoredSignal {
  signal: SignalForScoring;
  score: number;
}

export type Assessment = 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated';

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

/**
 * Extract all monitor keywords from a signal's explicit_details config.
 * Handles both top-level `monitorKeywords` and nested `conditions[].monitorKeywords`.
 */
export function extractMonitorKeywords(explicitDetails: unknown): string[] {
  const details = explicitDetails as Record<string, unknown> | null;
  if (!details) return [];

  const keywords: string[] = [];

  if (details.monitorKeywords && Array.isArray(details.monitorKeywords)) {
    keywords.push(...(details.monitorKeywords as string[]));
  }

  if (details.conditions && Array.isArray(details.conditions)) {
    for (const cond of details.conditions as Record<string, unknown>[]) {
      if (cond.monitorKeywords && Array.isArray(cond.monitorKeywords)) {
        keywords.push(...(cond.monitorKeywords as string[]));
      }
    }
  }

  return keywords;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score content against a single signal.
 *
 * Weights:
 * - Ticker match: +3
 * - Keyword match: +1 per keyword
 * - Statement word overlap (words > 4 chars): +0.5 per word
 */
export function scoreContentAgainstSignal(
  content: ContentForScoring,
  signal: SignalForScoring,
  thesisTicker?: string | null,
): number {
  const text = content.text.toLowerCase();
  let score = 0;

  // Ticker match
  if (thesisTicker && content.tickers.some(t => t.toUpperCase() === thesisTicker.toUpperCase())) {
    score += 3;
  }

  // Keyword matches
  const keywords = extractMonitorKeywords(signal.explicitDetails);
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      score += 1;
    }
  }

  // Statement word overlap
  const statementWords = signal.statement
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4);
  for (const word of statementWords) {
    if (text.includes(word)) {
      score += 0.5;
    }
  }

  return score;
}

/**
 * Score content against multiple signals, returning all with score > 0.
 * Sorted by score descending.
 */
export function scoreContentAgainstSignals(
  content: ContentForScoring,
  signals: SignalForScoring[],
  tickerMap: Record<string, string | null>,
  thesisIds?: { thesisId: string; thesisType: string }[],
): ScoredSignal[] {
  const results: ScoredSignal[] = [];

  for (const signal of signals) {
    // Resolve ticker for the signal's thesis
    let thesisTicker: string | null = null;
    if (thesisIds) {
      // Find thesis linked to this signal from the provided context
      for (const { thesisId, thesisType } of thesisIds) {
        if (thesisType === 'asset' && tickerMap[thesisId]) {
          thesisTicker = tickerMap[thesisId];
          break;
        }
      }
    }

    const score = scoreContentAgainstSignal(content, signal, thesisTicker);
    if (score > 0) {
      results.push({ signal, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Find the single best-matching item from a list against a signal.
 * Returns null if no items score above 0.
 */
export function findBestMatch<T extends { id: string }>(
  items: T[],
  toContent: (item: T) => ContentForScoring,
  signal: SignalForScoring,
  thesisTicker?: string | null,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;

  for (const item of items) {
    const content = toContent(item);
    const score = scoreContentAgainstSignal(content, signal, thesisTicker);
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Neutral detection
// ---------------------------------------------------------------------------

const NEUTRAL_INDICATORS = [
  '⚪', 'no evidence', 'no change', 'no new', 'status quo', 'unchanged',
  'no significant', 'no notable', 'no material',
];

/**
 * Check if text contains indicators suggesting neutral/no-evidence assessment.
 */
export function hasNeutralIndicators(text: string): boolean {
  const lower = text.toLowerCase();
  return NEUTRAL_INDICATORS.some(
    pattern => text.includes(pattern) || lower.includes(pattern),
  );
}
