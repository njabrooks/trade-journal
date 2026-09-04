import { describe, expect, it } from 'vitest';
import {
  classifyFlexFailure,
  isFlexStatementNotReady,
} from '../src/lib/ingestion/flex/dailyHealth';

describe('Flex daily health semantics', () => {
  it('recognises an unpublished statement as an expected polling outcome', () => {
    const error = 'Flex API error: Statement could not be generated at this time. Please try again shortly.';

    expect(isFlexStatementNotReady(error)).toBe(true);
    expect(classifyFlexFailure(error, false)).toBe('expected');
  });

  it('treats later failures as expected after a daily capture', () => {
    expect(classifyFlexFailure('Flex API error: Too many requests', true)).toBe('expected');
  });

  it('keeps an uncovered non-publication failure actionable', () => {
    expect(classifyFlexFailure('Network error connecting to Flex API', false)).toBe('failed');
  });
});
