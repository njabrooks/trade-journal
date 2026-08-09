import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT,
  buildBeliefResearchRelationContext,
  digestBeliefResearchRelationContext,
  digestBeliefResearchRelationRecording,
  prepareBeliefResearchRelationRecording,
  validateBeliefResearchRelationResult,
  type BeliefResearchRelationContext,
  type BeliefResearchRelationRecordingAuthorization,
} from '../src/lib/intelligence/beliefResearchRelation.js';
import {
  BeliefResearchRelationRecordingError,
  recordBeliefResearchRelation,
  type BeliefResearchRelationAuditRecord,
  type BeliefResearchRelationDecisionRecord,
  type BeliefResearchRelationMappingRecord,
  type BeliefResearchRelationStore,
  type BeliefResearchRelationTransaction,
} from '../scripts/ops/record-belief-research-relation.js';

const INSIGHT_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_ID = '33333333-3333-4333-8333-333333333333';
const CLAIM_2_ID = '99999999-9999-4999-8999-999999999999';
const THESIS_ID = '44444444-4444-4444-8444-444444444444';
const THESIS_2_ID = '55555555-5555-4555-8555-555555555555';

function fixture() {
  const repository = {
    existingMainClaims: [
      { id: CLAIM_ID, title: 'Foundry scarcity', category: 'asset_specific' as const,
        claim: 'Leading-edge capacity remains constrained.', status: 'complete',
        sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-1' },
      { id: CLAIM_2_ID, title: 'Power scarcity', category: 'asset_specific' as const,
        claim: 'Power availability constrains deployments.', status: 'complete',
        sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-2' },
    ],
    theses: [
      { id: THESIS_ID, type: 'asset' as const, title: 'TSM pricing', description: 'Scarcity supports pricing.',
        direction: 'bullish', status: 'developing' as const, ticker: 'TSM', argument: {
          source: 'latest_articulation' as const,
          coreArgument: 'Capacity scarcity sustains TSM pricing power.', keyDrivers: ['Reservations exceed supply.'],
          keyAssumptions: ['Demand remains resilient.'],
        } },
      { id: THESIS_2_ID, type: 'macro' as const, title: 'AI build-out', description: 'Infrastructure is scarce.',
        direction: 'bullish', status: 'monitoring' as const, ticker: null, argument: {
          source: 'description' as const,
          coreArgument: 'Physical bottlenecks constrain the AI infrastructure build-out.',
          keyDrivers: [], keyAssumptions: ['AI demand persists.'],
        } },
    ], existingRelationships: [],
  };
  const context = buildBeliefResearchRelationContext({
    authority: 'scope:notes', artifactId: '11111111-1111-4111-8111-111111111111',
    insightId: INSIGHT_ID, title: 'Infrastructure constraints', sourceType: 'article',
    sourceUrl: 'https://example.test/source', contentSha256: `sha256:${'a'.repeat(64)}`,
    observedAt: '2026-08-09T08:00:00.000Z', claims: [
      { sourceClaimId: 'claim-1', title: 'Foundry scarcity', category: 'asset_specific',
        claim: 'Leading-edge capacity remains constrained.', evidence: ['Capacity is committed.'],
        reasoning: 'Long lead times.', backing: 'Construction schedules.', qualifier: 'medium',
        rebuttal: ['Demand may fall.'], timeHorizon: 'medium_term', relevantTickers: ['TSM'] },
      { sourceClaimId: 'claim-2', title: 'Power scarcity', category: 'asset_specific',
        claim: 'Power availability constrains deployments.', evidence: ['Connection queues are long.'],
        reasoning: 'Power is required before deployment.', backing: 'Utility disclosures.', qualifier: 'medium',
        rebuttal: ['On-site power may help.'], timeHorizon: 'medium_term', relevantTickers: ['VRT'] },
    ],
  }, repository);
  const result = validateBeliefResearchRelationResult(context, {
    contractVersion: '1.0.0', contextDigest: digestBeliefResearchRelationContext(context), status: 'ready',
    sourceEvidence: context.sourceEvidence.map(({ sourceClaimId }) => ({ insightId: INSIGHT_ID, sourceClaimId })),
    relations: [{
      relationId: `relation:claim-1:asset:${THESIS_ID}`, sourceClaimId: 'claim-1', mainClaimRef: CLAIM_ID,
      claimDisposition: 'reuse_exact_provenance', thesisId: THESIS_ID, thesisType: 'asset',
      relationship: 'supports', confidence: 'high', rationale: 'Scarcity directly supports pricing power.',
      bearingProof: { kind: 'direct_semantic_bearing', claimAnchor: 'Leading-edge capacity remains constrained.',
        thesisAnchor: 'Capacity scarcity sustains TSM pricing power.',
        connection: 'Capacity scarcity is the thesis causal premise.' },
    }],
    ambiguities: [{
      sourceClaimId: 'claim-2', axis: 'thesis_bearing', candidateMainClaimIds: [CLAIM_2_ID],
      candidateThesisIds: [THESIS_ID, THESIS_2_ID],
      reason: 'Power constraints could bear on either the asset or macro thesis; choosing requires judgment.',
    }], deferred: [], unrelated: [], execution: { mode: 'recommendation_only', writes: [] }, limitations: ['No provider writes.'],
  });
  const prepared = prepareBeliefResearchRelationRecording(context, result);
  const authorization: BeliefResearchRelationRecordingAuthorization = {
    contractVersion: '1.0.0', type: 'belief_research_relation_authorization',
    authorizationId: '77777777-7777-4777-8777-777777777777', authorizedBy: 'user',
    authorizedAt: '2026-08-09T09:00:00.000Z', expiresAt: '2026-08-09T10:00:00.000Z',
    recordingDigest: prepared.recordingDigest,
    acceptedRelationIds: prepared.relationCandidates.map(({ relationId }) => relationId),
    acceptedDecisionIds: prepared.decisionCandidates.map(({ decisionId }) => decisionId),
    statement: BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT,
  };
  return { context, result, prepared, authorization };
}

class MemoryStore implements BeliefResearchRelationStore {
  mappings = new Map<string, BeliefResearchRelationMappingRecord>();
  decisions = new Map<string, BeliefResearchRelationDecisionRecord>();
  audits = new Map<string, BeliefResearchRelationAuditRecord>();
  writes: string[] = [];
  failDecision = false;

  constructor(public current: BeliefResearchRelationContext = fixture().context) {}

  async transaction<T>(work: (transaction: BeliefResearchRelationTransaction) => Promise<T>): Promise<T> {
    const mappings = new Map(this.mappings);
    const decisions = new Map(this.decisions);
    const audits = new Map(this.audits);
    const writes = [...this.writes];
    const tx: BeliefResearchRelationTransaction = {
      acquireAuthorizationLock: async () => undefined,
      loadCurrentContext: async () => this.current,
      loadRecordedOperation: async (id) => audits.get(id) ?? null,
      loadClaimById: async (id) => this.current.claimResolutions.some(({ mainClaimId }) => mainClaimId === id)
        ? { id, sourceInsightId: INSIGHT_ID, sourceClaimId: id === CLAIM_ID ? 'claim-1' : 'claim-2' } : null,
      loadThesisById: async (id, type) => {
        const thesis = this.current.thesisTargets.find((item) => item.id === id && item.type === type);
        return thesis ? { id, type, status: thesis.status } : null;
      },
      loadClaimThesisMapping: async (claimId, thesisId, thesisType) =>
        mappings.get(`${claimId}:${thesisType}:${thesisId}`) ?? null,
      insertClaimThesisMapping: async (row) => {
        const record = { ...row, id: randomUUID() };
        mappings.set(`${row.mainClaimId}:${row.thesisType}:${row.thesisId}`, record);
        writes.push('claim_thesis_mappings');
        return record;
      },
      loadDecisionItem: async (decisionId) => decisions.get(decisionId) ?? null,
      insertDecisionItem: async (row) => {
        if (this.failDecision) throw new Error('injected Decision Item failure');
        const record = { ...row, id: randomUUID() };
        decisions.set(row.decisionId, record); writes.push('journal_entries:decision_required');
        return record;
      },
      insertAuditEntry: async (row) => {
        const record = { ...row, id: randomUUID() };
        audits.set(row.authorizationId, record); writes.push('journal_entries:audit');
        return record;
      },
    };
    const result = await work(tx);
    this.mappings = mappings; this.decisions = decisions; this.audits = audits; this.writes = writes;
    return result;
  }
}

describe('governed belief-research relation recorder', () => {
  it('writes only exact relationships, unresolved Decision Items, and a complete audit', async () => {
    const input = fixture(); const store = new MemoryStore(input.context);
    const result = await recordBeliefResearchRelation(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-09T09:01:00.000Z') },
    );
    expect(result).toMatchObject({
      status: 'recorded', authorizationId: input.authorization.authorizationId,
      relationships: [{ disposition: 'created', mainClaimId: CLAIM_ID, thesisId: THESIS_ID }],
      decisions: [{ disposition: 'created', decisionId: input.prepared.decisionCandidates[0].decisionId }],
      writes: [
        { table: 'claim_thesis_mappings', operation: 'insert', count: 1 },
        { table: 'journal_entries', operation: 'insert', count: 2 },
      ],
    });
    expect([...store.decisions.values()][0]).toMatchObject({
      actionType: 'decision_required', status: 'active',
      packet: { decision_type: 'confirm_claim_link', resolution: null },
    });
    expect([...store.decisions.values()][0].packet.related_objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'claim', id: CLAIM_2_ID }),
      expect.objectContaining({ type: 'macro_thesis', id: THESIS_2_ID }),
    ]));
    expect([...store.audits.values()][0]).toMatchObject({
      actionType: 'belief_research_relation_recorded', snapshot: {
        authorization: input.authorization,
        acceptedRelationships: [{ candidate: expect.objectContaining({ bearingProof: expect.any(Object) }) }],
        surfacedDecisions: [{ candidate: expect.objectContaining({ axis: 'thesis_bearing' }) }],
        sourceEvidence: expect.arrayContaining([
          expect.objectContaining({ sourceClaimId: 'claim-1', qualifier: 'medium', rebuttal: ['Demand may fall.'] }),
        ]),
        thesisArguments: expect.arrayContaining([
          expect.objectContaining({ id: THESIS_ID, argument: expect.objectContaining({ digest: expect.stringMatching(/^sha256:/) }) }),
        ]),
        permittedWriteSurface: input.prepared.permittedWriteSurface,
        forbiddenAuthority: input.prepared.forbiddenAuthority,
      },
    });
    expect(new Set(store.writes)).toEqual(new Set([
      'claim_thesis_mappings', 'journal_entries:decision_required', 'journal_entries:audit',
    ]));
  });

  it('is idempotent for the exact authorization and safe existing relationships/decisions', async () => {
    const input = fixture(); const store = new MemoryStore(input.context);
    const first = await recordBeliefResearchRelation(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-09T09:01:00.000Z') },
    );
    const writes = [...store.writes];
    const second = await recordBeliefResearchRelation(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-10T09:01:00.000Z') },
    );
    expect(second).toEqual(first); expect(store.writes).toEqual(writes);

    const retry = fixture(); const retryStore = new MemoryStore(retry.context);
    retryStore.mappings.set(`${CLAIM_ID}:asset:${THESIS_ID}`, {
      id: '88888888-8888-4888-8888-888888888888', mainClaimId: CLAIM_ID, thesisId: THESIS_ID,
      thesisType: 'asset', mappingType: 'supports', confidence: 'high',
      mappedBy: 'belief-research-relation', notes: 'Scarcity directly supports pricing power.',
    });
    const recorded = await recordBeliefResearchRelation(
      { prepared: retry.prepared, authorization: retry.authorization },
      { store: retryStore, now: new Date('2026-08-09T09:01:00.000Z') },
    );
    expect(recorded.relationships[0].disposition).toBe('reused');
  });

  it('refuses stale identity, thesis state, conflicts, expired or enlarged authority without writes', async () => {
    const input = fixture();
    const cases: Array<{ envelope: unknown; store: MemoryStore; code: string }> = [];
    const staleStore = new MemoryStore({ ...input.context, source: { ...input.context.source, title: 'Changed' } });
    cases.push({ envelope: { prepared: input.prepared, authorization: input.authorization }, store: staleStore, code: 'stale_input' });
    const authorityStore = new MemoryStore(input.context);
    cases.push({ envelope: { prepared: input.prepared, authorization: input.authorization, sql: 'UPDATE theses' }, store: authorityStore, code: 'authority_refused' });
    const expiredStore = new MemoryStore(input.context);
    cases.push({ envelope: { prepared: input.prepared, authorization: { ...input.authorization, expiresAt: '2026-08-09T09:00:30.000Z' } }, store: expiredStore, code: 'invalid_input' });
    const conflictStore = new MemoryStore(input.context);
    conflictStore.mappings.set(`${CLAIM_ID}:asset:${THESIS_ID}`, {
      id: randomUUID(), mainClaimId: CLAIM_ID, thesisId: THESIS_ID, thesisType: 'asset',
      mappingType: 'refutes', confidence: 'high', mappedBy: 'other', notes: 'Conflicting semantics.',
    });
    cases.push({ envelope: { prepared: input.prepared, authorization: input.authorization }, store: conflictStore, code: 'relationship_conflict' });
    for (const item of cases) {
      await expect(recordBeliefResearchRelation(item.envelope, {
        store: item.store, now: new Date('2026-08-09T09:01:00.000Z'),
      })).rejects.toMatchObject({ code: item.code });
      expect(item.store.writes).toEqual([]);
    }
  });

  it('refuses a self-digested candidate mutation that was not derived from the validated result', async () => {
    const input = fixture(); const prepared = structuredClone(input.prepared);
    prepared.relationCandidates[0].rationale = 'Provider-invented mutation after result validation.';
    const { recordingDigest: ignored, ...withoutDigest } = prepared;
    void ignored;
    prepared.recordingDigest = digestBeliefResearchRelationRecording(withoutDigest);
    const authorization = { ...input.authorization, recordingDigest: prepared.recordingDigest };
    const store = new MemoryStore(input.context);
    await expect(recordBeliefResearchRelation(
      { prepared, authorization }, { store, now: new Date('2026-08-09T09:01:00.000Z') },
    )).rejects.toMatchObject({ code: 'invalid_input' });
    expect(store.writes).toEqual([]);
  });

  it('rolls back mapping and audit work when Decision Item insertion fails', async () => {
    const input = fixture(); const store = new MemoryStore(input.context); store.failDecision = true;
    await expect(recordBeliefResearchRelation(
      { prepared: input.prepared, authorization: input.authorization },
      { store, now: new Date('2026-08-09T09:01:00.000Z') },
    )).rejects.toThrow('injected Decision Item failure');
    expect(store.mappings.size).toBe(0); expect(store.decisions.size).toBe(0);
    expect(store.audits.size).toBe(0); expect(store.writes).toEqual([]);
  });

  it('cannot create claims, resolve decisions, mutate status, or acquire wider entity/trade authority', async () => {
    const input = fixture(); const store = new MemoryStore(input.context);
    for (const field of ['mainClaim', 'statusChange', 'decisionResolution', 'strategy', 'position', 'trade', 'sql', 'supabase']) {
      await expect(recordBeliefResearchRelation({
        prepared: input.prepared, authorization: { ...input.authorization, [field]: true },
      }, { store, now: new Date('2026-08-09T09:01:00.000Z') })).rejects.toBeInstanceOf(
        BeliefResearchRelationRecordingError,
      );
    }
    expect(store.writes).toEqual([]);
  });
});
