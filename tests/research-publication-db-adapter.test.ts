import { describe, expect, it } from 'vitest';
import { createResearchPublicationDatabaseStore } from '../scripts/ops/lib/research-publication-db.js';
import type {
  PublicationAuditInsert,
  PublicationClaimInsert,
  PublicationMappingInsert,
} from '../scripts/ops/publish-research.js';
import { claimThesisMappings, journalEntries, mainClaims } from '../src/db/schema.js';

const CLAIM_ID = '11111111-1111-4111-8111-111111111111';
const THESIS_ID = '22222222-2222-4222-8222-222222222222';
const AUTHORIZATION_ID = '33333333-3333-4333-8333-333333333333';

function claim(): PublicationClaimInsert {
  return {
    title: 'Power access delays defer revenue', category: 'asset_specific',
    claim: 'Grid delays defer revenue-generating deployments.', evidence: ['Utility queues.'],
    reasoning: 'Power precedes deployment.', backing: 'Utility disclosures.', qualifier: 'medium',
    rebuttal: ['On-site generation may help.'], timeHorizon: 'medium_term', relevantTickers: ['VRT'],
    status: 'draft', sourceInsightId: '44444444-4444-4444-8444-444444444444', sourceClaimId: 'claim-1',
  };
}

function mapping(): PublicationMappingInsert {
  return {
    mainClaimId: CLAIM_ID, thesisId: THESIS_ID, thesisType: 'asset', mappingType: 'supports',
    confidence: 'medium', mappedBy: 'research-publication', notes: 'Direct bearing.',
  };
}

function audit(): PublicationAuditInsert {
  return {
    authorizationId: AUTHORIZATION_ID,
    authorizationDigest: `sha256:${'a'.repeat(64)}`,
    publicationDigest: `sha256:${'b'.repeat(64)}`,
    actionType: 'research_publication_recorded',
    recordedAt: new Date('2026-08-08T10:01:00.000Z'),
    result: {
      status: 'published', authorizationId: AUTHORIZATION_ID, batchId: AUTHORIZATION_ID,
      publicationDigest: `sha256:${'b'.repeat(64)}`,
      source: { insightId: '44444444-4444-4444-8444-444444444444', contentSha256: `sha256:${'c'.repeat(64)}` },
      claims: [{ sourceClaimId: 'claim-1', mainClaimRef: 'synthesized:claim-1', mainClaimId: CLAIM_ID, disposition: 'created' }],
      relationships: [{ relationshipId: 'relationship:claim-1:asset:thesis', mappingId: '55555555-5555-4555-8555-555555555555', mainClaimId: CLAIM_ID, thesisId: THESIS_ID, thesisType: 'asset', relationship: 'supports', disposition: 'created' }],
      writes: [
        { table: 'main_claims', operation: 'insert', count: 1 },
        { table: 'claim_thesis_mappings', operation: 'insert', count: 1 },
        { table: 'journal_entries', operation: 'insert', count: 1 },
      ],
    },
  };
}

describe('research-publication production database adapter', () => {
  it('uses one serializable transaction and exposes only the exact governed methods', async () => {
    const pending: Array<{ table: unknown; row: unknown }> = [];
    const committed: Array<{ table: unknown; row: unknown }> = [];
    const executions: unknown[] = [];
    let transactionConfig: unknown;
    const fakeDb = {
      async transaction<T>(
        work: (transaction: Record<string, unknown>) => Promise<T>,
        config: unknown,
      ): Promise<T> {
        transactionConfig = config;
        const transaction = {
          execute(statement: unknown) { executions.push(statement); return Promise.resolve(); },
          insert(table: unknown) {
            let row: unknown;
            const insertion = {
              values(value: unknown) { row = value; pending.push({ table, row }); return insertion; },
              returning() {
                if (table === mainClaims) return Promise.resolve([{ id: CLAIM_ID, ...claim() }]);
                return Promise.resolve([{ id: '55555555-5555-4555-8555-555555555555' }]);
              },
            };
            return insertion;
          },
        };
        const value = await work(transaction);
        committed.push(...pending);
        return value;
      },
    } as unknown as Parameters<typeof createResearchPublicationDatabaseStore>[0];

    const store = createResearchPublicationDatabaseStore(fakeDb);
    await store.transaction(async (transaction) => {
      expect(Object.keys(transaction).sort()).toEqual([
        'acquireAuthorizationLock', 'insertClaimThesisMapping', 'insertJournalEntry',
        'insertMainClaim', 'loadClaimById', 'loadClaimByProvenance',
        'loadClaimThesisMapping', 'loadCurrentContext', 'loadRecordedPublication',
      ]);
      expect(transaction).not.toHaveProperty('query');
      expect(transaction).not.toHaveProperty('execute');
      await transaction.acquireAuthorizationLock(AUTHORIZATION_ID);
      await transaction.insertMainClaim(claim());
      await transaction.insertClaimThesisMapping(mapping());
      await transaction.insertJournalEntry(audit());
    });

    expect(transactionConfig).toEqual({ isolationLevel: 'serializable', accessMode: 'read write' });
    expect(executions).toHaveLength(1);
    expect(committed.map(({ table }) => table)).toEqual([mainClaims, claimThesisMappings, journalEntries]);
    expect((committed[0].row as Record<string, unknown>)).not.toHaveProperty('sourceArtifactId');
    expect(committed[2].row).toMatchObject({
      objectType: 'claim', actionType: 'research_publication_recorded',
      skillInvoked: 'research-publication', source: 'user', batchId: AUTHORIZATION_ID,
    });
  });

  it('relies on database transaction rollback for a partial failure', async () => {
    const committed: unknown[] = [];
    const fakeDb = {
      async transaction<T>(work: (transaction: Record<string, unknown>) => Promise<T>): Promise<T> {
        const pending: unknown[] = [];
        const transaction = {
          insert(table: unknown) {
            const insertion = {
              values(row: unknown) { pending.push({ table, row }); return insertion; },
              returning: () => Promise.resolve([{ id: CLAIM_ID, ...claim() }]),
            };
            return insertion;
          },
        };
        try {
          const value = await work(transaction);
          committed.push(...pending);
          return value;
        } catch (error) {
          throw error;
        }
      },
    } as unknown as Parameters<typeof createResearchPublicationDatabaseStore>[0];

    const store = createResearchPublicationDatabaseStore(fakeDb);
    await expect(store.transaction(async (transaction) => {
      await transaction.insertMainClaim(claim());
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    expect(committed).toEqual([]);
  });
});
