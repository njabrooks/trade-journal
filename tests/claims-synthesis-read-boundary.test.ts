import { describe, expect, it } from 'vitest';
import {
  prepareClaimsSynthesisContext,
  type ClaimsSynthesisReadRepository,
} from '../src/lib/intelligence/claimsSynthesisReadBoundary.js';

const INSIGHT_ID = '22222222-2222-4222-8222-222222222222';

function repository(overrides: Partial<ClaimsSynthesisReadRepository> = {}): ClaimsSynthesisReadRepository {
  return {
    async loadSource() {
      return {
        insightId: INSIGHT_ID,
        artifactId: '11111111-1111-4111-8111-111111111111',
        title: 'Semiconductor capital intensity',
        sourceType: 'article',
        sourceUrl: 'https://example.test/source',
        rawContent: 'Original Notes-owned source bytes.',
        metadata: { origin: 'tana-pipeline', tana_content_node_id: 'node-1' },
        observedAt: new Date('2026-08-08T09:30:00.000Z'),
        claimsStructure: {
          main_claims: [{
            id: 'claim-1',
            title: 'Leading-edge capacity remains constrained',
            category: 'asset_specific',
            claim: 'Leading-edge foundry capacity remains constrained through 2027.',
            evidence: ['Announced capacity is substantially pre-committed.'],
            reasoning: 'Long lead times prevent supply from responding quickly.',
            backing: 'Foundry construction and qualification cycles span multiple years.',
            qualifier: 'medium',
            rebuttal: ['Demand could fall before the new capacity is commissioned.'],
            time_horizon: 'medium_term',
            relevant_tickers: ['TSM'],
          }],
        },
      };
    },
    async loadMainClaims() {
      return [];
    },
    async loadActiveTheses() {
      return [];
    },
    ...overrides,
  };
}

describe('claims-synthesis repository read boundary', () => {
  it('builds a deterministic Notes-owned context using only the three approved reads', async () => {
    const calls: string[] = [];
    const repo = repository({
      async loadSource(id) {
        calls.push(`source:${id}`);
        return repository().loadSource(id);
      },
      async loadMainClaims(source) {
        calls.push(`claims:${source.insightId}`);
        return [];
      },
      async loadActiveTheses() {
        calls.push('theses');
        return [];
      },
    });

    const prepared = await prepareClaimsSynthesisContext(INSIGHT_ID, repo);

    expect(prepared.status).toBe('ready');
    if (prepared.status === 'ready') {
      expect(prepared.context).toMatchObject({
        source: { authority: 'scope:notes', insightId: INSIGHT_ID },
        sourceEvidence: [{
          sourceClaimId: 'claim-1',
          qualifier: 'medium',
          rebuttal: ['Demand could fall before the new capacity is commissioned.'],
        }],
      });
    }
    expect(calls).toEqual([`source:${INSIGHT_ID}`, `claims:${INSIGHT_ID}`, 'theses']);
  });

  it('reports unavailable source and database states without fabricating context', async () => {
    await expect(prepareClaimsSynthesisContext(INSIGHT_ID, repository({
      async loadSource() {
        return null;
      },
    }))).resolves.toEqual({
      contractVersion: '1.0.0',
      status: 'unavailable',
      reason: 'source_unavailable',
      detail: `No Notes-owned research insight found for ${INSIGHT_ID}`,
      execution: { mode: 'recommendation_only', writes: [] },
    });

    await expect(prepareClaimsSynthesisContext(INSIGHT_ID, repository({
      async loadMainClaims() {
        throw new Error('connection refused');
      },
    }))).resolves.toEqual({
      contractVersion: '1.0.0',
      status: 'unavailable',
      reason: 'database_unavailable',
      detail: 'connection refused',
      execution: { mode: 'recommendation_only', writes: [] },
    });
  });

  it('refuses research rows that do not prove Notes/Tana source authority', async () => {
    const unowned = repository({
      async loadSource() {
        const source = await repository().loadSource(INSIGHT_ID);
        return source ? { ...source, metadata: {} } : null;
      },
    });

    const result = await prepareClaimsSynthesisContext(INSIGHT_ID, unowned);
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'source_unavailable',
    });
    expect(result).toHaveProperty('detail', 'Research artifact does not carry Notes/Tana authority provenance');
  });
});
