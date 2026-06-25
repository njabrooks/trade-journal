/**
 * Bookmark-attention scoring — pure (no DB), unit-tested. docs/v2/17 §5.3B / §6.
 *
 * Phase 3 of the bookmark-attention sensor. A bookmark that relate-bookmark judged to bear
 * on a thesis is recorded as a bookmark-origin `candidate_signal` (Phase 1). This module
 * rolls those up per thesis into an attention summary: a significance-weighted, time-decayed
 * score plus a `strong` flag.
 *
 * The score NEVER raises a decision on its own (docs/v2/17 fork b) — the raiser uses it only
 * to ENRICH and prioritise a re_underwrite_due that claim-delta / signal-quality already
 * triggered. Weight is judgment-graded (material vs notable), not a raw count.
 */

export const ATTENTION_WINDOW_DAYS = 60;
export const SIGNIFICANCE_WEIGHT: Record<Significance, number> = { material: 2, notable: 1 };
/** Decayed score at/above which attention boosts an existing re_underwrite_due to high confidence.
 *  ≈ one recent `material` bookmark (weight 2, so it boosts for ~15d before decaying past the bar),
 *  or two fresh `notable` ones. A lone notable never boosts. */
export const ATTENTION_STRONG_SCORE = 1.5;

const DAY_MS = 86_400_000;

export type Significance = 'notable' | 'material';

export interface AttentionItem {
  significance: Significance;
  observedAt: Date;
  statement: string;
  sourceUrl: string | null;
}

export interface AttentionSummary {
  /** Σ significance-weight × linear time-decay, over items within the window. */
  score: number;
  /** items within the window. */
  total: number;
  materialCount: number;
  notableCount: number;
  /** score ≥ ATTENTION_STRONG_SCORE — the priority-boost flag. */
  strong: boolean;
  /** the most-recent few items, for the decision packet / snapshot. */
  recent: Array<{ statement: string; sourceUrl: string | null; significance: Significance; observedAt: string }>;
  detail: string;
}

/** Linear decay: 1.0 today → 0 at the window edge; nothing older than the window counts. */
export function decayWeight(ageDays: number): number {
  if (ageDays <= 0) return 1; // today / tiny future skew
  if (ageDays >= ATTENTION_WINDOW_DAYS) return 0;
  return 1 - ageDays / ATTENTION_WINDOW_DAYS;
}

/** Roll a thesis's bookmark-attention items into a summary as of `now`. */
export function scoreAttention(items: AttentionItem[], now: Date): AttentionSummary {
  const within = items
    .map((it) => ({ ...it, ageDays: (now.getTime() - it.observedAt.getTime()) / DAY_MS }))
    .filter((it) => it.ageDays < ATTENTION_WINDOW_DAYS && it.ageDays > -1); // window (tolerate minor clock skew)

  let score = 0;
  let materialCount = 0;
  let notableCount = 0;
  for (const it of within) {
    score += SIGNIFICANCE_WEIGHT[it.significance] * decayWeight(it.ageDays);
    if (it.significance === 'material') materialCount++;
    else notableCount++;
  }
  score = Math.round(score * 100) / 100;

  const recent = [...within]
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .slice(0, 5)
    .map((it) => ({
      statement: it.statement,
      sourceUrl: it.sourceUrl,
      significance: it.significance,
      observedAt: it.observedAt.toISOString(),
    }));

  const strong = score >= ATTENTION_STRONG_SCORE;
  const spanDays = within.length
    ? Math.max(1, Math.round(Math.max(...within.map((i) => i.ageDays)) - Math.min(...within.map((i) => i.ageDays))))
    : 0;
  const detail = within.length === 0
    ? 'no recent bookmark attention'
    : `${within.length} bookmark${within.length === 1 ? '' : 's'} bear${within.length === 1 ? 's' : ''} on this thesis (${materialCount} material) over ~${spanDays}d — user attention${strong ? ' rising' : ''}`;

  return { score, total: within.length, materialCount, notableCount, strong, recent, detail };
}
