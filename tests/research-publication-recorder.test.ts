import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildResearchPublication,
  digestResearchPublication,
  digestResearchPublicationAuditSnapshot,
  digestResearchPublicationAuthorization,
  RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
  type ResearchPublicationAuthorization,
} from '../src/lib/intelligence/researchPublication.js';
import {
  digestClaimsSynthesisContext,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisReadyResult,
} from '../src/lib/intelligence/claimsSynthesis.js';
import {
  recordResearchPublication,
  ResearchPublicationRecordingError,
  type PublicationAuditRecord,
  type PublicationClaimRecord,
  type PublicationMappingRecord,
  type ResearchPublicationStore,
  type ResearchPublicationTransaction,
} from '../scripts/ops/publish-research.js';

const INSIGHT_ID = '22222222-2222-4222-8222-222222222222';
const EXISTING_CLAIM_ID = '33333333-3333-4333-8333-333333333333';
const TSM_THESIS_ID = '44444444-4444-4444-8444-444444444444';
const VRT_THESIS_ID = '55555555-5555-4555-8555-555555555555';

function fixture() {
  const context: ClaimsSynthesisContext = {
    contractVersion: '1.0.0',
    source: {
      authority: 'scope:notes',
      artifactId: '11111111-1111-4111-8111-111111111111',
      insightId: INSIGHT_ID,
      title: 'Semiconductor constraints',
      sourceType: 'article',
      sourceUrl: 'https://example.test/source',
      contentSha256: `sha256:${'a'.repeat(64)}`,
      observedAt: '2026-08-08T09:30:00.000Z',
    },
    sourceEvidence: [
      {
        sourceClaimId: 'claim-1', title: 'Foundry scarcity', category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains constrained.', evidence: ['Capacity is pre-committed.'],
        reasoning: 'Long lead times.', backing: 'Construction schedules.', qualifier: 'medium',
        rebuttal: ['Demand could fall.'], timeHorizon: 'medium_term', relevantTickers: ['TSM'],
      },
      {
        sourceClaimId: 'claim-2', title: 'Power delays', category: 'asset_specific',
        claim: 'Grid delays defer data-centre deployments.', evidence: ['Long utility queues.'],
        reasoning: 'Power precedes deployment.', backing: 'Utility disclosures.', qualifier: 'medium',
        rebuttal: ['On-site generation may help.'], timeHorizon: 'medium_term', relevantTickers: ['VRT'],
      },
    ],
    existingMainClaims: [{
      id: EXISTING_CLAIM_ID, title: 'Foundry scarcity persists', category: 'asset_specific',
      claim: 'Leading-edge foundry capacity remains constrained.', status: 'complete',
      sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-1', provenanceMatch: 'exact',
    }],
    thesisTargets: [
      { id: TSM_THESIS_ID, type: 'asset', title: 'TSM pricing', description: null, direction: 'bullish', status: 'monitoring', ticker: 'TSM' },
      { id: VRT_THESIS_ID, type: 'asset', title: 'Power bottlenecks', description: null, direction: 'bullish', status: 'developing', ticker: 'VRT' },
    ],
  };
  const result: ClaimsSynthesisReadyResult = {
    contractVersion: '1.0.0', contextDigest: digestClaimsSynthesisContext(context), status: 'ready',
    sourceEvidence: context.sourceEvidence.map(({ sourceClaimId }) => ({ insightId: INSIGHT_ID, sourceClaimId })),
    existingMainClaims: [{ sourceClaimId: 'claim-1', mainClaimId: EXISTING_CLAIM_ID, disposition: 'reuse_exact_provenance' }],
    synthesizedInvestmentClaims: [{
      ...context.sourceEvidence[1], ref: 'synthesized:claim-2', title: 'Power access delays defer revenue',
      claim: 'Grid delays defer revenue-generating data-centre deployments.',
      synthesisRationale: 'Preserves the source while expressing the investable implication.',
    }],
    thesisMappings: [
      { sourceClaimId: 'claim-1', mainClaimRef: EXISTING_CLAIM_ID, thesisId: TSM_THESIS_ID, thesisType: 'asset', relationship: 'supports', confidence: 'medium', rationale: 'Direct bearing.' },
      { sourceClaimId: 'claim-2', mainClaimRef: 'synthesized:claim-2', thesisId: VRT_THESIS_ID, thesisType: 'asset', relationship: 'foundation', confidence: 'medium', rationale: 'Causal foundation.' },
    ],
    ambiguities: [],
    recommendations: [
      { sourceClaimId: 'claim-1', action: 'reuse_existing_claim', rationale: 'Exact provenance.' },
      { sourceClaimId: 'claim-2', action: 'synthesize_investment_claim', rationale: 'Distinct implication.' },
    ],
    execution: { mode: 'recommendation_only', writes: [] }, limitations: ['No writes.'],
  };
  const prepared = buildResearchPublication(context, result);
  const authorization: ResearchPublicationAuthorization = {
    contractVersion: '1.0.0', type: 'research_publication_authorization',
    authorizationId: '66666666-6666-4666-8666-666666666666', authorizedBy: 'user',
    authorizedAt: '2026-08-08T10:00:00.000Z', expiresAt: '2026-08-08T22:00:00.000Z',
    publicationDigest: prepared.publicationDigest,
    acceptedClaimRefs: prepared.claimCandidates.map(({ mainClaimRef }) => mainClaimRef),
    acceptedRelationshipIds: prepared.relationshipCandidates.map(({ relationshipId }) => relationshipId),
    statement: RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
  };
  return { context, result, prepared, authorization };
}

class MemoryStore implements ResearchPublicationStore {
  claims = new Map<string, PublicationClaimRecord>();
  mappings = new Map<string, PublicationMappingRecord>();
  audits = new Map<string, PublicationAuditRecord>();
  writeLog: string[] = [];
  failMapping = false;

  constructor(public current = fixture().context) {
    this.claims.set(EXISTING_CLAIM_ID, {
      id: EXISTING_CLAIM_ID, title: 'Foundry scarcity persists', category: 'asset_specific',
      claim: 'Leading-edge foundry capacity remains constrained.', evidence: [], reasoning: null,
      backing: null, qualifier: null, rebuttal: [], timeHorizon: null, relevantTickers: ['TSM'],
      status: 'complete', sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-1',
    });
  }

  async transaction<T>(work: (transaction: ResearchPublicationTransaction) => Promise<T>): Promise<T> {
    const claims = new Map(this.claims);
    const mappings = new Map(this.mappings);
    const audits = new Map(this.audits);
    const writeLog = [...this.writeLog];
    const transaction: ResearchPublicationTransaction = {
      acquireAuthorizationLock: async () => undefined,
      loadCurrentContext: async () => this.current,
      loadRecordedPublication: async (authorizationId) => audits.get(authorizationId) ?? null,
      loadClaimById: async (id) => claims.get(id) ?? null,
      loadClaimByProvenance: async (insightId, sourceClaimId) =>
        [...claims.values()].find((claim) => claim.sourceInsightId === insightId && claim.sourceClaimId === sourceClaimId) ?? null,
      insertMainClaim: async (row) => {
        const claim = { ...row, id: randomUUID() };
        claims.set(claim.id, claim);
        writeLog.push('main_claims');
        return claim;
      },
      loadClaimThesisMapping: async (mainClaimId, thesisId, thesisType) =>
        mappings.get(`${mainClaimId}:${thesisType}:${thesisId}`) ?? null,
      insertClaimThesisMapping: async (row) => {
        if (this.failMapping) throw new Error('injected mapping failure');
        const mapping = { ...row, id: randomUUID() };
        mappings.set(`${row.mainClaimId}:${row.thesisType}:${row.thesisId}`, mapping);
        writeLog.push('claim_thesis_mappings');
        return mapping;
      },
      insertJournalEntry: async (row) => {
        const audit = { ...row, id: randomUUID() };
        audits.set(row.authorizationId, audit);
        writeLog.push('journal_entries');
        return audit;
      },
    };
    try {
      const value = await work(transaction);
      this.claims = claims; this.mappings = mappings; this.audits = audits; this.writeLog = writeLog;
      return value;
    } catch (error) {
      throw error;
    }
  }
}

describe('governed research-publication recorder', () => {
  it('reuses exact provenance, creates only accepted claims and mappings, and emits one complete audit', async () => {
    const input = fixture();
    const store = new MemoryStore(input.context);
    const recorded = await recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    );

    expect(recorded).toMatchObject({
      status: 'published', authorizationId: input.authorization.authorizationId,
      source: { insightId: INSIGHT_ID }, journalEntryId: expect.any(String),
      writes: [
        { table: 'main_claims', operation: 'insert', count: 1 },
        { table: 'claim_thesis_mappings', operation: 'insert', count: 2 },
        { table: 'journal_entries', operation: 'insert', count: 1 },
      ],
    });
    expect(recorded.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceClaimId: 'claim-1', disposition: 'reused' }),
      expect.objectContaining({ sourceClaimId: 'claim-2', disposition: 'created' }),
    ]));
    expect([...store.claims.values()].filter((claim) => claim.sourceClaimId === 'claim-1')).toHaveLength(1);
    expect(store.audits.get(input.authorization.authorizationId)).toMatchObject({
      actionType: 'research_publication_recorded', publicationDigest: input.prepared.publicationDigest,
      authorizationDigest: digestResearchPublicationAuthorization(input.authorization),
      snapshot: {
        kind: 'research_publication_audit',
        publicationDigest: input.prepared.publicationDigest,
        authorization: input.authorization,
        acceptedClaims: expect.arrayContaining([
          expect.objectContaining({
            candidate: expect.objectContaining({ sourceClaimId: 'claim-2' }),
            publishedClaim: expect.objectContaining({ sourceClaimId: 'claim-2', qualifier: 'medium' }),
          }),
        ]),
        acceptedRelationships: expect.arrayContaining([
          expect.objectContaining({
            candidate: expect.objectContaining({ rationale: 'Causal foundation.' }),
            publishedMapping: expect.objectContaining({ notes: 'Causal foundation.' }),
          }),
        ]),
      },
    });
    const audit = store.audits.get(input.authorization.authorizationId);
    expect(audit?.snapshot.claimsSynthesis).not.toHaveProperty('result');
    expect(audit?.snapshotDigest).toBe(digestResearchPublicationAuditSnapshot(audit?.snapshot));
    expect(new Set(store.writeLog)).toEqual(new Set(['main_claims', 'claim_thesis_mappings', 'journal_entries']));
  });

  it('is idempotent for a canonically identical authorization retry', async () => {
    const input = fixture();
    const store = new MemoryStore(input.context);

    const first = await recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    );
    const writesAfterFirst = [...store.writeLog];
    const second = await recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-09T10:01:00.000Z') },
    );

    expect(first.claims.find(({ sourceClaimId }) => sourceClaimId === 'claim-2')).toMatchObject({ disposition: 'created' });
    expect(second).toEqual(first);
    expect(store.writeLog).toEqual(writesAfterFirst);
    expect([...store.claims.values()].filter((claim) => claim.sourceClaimId === 'claim-2')).toHaveLength(1);
  });

  it('reuses a matching provenance claim committed since preparation', async () => {
    const input = fixture();
    const proposed = input.prepared.claimCandidates.find(({ sourceClaimId }) => sourceClaimId === 'claim-2')?.proposedClaim;
    if (!proposed) throw new Error('missing fixture proposal');
    const current = structuredClone(input.context);
    current.existingMainClaims.push({
      id: '99999999-9999-4999-8999-999999999999', title: proposed.title,
      category: proposed.category, claim: proposed.claim, status: 'draft', sourceInsightId: INSIGHT_ID,
      sourceClaimId: 'claim-2', provenanceMatch: 'exact',
    });
    const store = new MemoryStore(current);
    store.claims.set('99999999-9999-4999-8999-999999999999', {
      id: '99999999-9999-4999-8999-999999999999', title: proposed.title, category: proposed.category,
      claim: proposed.claim, evidence: proposed.evidence, reasoning: proposed.reasoning, backing: proposed.backing,
      qualifier: proposed.qualifier, rebuttal: proposed.rebuttal, timeHorizon: proposed.timeHorizon,
      relevantTickers: proposed.relevantTickers, status: 'draft', sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-2',
    });

    const recorded = await recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    );
    expect(recorded.claims.find(({ sourceClaimId }) => sourceClaimId === 'claim-2')).toMatchObject({
      mainClaimId: '99999999-9999-4999-8999-999999999999',
      disposition: 'reused',
    });
    expect(recorded.writes[0]).toEqual({ table: 'main_claims', operation: 'insert', count: 0 });
  });

  it('refuses a self-digested tampered candidate set on the concurrent-promotion path', async () => {
    const input = fixture();
    const proposed = input.prepared.claimCandidates.find(({ sourceClaimId }) => sourceClaimId === 'claim-2')?.proposedClaim;
    if (!proposed) throw new Error('missing fixture proposal');
    const current = structuredClone(input.context);
    current.existingMainClaims.push({
      id: '99999999-9999-4999-8999-999999999999', title: proposed.title,
      category: proposed.category, claim: proposed.claim, status: 'draft', sourceInsightId: INSIGHT_ID,
      sourceClaimId: 'claim-2', provenanceMatch: 'exact',
    });
    const prepared = structuredClone(input.prepared);
    prepared.relationshipCandidates[1].rationale = 'Tampered ungoverned rationale.';
    const withoutDigest = Object.fromEntries(
      Object.entries(prepared).filter(([key]) => key !== 'publicationDigest'),
    ) as Omit<typeof prepared, 'publicationDigest'>;
    prepared.publicationDigest = digestResearchPublication(withoutDigest);
    const authorization = {
      ...input.authorization,
      publicationDigest: prepared.publicationDigest,
    };
    const store = new MemoryStore(current);

    await expect(recordResearchPublication(
      { prepared, authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    )).rejects.toMatchObject({ code: 'invalid_input' });
    expect(store.writeLog).toEqual([]);
  });

  it('refuses an incompatible provenance row for a claim the user did not accept', async () => {
    const input = fixture();
    const proposed = input.prepared.claimCandidates.find(({ sourceClaimId }) => sourceClaimId === 'claim-2')?.proposedClaim;
    if (!proposed) throw new Error('missing fixture proposal');
    const current = structuredClone(input.context);
    current.existingMainClaims.push({
      id: '99999999-9999-4999-8999-999999999999', title: proposed.title,
      category: proposed.category, claim: proposed.claim, status: 'draft', sourceInsightId: INSIGHT_ID,
      sourceClaimId: 'claim-2', provenanceMatch: 'exact',
    });
    const authorization = {
      ...input.authorization,
      acceptedClaimRefs: [EXISTING_CLAIM_ID],
      acceptedRelationshipIds: [`relationship:claim-1:asset:${TSM_THESIS_ID}`],
    };
    const store = new MemoryStore(current);
    store.claims.set('99999999-9999-4999-8999-999999999999', {
      id: '99999999-9999-4999-8999-999999999999', title: proposed.title, category: proposed.category,
      claim: proposed.claim, evidence: ['Conflicting evidence.'], reasoning: 'Conflicting reasoning.',
      backing: null, qualifier: 'low', rebuttal: [], timeHorizon: null, relevantTickers: [], status: 'draft',
      sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-2',
    });

    await expect(recordResearchPublication(
      { prepared: input.prepared, authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    )).rejects.toMatchObject({ code: 'stale_input' });
    expect(store.writeLog).toEqual([]);
  });

  it('refuses reuse when a stored relationship has different rationale notes', async () => {
    const input = fixture();
    const store = new MemoryStore(input.context);
    store.mappings.set(`${EXISTING_CLAIM_ID}:asset:${TSM_THESIS_ID}`, {
      id: '77777777-7777-4777-8777-777777777777',
      mainClaimId: EXISTING_CLAIM_ID,
      thesisId: TSM_THESIS_ID,
      thesisType: 'asset',
      mappingType: 'supports',
      confidence: 'medium',
      mappedBy: 'research-publication',
      notes: 'A different historical rationale.',
    });

    await expect(recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    )).rejects.toMatchObject({ code: 'relationship_conflict' });
    expect(store.writeLog).toEqual([]);
  });

  it('rolls back every claim, mapping, and audit write after a partial failure', async () => {
    const input = fixture();
    const store = new MemoryStore(input.context);
    store.failMapping = true;
    const before = { claims: [...store.claims], mappings: [...store.mappings], audits: [...store.audits], writes: [...store.writeLog] };

    await expect(recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-08T10:01:00.000Z') },
    )).rejects.toThrow('injected mapping failure');
    expect({ claims: [...store.claims], mappings: [...store.mappings], audits: [...store.audits], writes: [...store.writeLog] }).toEqual(before);
  });

  it('refuses stale repository state and conflicting provenance without any committed write', async () => {
    const input = fixture();
    const stale = structuredClone(input.context);
    stale.source.contentSha256 = `sha256:${'b'.repeat(64)}`;
    const staleStore = new MemoryStore(stale);
    await expect(recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store: staleStore, now: new Date('2026-08-08T10:01:00.000Z') },
    )).rejects.toMatchObject({ code: 'stale_input' });
    expect(staleStore.writeLog).toEqual([]);

    const conflictStore = new MemoryStore(input.context);
    conflictStore.claims.set('99999999-9999-4999-8999-999999999999', {
      id: '99999999-9999-4999-8999-999999999999', title: 'Conflicting row', category: 'asset_specific',
      claim: 'Different meaning.', evidence: [], reasoning: null, backing: null, qualifier: null,
      rebuttal: [], timeHorizon: null, relevantTickers: [], status: 'draft',
      sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-2',
    });
    await expect(recordResearchPublication(
      { prepared: input.prepared, authorization: input.authorization },
      { store: conflictStore, now: new Date('2026-08-08T10:01:00.000Z') },
    )).rejects.toBeInstanceOf(ResearchPublicationRecordingError);
    expect(conflictStore.writeLog).toEqual([]);
  });
});
