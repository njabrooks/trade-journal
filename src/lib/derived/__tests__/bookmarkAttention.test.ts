import { describe, it, expect } from 'vitest';
import {
  scoreAttention,
  decayWeight,
  ATTENTION_WINDOW_DAYS,
  ATTENTION_STRONG_SCORE,
  type AttentionItem,
} from '../bookmarkAttentionRules.js';

const NOW = new Date('2026-06-25T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function item(significance: 'notable' | 'material', ageDays: number): AttentionItem {
  return { significance, observedAt: daysAgo(ageDays), statement: `${significance} @ ${ageDays}d`, sourceUrl: null };
}

describe('decayWeight', () => {
  it('is 1 today (and for tiny future skew), 0.5 at half-window, 0 at/after the window edge', () => {
    expect(decayWeight(0)).toBe(1);
    expect(decayWeight(-3)).toBe(1);
    expect(decayWeight(ATTENTION_WINDOW_DAYS / 2)).toBeCloseTo(0.5, 5);
    expect(decayWeight(ATTENTION_WINDOW_DAYS)).toBe(0);
    expect(decayWeight(ATTENTION_WINDOW_DAYS + 30)).toBe(0);
  });
});

describe('scoreAttention', () => {
  it('returns an empty, non-strong summary for no items', () => {
    const s = scoreAttention([], NOW);
    expect(s).toMatchObject({ score: 0, total: 0, materialCount: 0, notableCount: 0, strong: false });
    expect(s.detail).toBe('no recent bookmark attention');
    expect(s.recent).toEqual([]);
  });

  it('one fresh material bookmark scores 2 and is strong (judgment-graded, not count)', () => {
    const s = scoreAttention([item('material', 0)], NOW);
    expect(s.score).toBe(2);
    expect(s.materialCount).toBe(1);
    expect(s.strong).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(ATTENTION_STRONG_SCORE);
  });

  it('one fresh notable bookmark scores 1 and is NOT strong', () => {
    const s = scoreAttention([item('notable', 0)], NOW);
    expect(s.score).toBe(1);
    expect(s.notableCount).toBe(1);
    expect(s.strong).toBe(false);
  });

  it('two fresh notables reach the strong threshold (sustained attention)', () => {
    const s = scoreAttention([item('notable', 0), item('notable', 1)], NOW);
    expect(s.score).toBeGreaterThanOrEqual(ATTENTION_STRONG_SCORE);
    expect(s.strong).toBe(true);
  });

  it('decays with age: a material at half-window scores ~1 and is no longer strong', () => {
    const s = scoreAttention([item('material', ATTENTION_WINDOW_DAYS / 2)], NOW);
    expect(s.score).toBeCloseTo(1, 5);
    expect(s.strong).toBe(false);
  });

  it('excludes items older than the window entirely', () => {
    const s = scoreAttention([item('material', ATTENTION_WINDOW_DAYS + 5)], NOW);
    expect(s.total).toBe(0);
    expect(s.score).toBe(0);
    expect(s.strong).toBe(false);
  });

  it('lists the most-recent items first, capped at 5', () => {
    const items = Array.from({ length: 7 }, (_, i) => item('notable', i)); // 0..6 days ago
    const s = scoreAttention(items, NOW);
    expect(s.recent).toHaveLength(5);
    expect(s.recent[0].observedAt).toBe(daysAgo(0).toISOString());
    expect(s.recent[4].observedAt).toBe(daysAgo(4).toISOString());
  });

  it('counts material vs notable within the window and renders a material count in the detail', () => {
    const s = scoreAttention([item('material', 2), item('notable', 3), item('material', 70)], NOW);
    expect(s.materialCount).toBe(1); // the 70d-old material is out of window
    expect(s.notableCount).toBe(1);
    expect(s.total).toBe(2);
    expect(s.detail).toContain('1 material');
  });
});
