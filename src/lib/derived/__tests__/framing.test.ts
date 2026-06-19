import { describe, it, expect } from 'vitest';
import {
  needsFraming,
  framingDisposition,
  AUTO_RELATED_CONFIDENCE,
} from '../framingRules';

describe('needsFraming', () => {
  it('flags a developing asset thesis with no macro link', () => {
    expect(needsFraming({ status: 'developing', macroLinkCount: 0 })).toBe(true);
  });
  it('flags a monitoring asset thesis with no macro link', () => {
    expect(needsFraming({ status: 'monitoring', macroLinkCount: 0 })).toBe(true);
  });
  it('does not flag one that already has a macro link', () => {
    expect(needsFraming({ status: 'monitoring', macroLinkCount: 1 })).toBe(false);
  });
  it('does not flag closed/draft/resolved theses', () => {
    expect(needsFraming({ status: 'closed', macroLinkCount: 0 })).toBe(false);
    expect(needsFraming({ status: 'draft', macroLinkCount: 0 })).toBe(false);
    expect(needsFraming({ status: 'complete', macroLinkCount: 0 })).toBe(false);
  });
});

describe('framingDisposition', () => {
  it('auto-links a high-confidence related framing (no decision)', () => {
    expect(framingDisposition({ relationshipType: 'related', confidence: AUTO_RELATED_CONFIDENCE })).toBe('auto');
    expect(framingDisposition({ relationshipType: 'related', confidence: 0.9 })).toBe('auto');
  });
  it('raises a decision for a low-confidence related framing', () => {
    expect(framingDisposition({ relationshipType: 'related', confidence: 0.55 })).toBe('decision');
  });
  it('ALWAYS raises a decision for gated_by, even at high confidence', () => {
    expect(framingDisposition({ relationshipType: 'gated_by', confidence: 0.99 })).toBe('decision');
  });
  it('skips when there is no genuine relation or below the floor', () => {
    expect(framingDisposition({ relationshipType: 'none', confidence: 0.9 })).toBe('skip');
    expect(framingDisposition({ relationshipType: 'related', confidence: 0.3 })).toBe('skip');
  });
  it('honours a custom minConfidence for the related auto bar', () => {
    expect(framingDisposition({ relationshipType: 'related', confidence: 0.6, minConfidence: 0.5 })).toBe('auto');
    expect(framingDisposition({ relationshipType: 'related', confidence: 0.6, minConfidence: 0.8 })).toBe('decision');
  });
});
