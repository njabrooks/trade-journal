import { describe, it, expect } from 'vitest';
import {
  normalizeStatement,
  findDuplicateCandidate,
  type ExistingCandidate,
} from '../candidateSignals.js';

describe('normalizeStatement', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeStatement('Galaxy Digital $GLXY data-center build-out!')).toBe(
      'galaxy digital glxy datacenter buildout',
    );
  });

  it('treats punctuation-only differences as equal', () => {
    expect(normalizeStatement('GLXY: McGregor, TX data center')).toBe(
      normalizeStatement('glxy mcgregor tx data center'),
    );
  });

  it('returns empty string for blank / punctuation-only input', () => {
    expect(normalizeStatement('   ')).toBe('');
    expect(normalizeStatement('!!! ...')).toBe('');
  });

  it('STRIPS punctuation (does not replace with space), so a hyphen joins its words', () => {
    // Load-bearing: this is observe's existing dedup behavior — keep it identical.
    expect(normalizeStatement('data-center')).toBe('datacenter');
    expect(normalizeStatement('data-center')).not.toBe(normalizeStatement('data center'));
  });
});

describe('findDuplicateCandidate', () => {
  const existing: ExistingCandidate[] = [
    { id: 'a', occurrenceCount: 1, statement: 'GLXY data center capacity expanding' },
    { id: 'b', occurrenceCount: 3, statement: 'Stablecoin supply growth accelerating' },
  ];

  it('matches on normalized statement despite case and trailing-punctuation differences', () => {
    const dupe = findDuplicateCandidate(existing, 'glxy data center capacity expanding!');
    expect(dupe?.id).toBe('a');
    expect(dupe?.occurrenceCount).toBe(1);
  });

  it('returns null when no existing candidate normalizes equal', () => {
    expect(findDuplicateCandidate(existing, 'NVDA Blackwell demand exceeds supply')).toBeNull();
  });

  it('returns null for a blank proposed statement (never bumps on empty)', () => {
    expect(findDuplicateCandidate(existing, '   ')).toBeNull();
  });

  it('returns null against an empty existing set', () => {
    expect(findDuplicateCandidate([], 'anything at all')).toBeNull();
  });

  it('ignores existing rows with empty stored statements', () => {
    const withBlank: ExistingCandidate[] = [{ id: 'z', occurrenceCount: 1, statement: '' }];
    expect(findDuplicateCandidate(withBlank, 'real proposed statement')).toBeNull();
  });
});
