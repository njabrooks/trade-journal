import { describe, expect, it } from 'vitest';
import {
  type AssessmentJournalRow,
  type AssessmentSnapshotRow,
  type ClaimSignalEvidenceRow,
} from '../scripts/ops/record-belief-evidence-assessment.js';
import { createDatabaseStore } from '../scripts/ops/lib/belief-evidence-assessment-db.js';
import {
  claimSignalEvidences,
  journalEntries,
  signalDataSnapshots,
} from '../src/db/schema.js';

const THESIS_ID = '00000000-0000-4000-8000-000000000001';
const ARTICULATION_ID = '00000000-0000-4000-8000-000000000002';
const SIGNAL_ID = '00000000-0000-4000-8000-000000000003';
const CLAIM_ID = '00000000-0000-4000-8000-000000000005';
const SNAPSHOT_ID = '00000000-0000-4000-8000-000000000007';

function queryResult<T>(value: T) {
  const query = {
    from: () => query,
    where: () => query,
    limit: () => query,
    orderBy: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    then: (resolve: (result: T) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

describe('belief-evidence assessment production database adapter', () => {
  it('uses one serializable transaction, the complete read surface, and rolls every write back on failure', async () => {
    const selected = [
      [{ id: THESIS_ID, title: 'Thesis', status: 'monitoring', notes: 'Owner note' }],
      [{
        id: ARTICULATION_ID,
        version: 2,
        coreArgument: 'Core argument',
        keyDrivers: ['Driver'],
        keyAssumptions: ['Assumption'],
        timeframe: { horizon: 'medium_term' },
        claimIdsUsed: [CLAIM_ID],
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }],
      [{
        id: SIGNAL_ID,
        statement: 'Invalidation condition',
        type: 'invalidation',
        importance: 'critical',
        notes: 'Signal note',
        linkedClaimIds: [CLAIM_ID],
      }],
      [{
        id: CLAIM_ID,
        title: 'Claim title',
        category: 'asset_specific',
        claim: 'Claim content',
        evidence: ['Evidence'],
        reasoning: 'Reasoning',
        backing: 'Backing',
        qualifier: 'high',
        rebuttal: ['Rebuttal'],
        timeHorizon: 'medium_term',
        status: 'active',
        mappingType: 'supports',
        sourceInsightId: null,
        sourceClaimId: null,
        sourceArtifactId: '00000000-0000-4000-8000-000000000009',
        insightSourceType: null,
        insightSourceTitle: null,
        insightSourceUrl: null,
        insightPublishedDate: null,
        insightRawContent: null,
        directSourceType: 'filing',
        directSourceTitle: 'Source title',
        directSourceUrl: 'https://example.test/source',
        directPublishedDate: '2026-08-08',
        directRawContent: 'Full source content',
      }],
      [{
        id: '00000000-0000-4000-8000-000000000010',
        signalId: SIGNAL_ID,
        snapshotDate: new Date('2026-08-07T00:00:00.000Z'),
        assessment: 'neutral',
        evidenceSummary: 'Prior evidence',
        dataSource: 'qualitative',
        claimId: null,
      }],
      [{
        id: CLAIM_ID,
        sourceInsightId: null,
        sourceClaimId: null,
        sourceArtifactId: '00000000-0000-4000-8000-000000000009',
      }],
    ];
    const committed: Array<{ table: unknown; rows: unknown }> = [];
    let transactionConfig: unknown;

    const fakeDb = {
      async transaction<T>(
        work: (transaction: Record<string, unknown>) => Promise<T>,
        config: unknown,
      ): Promise<T> {
        transactionConfig = config;
        const pending: Array<{ table: unknown; rows: unknown }> = [];
        const transaction = {
          select: () => queryResult(selected.shift()),
          insert: (table: unknown) => {
            let rows: unknown;
            const insertion = {
              values(value: unknown) {
                rows = value;
                pending.push({ table, rows });
                return insertion;
              },
              returning: () => Promise.resolve([{ id: SNAPSHOT_ID, signalId: SIGNAL_ID }]),
              onConflictDoUpdate: () => Promise.resolve(),
              then: (resolve: (result: undefined) => unknown, reject: (error: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject),
            };
            return insertion;
          },
        };
        try {
          const result = await work(transaction);
          committed.push(...pending);
          return result;
        } catch (error) {
          throw error;
        }
      },
    } as unknown as Parameters<typeof createDatabaseStore>[0];

    const store = createDatabaseStore(fakeDb);
    await expect(store.transaction(async (transaction) => {
      const target = await transaction.loadCurrentTarget(THESIS_ID, 'asset');
      expect(target?.claimsAndObservations[0]).toEqual(expect.objectContaining({
        claim: 'Claim content',
        rebuttal: ['Rebuttal'],
        provenance: expect.objectContaining({ rawContent: 'Full source content' }),
      }));
      expect(target?.priorEvidence).toHaveLength(1);
      await transaction.loadPromotedClaim(CLAIM_ID);
      await transaction.insertSnapshots([{
        signalId: SIGNAL_ID,
        snapshotDate: new Date('2026-08-08T00:00:00.000Z'),
        assessment: 'strengthening',
        evidenceSummary: 'Evidence',
        dataSource: 'qualitative',
      } satisfies AssessmentSnapshotRow]);
      await transaction.upsertClaimSignalEvidences([{
        claimId: CLAIM_ID,
        signalId: SIGNAL_ID,
        assessment: 'strengthening',
        snapshotId: SNAPSHOT_ID,
      } satisfies ClaimSignalEvidenceRow]);
      await transaction.insertJournalEntries([{} as AssessmentJournalRow]);
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    expect(transactionConfig).toEqual({
      isolationLevel: 'serializable',
      accessMode: 'read write',
    });
    expect(committed).toEqual([]);
    expect(selected).toEqual([]);
  });

  it('routes the accepted writes to only the three governed tables', async () => {
    const writtenTables: unknown[] = [];
    const fakeDb = {
      async transaction<T>(work: (transaction: Record<string, unknown>) => Promise<T>): Promise<T> {
        const transaction = {
          insert: (table: unknown) => {
            writtenTables.push(table);
            const insertion = {
              values: () => insertion,
              returning: () => Promise.resolve([{ id: SNAPSHOT_ID, signalId: SIGNAL_ID }]),
              onConflictDoUpdate: () => Promise.resolve(),
              then: (resolve: (result: undefined) => unknown, reject: (error: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject),
            };
            return insertion;
          },
        };
        return work(transaction);
      },
    } as unknown as Parameters<typeof createDatabaseStore>[0];

    const store = createDatabaseStore(fakeDb);
    await store.transaction(async (transaction) => {
      await transaction.insertSnapshots([{} as AssessmentSnapshotRow]);
      await transaction.upsertClaimSignalEvidences([{} as ClaimSignalEvidenceRow]);
      await transaction.insertJournalEntries([{} as AssessmentJournalRow]);
    });

    expect(writtenTables).toEqual([
      signalDataSnapshots,
      claimSignalEvidences,
      journalEntries,
    ]);
  });
});
