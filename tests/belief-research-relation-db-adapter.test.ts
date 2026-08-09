import { describe, expect, it } from 'vitest';
import { createBeliefResearchRelationReadRepository } from '../scripts/lib/belief-research-relation-db.js';
import {
  assetTheses, claimThesisMappings, journalEntries, macroTheses, mainClaims,
  researchInsights, thesisArticulations,
} from '../src/db/schema.js';
import { createBeliefResearchRelationDatabaseStore } from '../scripts/ops/lib/belief-research-relation-db.js';
import type {
  BeliefResearchRelationAuditInsert,
  BeliefResearchRelationDecisionInsert,
  BeliefResearchRelationMappingInsert,
} from '../scripts/ops/record-belief-research-relation.js';

const CLAIM_ID = '33333333-3333-4333-8333-333333333333';
const THESIS_ID = '44444444-4444-4444-8444-444444444444';
const AUTH_ID = '77777777-7777-4777-8777-777777777777';

function fakeReadDatabase(responses: unknown[][], fromTables: unknown[]) {
  return {
    select() {
      let table: unknown;
      const query = {
        from(value: unknown) { table = value; fromTables.push(value); return query; },
        innerJoin: () => query, leftJoin: () => query, where: () => query, orderBy: () => query,
        limit: () => query,
        then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          const response = responses.shift();
          if (!response) return Promise.reject(new Error(`No fake response for ${String(table)}`)).then(resolve, reject);
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof createBeliefResearchRelationReadRepository>[0];
}

describe('belief-research relation production adapters', () => {
  it('read adapter exposes only exact source, catalog, active thesis argument, and mapping reads', async () => {
    const tables: unknown[] = [];
    const source = {
      insightId: '22222222-2222-4222-8222-222222222222',
      artifactId: '11111111-1111-4111-8111-111111111111', title: 'Source', sourceType: 'article',
      sourceUrl: null, rawContent: 'source', metadata: { origin: 'tana-pipeline' },
      observedAt: new Date('2026-08-08T00:00:00.000Z'), claimsStructure: { main_claims: [{ id: 'claim-1' }] },
    };
    const db = fakeReadDatabase([
      [source],
      [{ id: CLAIM_ID, title: 'Claim', category: 'asset_specific', claim: 'Claim', status: 'complete',
        sourceInsightId: source.insightId, sourceClaimId: 'claim-1' }],
      [{ id: THESIS_ID, title: 'Macro', description: 'Fallback macro argument.', direction: 'bullish', status: 'developing' }],
      [{ id: '55555555-5555-4555-8555-555555555555', title: 'Asset', description: 'Fallback asset.',
        direction: 'bearish', status: 'monitoring', ticker: 'TSM' }],
      [{ thesisId: THESIS_ID, thesisType: 'macro', version: 2, coreArgument: 'Latest governed argument.',
        keyDrivers: ['Driver'], keyAssumptions: ['Assumption'], createdAt: new Date('2026-08-08') }],
      [{ mainClaimId: CLAIM_ID, macroThesisId: THESIS_ID, assetThesisId: null,
        mappingType: 'supports', confidence: 'high' }],
    ], tables);
    const repository = createBeliefResearchRelationReadRepository(db);
    expect(await repository.loadSource(source.insightId)).toEqual(source);
    expect(await repository.loadMainClaims(source)).toHaveLength(1);
    expect(await repository.loadActiveTheses()).toEqual([
      expect.objectContaining({ id: THESIS_ID, type: 'macro', status: 'developing', argument: {
        source: 'latest_articulation', coreArgument: 'Latest governed argument.',
        keyDrivers: ['Driver'], keyAssumptions: ['Assumption'],
      } }),
      expect.objectContaining({ type: 'asset', status: 'monitoring', argument: {
        source: 'description', coreArgument: 'Fallback asset.', keyDrivers: [], keyAssumptions: [],
      } }),
    ]);
    expect(await repository.loadExistingRelationships([CLAIM_ID])).toEqual([{
      claimId: CLAIM_ID, thesisId: THESIS_ID, thesisType: 'macro', relationship: 'supports',
    }]);
    expect(tables).toEqual([
      researchInsights, mainClaims, macroTheses, assetTheses, thesisArticulations, claimThesisMappings,
    ]);
    expect(repository).not.toHaveProperty('write'); expect(repository).not.toHaveProperty('transaction');
  });

  it('write adapter exposes one serializable exact-surface transaction and no generic mutation channel', async () => {
    const pending: Array<{ table: unknown; row: Record<string, unknown> }> = [];
    const committed: typeof pending = []; const executions: unknown[] = []; let config: unknown;
    const fakeDb = {
      async transaction<T>(work: (tx: Record<string, unknown>) => Promise<T>, options: unknown): Promise<T> {
        config = options;
        const tx = {
          execute(statement: unknown) { executions.push(statement); return Promise.resolve(); },
          insert(table: unknown) {
            const operation = {
              values(row: Record<string, unknown>) { pending.push({ table, row }); return operation; },
              returning() { return Promise.resolve([{ id: '88888888-8888-4888-8888-888888888888' }]); },
            };
            return operation;
          },
        };
        const result = await work(tx); committed.push(...pending); return result;
      },
    } as unknown as Parameters<typeof createBeliefResearchRelationDatabaseStore>[0];
    const store = createBeliefResearchRelationDatabaseStore(fakeDb);
    const mapping: BeliefResearchRelationMappingInsert = {
      mainClaimId: CLAIM_ID, thesisId: THESIS_ID, thesisType: 'macro', mappingType: 'supports',
      confidence: 'high', mappedBy: 'belief-research-relation', notes: 'Direct bearing.',
    };
    const decision = {
      decisionId: 'decision:thesis_bearing:source:claim', actionType: 'decision_required', objectType: 'claim',
      objectId: CLAIM_ID, objectTitle: 'Judgment required', packet: { decision_type: 'confirm_claim_link', resolution: null },
      metadata: { decisionId: 'decision:thesis_bearing:source:claim' }, status: 'active',
      recordedAt: new Date('2026-08-09T09:01:00.000Z'),
    } as unknown as BeliefResearchRelationDecisionInsert;
    const audit = {
      authorizationId: AUTH_ID, authorizationDigest: `sha256:${'a'.repeat(64)}`,
      recordingDigest: `sha256:${'b'.repeat(64)}`, actionType: 'belief_research_relation_recorded',
      result: { relationships: [], decisions: [], source: { insightId: 'x' } },
      snapshotDigest: `sha256:${'c'.repeat(64)}`, snapshot: {
        source: { insightId: 'x' },
        acceptedRelationships: [{ recordedMapping: { ...mapping, id: '88888888-8888-4888-8888-888888888888' } }],
        surfacedDecisions: [],
      },
      recordedAt: new Date('2026-08-09T09:01:00.000Z'),
    } as unknown as BeliefResearchRelationAuditInsert;
    await store.transaction(async (tx) => {
      expect(Object.keys(tx).sort()).toEqual([
        'acquireAuthorizationLock', 'insertAuditEntry', 'insertClaimThesisMapping',
        'insertDecisionItem', 'loadClaimById', 'loadClaimThesisMapping', 'loadCurrentContext',
        'loadDecisionItem', 'loadRecordedOperation', 'loadThesisById',
      ]);
      expect(tx).not.toHaveProperty('execute'); expect(tx).not.toHaveProperty('query');
      await tx.acquireAuthorizationLock(AUTH_ID);
      await tx.insertClaimThesisMapping(mapping);
      await tx.insertDecisionItem(decision);
      await tx.insertAuditEntry(audit);
    });
    expect(config).toEqual({ isolationLevel: 'serializable', accessMode: 'read write' });
    expect(executions).toHaveLength(1);
    expect(committed.map(({ table }) => table)).toEqual([
      claimThesisMappings, journalEntries, journalEntries,
    ]);
    expect(committed[0].row).toEqual({
      mainClaimId: CLAIM_ID, macroThesisId: THESIS_ID, assetThesisId: null,
      mappingType: 'supports', confidence: 'high', mappedBy: 'belief-research-relation', notes: 'Direct bearing.',
    });
    expect(committed[1].row).toMatchObject({
      objectType: 'claim', actionType: 'decision_required', source: 'user', status: 'active',
      metadata: { decisionId: 'decision:thesis_bearing:source:claim' },
    });
    expect(committed[2].row).toMatchObject({
      objectType: 'claim', actionType: 'belief_research_relation_recorded',
      skillInvoked: 'belief-research-relation', source: 'user', batchId: AUTH_ID,
      metadata: { snapshotDigest: `sha256:${'c'.repeat(64)}` },
    });
  });

  it('relies on transaction rollback and retries serialization races', async () => {
    let attempts = 0; const committed: unknown[] = [];
    const fakeDb = {
      async transaction<T>(work: (tx: Record<string, unknown>) => Promise<T>): Promise<T> {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('race'), { code: '40001' });
        const pending: unknown[] = [];
        const tx = { insert(table: unknown) { return { values(row: unknown) { pending.push({ table, row }); return this; }, returning: async () => [{ id: CLAIM_ID }] }; } };
        try { const result = await work(tx); committed.push(...pending); return result; } catch (error) { throw error; }
      },
    } as unknown as Parameters<typeof createBeliefResearchRelationDatabaseStore>[0];
    const store = createBeliefResearchRelationDatabaseStore(fakeDb);
    await expect(store.transaction(async () => 'retried')).resolves.toBe('retried');
    expect(attempts).toBe(2); expect(committed).toEqual([]);

    await expect(store.transaction(async (tx) => {
      await tx.insertClaimThesisMapping({ mainClaimId: CLAIM_ID, thesisId: THESIS_ID, thesisType: 'macro',
        mappingType: 'supports', confidence: 'high', mappedBy: 'belief-research-relation', notes: 'Direct.' });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    expect(committed).toEqual([]);
  });
});
