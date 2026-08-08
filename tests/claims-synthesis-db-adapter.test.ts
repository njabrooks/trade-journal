import { describe, expect, it } from 'vitest';
import { createClaimsSynthesisReadRepository } from '../scripts/lib/claims-synthesis-db.js';
import {
  assetTheses,
  macroTheses,
  mainClaims,
  researchInsights,
} from '../src/db/schema.js';

function fakeDatabase(responses: unknown[][], fromTables: unknown[]) {
  return {
    select() {
      let table: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          fromTables.push(value);
          return query;
        },
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          const response = responses.shift();
          if (!response) return Promise.reject(new Error(`No fake response for ${String(table)}`)).then(resolve, reject);
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof createClaimsSynthesisReadRepository>[0];
}

describe('claims-synthesis production database adapter', () => {
  it('uses only bounded repository reads and cannot expose a mutation channel', async () => {
    const fromTables: unknown[] = [];
    const source = {
      insightId: '22222222-2222-4222-8222-222222222222',
      artifactId: '11111111-1111-4111-8111-111111111111',
      title: 'Source',
      sourceType: 'article',
      sourceUrl: null,
      rawContent: 'source',
      metadata: { origin: 'tana-pipeline' },
      observedAt: new Date('2026-08-08T00:00:00.000Z'),
      claimsStructure: { main_claims: [{ id: 'claim-1' }] },
    };
    const exact = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Existing',
      category: 'asset_specific',
      claim: 'Claim',
      evidence: ['Evidence'],
      reasoning: null,
      backing: null,
      qualifier: 'medium',
      rebuttal: ['Counter'],
      timeHorizon: 'medium_term',
      relevantTickers: ['TSM'],
      status: 'complete',
      sourceInsightId: source.insightId,
      sourceClaimId: 'claim-1',
    };
    const db = fakeDatabase([
      [source],
      [exact],
      [exact],
      [{
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Macro',
        description: null,
        direction: 'bullish',
        status: 'developing',
      }],
      [{
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Asset',
        description: 'Asset thesis',
        direction: 'bearish',
        status: 'monitoring',
        ticker: 'TSM',
      }],
    ], fromTables);
    const repository = createClaimsSynthesisReadRepository(db);

    const loadedSource = await repository.loadSource(source.insightId);
    expect(loadedSource).toEqual(source);
    expect(await repository.loadMainClaims(source)).toEqual([exact]);
    expect(await repository.loadActiveTheses()).toEqual([
      expect.objectContaining({ type: 'macro', status: 'developing' }),
      expect.objectContaining({ type: 'asset', status: 'monitoring', ticker: 'TSM' }),
    ]);
    expect(fromTables).toEqual([
      researchInsights,
      mainClaims,
      mainClaims,
      macroTheses,
      assetTheses,
    ]);
    expect(repository).not.toHaveProperty('write');
    expect(repository).not.toHaveProperty('transaction');
  });
});
