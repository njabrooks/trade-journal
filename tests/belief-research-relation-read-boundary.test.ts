import { describe, expect, it } from 'vitest';
import {
  prepareBeliefResearchRelationContext,
  validatePreparedBeliefResearchRelationContext,
  type BeliefResearchRelationReadRepository,
} from '../src/lib/intelligence/beliefResearchRelationReadBoundary.js';

const INSIGHT_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_ID = '33333333-3333-4333-8333-333333333333';
const THESIS_ID = '44444444-4444-4444-8444-444444444444';

function repository(
  overrides: Partial<BeliefResearchRelationReadRepository> = {},
): BeliefResearchRelationReadRepository {
  return {
    async loadSource() {
      return {
        insightId: INSIGHT_ID,
        artifactId: '11111111-1111-4111-8111-111111111111',
        title: 'Semiconductor capital intensity', sourceType: 'article',
        sourceUrl: 'https://example.test/source', rawContent: 'Immutable Notes-owned bytes.',
        metadata: { origin: 'tana-pipeline', tana_content_node_id: 'node-1' },
        observedAt: '2026-08-08T09:30:00.000Z',
        claimsStructure: { main_claims: [{
          id: 'claim-1', title: 'Foundry scarcity', category: 'asset_specific',
          claim: 'Leading-edge foundry capacity remains constrained.',
          evidence: ['Capacity is pre-committed.'], reasoning: 'Long construction lead times.',
          backing: 'Foundry schedules.', qualifier: 'medium',
          rebuttal: ['Demand could fall.'], time_horizon: 'medium_term', relevant_tickers: ['TSM'],
        }] },
      };
    },
    async loadMainClaims() {
      return [{
        id: CLAIM_ID, title: 'Foundry scarcity', category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains constrained.', status: 'complete',
        sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-1',
      }];
    },
    async loadActiveTheses() {
      return [{
        id: THESIS_ID, type: 'asset', title: 'TSM pricing power',
        description: 'Scarcity sustains pricing.', direction: 'bullish', status: 'developing', ticker: 'TSM',
        argument: {
          source: 'latest_articulation',
          coreArgument: 'TSM retains pricing power while leading-edge capacity is scarce.',
          keyDrivers: ['Capacity reservations exceed supply.'],
          keyAssumptions: ['Demand persists.'],
        },
      }];
    },
    async loadExistingRelationships() { return []; },
    ...overrides,
  };
}

describe('belief-research relation repository read boundary', () => {
  it('performs only approved reads and binds the exact Notes and thesis-argument bytes', async () => {
    const calls: string[] = [];
    const repo = repository({
      async loadSource(id) { calls.push(`source:${id}`); return repository().loadSource(id); },
      async loadMainClaims(source) { calls.push(`claims:${source.insightId}`); return repository().loadMainClaims(source); },
      async loadActiveTheses() { calls.push('theses'); return repository().loadActiveTheses(); },
      async loadExistingRelationships(ids) { calls.push(`relationships:${ids.join(',')}`); return []; },
    });

    const prepared = await prepareBeliefResearchRelationContext(INSIGHT_ID, repo);
    expect(prepared).toMatchObject({
      contractVersion: '1.0.0', status: 'ready', context: {
        source: { authority: 'scope:notes', insightId: INSIGHT_ID },
        sourceEvidence: [{ sourceClaimId: 'claim-1', qualifier: 'medium', rebuttal: ['Demand could fall.'] }],
        claimResolutions: [{ disposition: 'reuse_exact_provenance', mainClaimId: CLAIM_ID }],
        thesisTargets: [{ id: THESIS_ID, status: 'developing', argument: { digest: expect.stringMatching(/^sha256:/) } }],
      },
    });
    if (prepared.status !== 'ready') throw new Error('expected ready fixture');
    expect(validatePreparedBeliefResearchRelationContext(prepared)).toEqual(prepared.context);
    expect(() => validatePreparedBeliefResearchRelationContext({
      ...prepared,
      context: { ...prepared.context, source: { ...prepared.context.source, title: 'Stale bytes' } },
    })).toThrow(/digest/i);
    expect(calls).toEqual([`source:${INSIGHT_ID}`, `claims:${INSIGHT_ID}`, 'theses', `relationships:${CLAIM_ID}`]);
  });

  it('returns unavailable without downstream reads for absent, malformed, or authority-ambiguous sources', async () => {
    let downstreamReads = 0;
    for (const source of [
      null,
      { ...(await repository().loadSource(INSIGHT_ID))!, metadata: {} },
      { ...(await repository().loadSource(INSIGHT_ID))!, claimsStructure: { main_claims: [{ id: 'broken' }] } },
    ]) {
      const result = await prepareBeliefResearchRelationContext(INSIGHT_ID, repository({
        async loadSource() { return source; },
        async loadMainClaims() { downstreamReads++; return []; },
        async loadActiveTheses() { downstreamReads++; return []; },
        async loadExistingRelationships() { downstreamReads++; return []; },
      }));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'source_unavailable' });
    }
    expect(downstreamReads).toBe(0);
  });

  it('returns database-unavailable for failed or incomplete repository state', async () => {
    await expect(prepareBeliefResearchRelationContext(INSIGHT_ID, repository({
      async loadMainClaims() { throw new Error('connection refused'); },
    }))).resolves.toEqual({
      contractVersion: '1.0.0', status: 'unavailable', reason: 'database_unavailable',
      detail: 'connection refused', execution: { mode: 'recommendation_only', writes: [] },
    });

    await expect(prepareBeliefResearchRelationContext(INSIGHT_ID, repository({
      async loadActiveTheses() {
        return [{
          ...(await repository().loadActiveTheses())[0],
          status: 'closed',
        } as never];
      },
    }))).resolves.toMatchObject({ status: 'unavailable', reason: 'authority_ambiguous' });
  });
});
