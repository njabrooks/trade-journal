import { describe, it, expect } from 'vitest';
import { deriveEpisodes, type StatusPoint } from '../thesisEpisodeRules';

const p = (at: string, status: string): StatusPoint => ({ at, status });

describe('deriveEpisodes', () => {
  it('returns no episodes for an empty timeline', () => {
    expect(deriveEpisodes([])).toEqual([]);
  });

  it('a timeline that never reaches monitoring yields no episodes', () => {
    expect(deriveEpisodes([p('t1', 'draft'), p('t2', 'developing')])).toEqual([]);
  });

  it('currently-monitoring thesis → one open episode', () => {
    expect(deriveEpisodes([p('t1', 'developing'), p('t2', 'monitoring')])).toEqual([
      { episodeNo: 1, openedAt: 't2', closedAt: null, closingStatus: null },
    ]);
  });

  it('developing → monitoring → closed → one closed episode', () => {
    expect(deriveEpisodes([p('t1', 'developing'), p('t2', 'monitoring'), p('t3', 'closed')])).toEqual([
      { episodeNo: 1, openedAt: 't2', closedAt: 't3', closingStatus: 'closed' },
    ]);
  });

  it('monitoring → complete (direct terminal) → one closed episode, closingStatus complete', () => {
    expect(deriveEpisodes([p('t1', 'monitoring'), p('t2', 'complete')])).toEqual([
      { episodeNo: 1, openedAt: 't1', closedAt: 't2', closingStatus: 'complete' },
    ]);
  });

  it('monitoring → rejected → closingStatus rejected', () => {
    expect(deriveEpisodes([p('t1', 'monitoring'), p('t2', 'rejected')])[0].closingStatus).toBe('rejected');
  });

  it('close then re-express (still open) → episode 1 closed, episode 2 open', () => {
    expect(deriveEpisodes([p('t1', 'monitoring'), p('t2', 'closed'), p('t3', 'monitoring')])).toEqual([
      { episodeNo: 1, openedAt: 't1', closedAt: 't2', closingStatus: 'closed' },
      { episodeNo: 2, openedAt: 't3', closedAt: null, closingStatus: null },
    ]);
  });

  it('two full holding periods → two closed episodes', () => {
    const eps = deriveEpisodes([
      p('t1', 'monitoring'), p('t2', 'closed'),
      p('t3', 'monitoring'), p('t4', 'closed'),
    ]);
    expect(eps.map((e) => [e.episodeNo, e.openedAt, e.closedAt])).toEqual([
      [1, 't1', 't2'],
      [2, 't3', 't4'],
    ]);
  });

  it('flicker: monitoring → developing (no resolution) is dropped (§4 lean ⑦)', () => {
    expect(deriveEpisodes([p('t1', 'developing'), p('t2', 'monitoring'), p('t3', 'developing')])).toEqual([]);
  });

  it('flicker then a real episode → only the real one counts, numbered 1', () => {
    expect(
      deriveEpisodes([
        p('t1', 'monitoring'), p('t2', 'developing'), // flap — dropped
        p('t3', 'monitoring'), p('t4', 'closed'), // real episode
      ]),
    ).toEqual([{ episodeNo: 1, openedAt: 't3', closedAt: 't4', closingStatus: 'closed' }]);
  });

  it('idempotent re-entry: repeated monitoring entries collapse to one open span', () => {
    expect(deriveEpisodes([p('t1', 'monitoring'), p('t2', 'monitoring'), p('t3', 'closed')])).toEqual([
      { episodeNo: 1, openedAt: 't1', closedAt: 't3', closingStatus: 'closed' },
    ]);
  });

  it('monitoring → closed → complete: episode closes at `closed`; the later terminal adds no episode', () => {
    expect(deriveEpisodes([p('t1', 'monitoring'), p('t2', 'closed'), p('t3', 'complete')])).toEqual([
      { episodeNo: 1, openedAt: 't1', closedAt: 't2', closingStatus: 'closed' },
    ]);
  });
});
