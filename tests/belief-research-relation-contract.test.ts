import { describe, expect, it } from 'vitest';
import {
  buildBeliefResearchRelationContext,
  createUnavailableBeliefResearchRelationResult,
  digestBeliefResearchRelationContext,
  prepareBeliefResearchRelationRecording,
  validateBeliefResearchRelationContext,
  validateBeliefResearchRelationRecordingAuthorization,
  validateBeliefResearchRelationResult,
  type BeliefResearchRelationRepositorySnapshot,
  type BeliefResearchRelationSource,
} from '../src/lib/intelligence/beliefResearchRelation.js';

const INSIGHT_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_ID = '33333333-3333-4333-8333-333333333333';
const DEVELOPING_THESIS_ID = '44444444-4444-4444-8444-444444444444';
const MONITORING_THESIS_ID = '55555555-5555-4555-8555-555555555555';

function fixture(): {
  source: BeliefResearchRelationSource;
  repository: BeliefResearchRelationRepositorySnapshot;
} {
  return {
    source: {
      authority: 'scope:notes',
      artifactId: '11111111-1111-4111-8111-111111111111',
      insightId: INSIGHT_ID,
      title: 'Semiconductor capacity research',
      sourceType: 'article',
      sourceUrl: 'https://example.test/research',
      contentSha256: `sha256:${'a'.repeat(64)}`,
      observedAt: '2026-08-09T08:00:00.000Z',
      claims: [{
        sourceClaimId: 'claim-1',
        title: 'Foundry scarcity persists',
        category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains structurally constrained.',
        evidence: ['Capacity is pre-committed through 2027.'],
        reasoning: 'Long construction lead times prevent rapid supply response.',
        backing: 'Foundry construction schedules.',
        qualifier: 'medium',
        rebuttal: ['A demand shock could release capacity.'],
        timeHorizon: 'medium_term',
        relevantTickers: ['TSM'],
      }],
    },
    repository: {
      existingMainClaims: [{
        id: CLAIM_ID,
        title: 'Foundry scarcity persists',
        category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains structurally constrained.',
        status: 'complete',
        sourceInsightId: INSIGHT_ID,
        sourceClaimId: 'claim-1',
      }],
      theses: [
        {
          id: DEVELOPING_THESIS_ID,
          type: 'asset',
          title: 'TSM pricing power',
          description: 'Scarce leading-edge capacity supports durable pricing power.',
          direction: 'bullish',
          status: 'developing',
          ticker: 'TSM',
          argument: {
            source: 'latest_articulation',
            coreArgument: 'TSM retains pricing power while leading-edge capacity is scarce.',
            keyDrivers: ['Capacity reservations remain above available supply.'],
            keyAssumptions: ['Demand remains resilient.'],
          },
        },
        {
          id: MONITORING_THESIS_ID,
          type: 'macro',
          title: 'AI infrastructure build-out',
          description: 'AI investment remains constrained by physical infrastructure.',
          direction: 'bullish',
          status: 'monitoring',
          ticker: null,
          argument: {
            source: 'description',
            coreArgument: 'Physical bottlenecks keep AI infrastructure investment elevated.',
            keyDrivers: [],
            keyAssumptions: ['AI demand persists.'],
          },
        },
      ],
      existingRelationships: [],
    },
  };
}

describe('belief-research-relation contract', () => {
  it('accepts complete Notes-owned provenance and preserves exact claim reuse across developing and monitoring theses', () => {
    const input = fixture();
    const context = buildBeliefResearchRelationContext(input.source, input.repository);

    expect(context.source.authority).toBe('scope:notes');
    expect(context.sourceEvidence[0]).toMatchObject({
      qualifier: 'medium',
      rebuttal: ['A demand shock could release capacity.'],
    });
    expect(context.claimResolutions).toEqual([{
      sourceClaimId: 'claim-1',
      disposition: 'reuse_exact_provenance',
      mainClaimId: CLAIM_ID,
    }]);
    expect(context.thesisTargets.map(({ status }) => status)).toEqual(['developing', 'monitoring']);
    expect(context.thesisTargets.every(({ argument }) => argument.digest.startsWith('sha256:'))).toBe(true);

    const result = validateBeliefResearchRelationResult(context, {
      contractVersion: '1.0.0',
      contextDigest: digestBeliefResearchRelationContext(context),
      status: 'ready',
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [{
        relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
        sourceClaimId: 'claim-1',
        mainClaimRef: CLAIM_ID,
        claimDisposition: 'reuse_exact_provenance',
        thesisId: DEVELOPING_THESIS_ID,
        thesisType: 'asset',
        relationship: 'supports',
        confidence: 'high',
        rationale: 'The constrained capacity claim directly supports the pricing-power premise.',
        bearingProof: {
          kind: 'direct_semantic_bearing',
          claimAnchor: 'Leading-edge foundry capacity remains structurally constrained.',
          thesisAnchor: 'TSM retains pricing power while leading-edge capacity is scarce.',
          connection: 'Persistent scarcity is the causal mechanism for durable pricing power.',
        },
      }],
      ambiguities: [], deferred: [],
      unrelated: [],
      execution: { mode: 'recommendation_only', writes: [] },
      limitations: ['No repository writes were authorized or performed.'],
    });

    expect(result.relations[0]).toMatchObject({
      mainClaimRef: CLAIM_ID,
      thesisId: DEVELOPING_THESIS_ID,
      relationship: 'supports',
    });
  });

  it('never accepts holdings, ticker overlap, keywords, or provider recommendation as semantic proof', () => {
    const input = fixture();
    const context = buildBeliefResearchRelationContext(input.source, input.repository);
    const base = {
      contractVersion: '1.0.0' as const,
      contextDigest: digestBeliefResearchRelationContext(context),
      status: 'ready' as const,
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [], ambiguities: [], deferred: [], unrelated: [],
      execution: { mode: 'recommendation_only' as const, writes: [] as [] },
      limitations: ['No writes.'],
    };
    for (const kind of ['held_security', 'ticker_overlap', 'keyword_overlap', 'provider_recommendation']) {
      expect(() => validateBeliefResearchRelationResult(context, {
        ...base,
        relations: [{
          relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
          sourceClaimId: 'claim-1', mainClaimRef: CLAIM_ID,
          claimDisposition: 'reuse_exact_provenance', thesisId: DEVELOPING_THESIS_ID,
          thesisType: 'asset', relationship: 'supports', confidence: 'high',
          rationale: 'Non-semantic shortcut.',
          bearingProof: {
            kind,
            claimAnchor: input.source.claims[0].claim,
            thesisAnchor: input.repository.theses[0].argument.coreArgument,
            connection: 'TSM appears in both records.',
          },
        }],
      } as never)).toThrow(/direct semantic-bearing proof/i);
    }
  });

  it('refuses a duplicate or invented claim identity and requires explicit ambiguity', () => {
    const input = fixture();
    const context = buildBeliefResearchRelationContext(input.source, input.repository);
    const result = {
      contractVersion: '1.0.0' as const,
      contextDigest: digestBeliefResearchRelationContext(context), status: 'ready' as const,
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [{
        relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
        sourceClaimId: 'claim-1', mainClaimRef: 'synthesized:claim-1',
        claimDisposition: 'publication_required' as const, thesisId: DEVELOPING_THESIS_ID,
        thesisType: 'asset' as const, relationship: 'supports' as const, confidence: 'high' as const,
        rationale: 'Invented duplicate.',
        bearingProof: {
          kind: 'direct_semantic_bearing' as const,
          claimAnchor: input.source.claims[0].claim,
          thesisAnchor: input.repository.theses[0].argument.coreArgument,
          connection: 'Direct causal bearing.',
        },
      }], ambiguities: [], deferred: [], unrelated: [],
      execution: { mode: 'recommendation_only' as const, writes: [] as [] }, limitations: [],
    };
    expect(() => validateBeliefResearchRelationResult(context, result)).toThrow(/claim disposition/i);

    const ambiguousRepository = structuredClone(input.repository);
    ambiguousRepository.existingMainClaims.push({
      ...ambiguousRepository.existingMainClaims[0],
      id: '66666666-6666-4666-8666-666666666666',
    });
    expect(() => buildBeliefResearchRelationContext(input.source, ambiguousRepository))
      .toThrow(/ambiguous provenance/i);
  });

  it('exposes the complete identity catalog and defers unpromoted claims instead of inventing a relation', () => {
    const input = fixture();
    input.repository.existingMainClaims.push({
      id: '88888888-8888-4888-8888-888888888888', title: 'Different claim', category: 'macro',
      claim: 'A distinct catalog claim.', status: 'draft', sourceInsightId: null, sourceClaimId: null,
    });
    const withoutPromotion = structuredClone(input.repository);
    withoutPromotion.existingMainClaims = withoutPromotion.existingMainClaims.filter(({ id }) => id !== CLAIM_ID);
    const context = buildBeliefResearchRelationContext(input.source, withoutPromotion);
    expect(context.mainClaimCatalog).toHaveLength(1);
    expect(context.claimResolutions).toEqual([{
      sourceClaimId: 'claim-1', disposition: 'publication_required', mainClaimId: null,
    }]);
    expect(validateBeliefResearchRelationResult(context, {
      contractVersion: '1.0.0', contextDigest: digestBeliefResearchRelationContext(context), status: 'ready',
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [], ambiguities: [],
      deferred: [{
        sourceClaimId: 'claim-1', reason: 'claim_publication_required',
        detail: 'No exact promoted provenance claim exists; use the governed research-publication Capability first.',
      }],
      unrelated: [], execution: { mode: 'recommendation_only', writes: [] }, limitations: [],
    }).deferred).toHaveLength(1);

    expect(() => validateBeliefResearchRelationResult(context, {
      contractVersion: '1.0.0', contextDigest: digestBeliefResearchRelationContext(context), status: 'ready',
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [{
        relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
        sourceClaimId: 'claim-1', mainClaimRef: 'authority-approved:claim-1',
        claimDisposition: 'publication_required', thesisId: DEVELOPING_THESIS_ID, thesisType: 'asset',
        relationship: 'supports', confidence: 'high', rationale: 'Not yet published.',
        bearingProof: { kind: 'direct_semantic_bearing', claimAnchor: input.source.claims[0].claim,
          thesisAnchor: input.repository.theses[0].argument.coreArgument, connection: 'Direct.' },
      }], ambiguities: [], deferred: [], unrelated: [],
      execution: { mode: 'recommendation_only', writes: [] }, limitations: [],
    })).toThrow(/promoted.*first|publication/i);
  });

  it('requires exact evidence coverage and rejects duplicate logical or over-bounded relations', () => {
    const input = fixture(); const context = buildBeliefResearchRelationContext(input.source, input.repository);
    const relation = {
      relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
      sourceClaimId: 'claim-1', mainClaimRef: CLAIM_ID, claimDisposition: 'reuse_exact_provenance' as const,
      thesisId: DEVELOPING_THESIS_ID, thesisType: 'asset' as const, relationship: 'supports' as const,
      confidence: 'high' as const, rationale: 'Direct.', bearingProof: {
        kind: 'direct_semantic_bearing' as const, claimAnchor: input.source.claims[0].claim,
        thesisAnchor: input.repository.theses[0].argument.coreArgument, connection: 'Direct causal premise.',
      },
    };
    const base = {
      contractVersion: '1.0.0' as const, contextDigest: digestBeliefResearchRelationContext(context),
      status: 'ready' as const, sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [relation], ambiguities: [], deferred: [], unrelated: [],
      execution: { mode: 'recommendation_only' as const, writes: [] as [] }, limitations: [],
    };
    expect(() => validateBeliefResearchRelationResult(context, {
      ...base, sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'wrong' }],
    })).toThrow(/source evidence/i);
    expect(() => validateBeliefResearchRelationResult(context, {
      ...base, relations: [relation, { ...relation, relationId: `${relation.relationId}:duplicate` }],
    })).toThrow(/duplicate logical relationship/i);
    expect(() => validateBeliefResearchRelationResult(context, {
      ...base, relations: Array.from({ length: 6 }, (_, index) => ({
        ...relation, relationId: `${relation.relationId}:${index}`, thesisId: `${index}`,
      })),
    })).toThrow(/five-relations-per-claim|five relations per source claim/i);
  });

  it('requires complete bounded coverage and rejects ambiguous bearing that is silently linked', () => {
    const input = fixture();
    const context = buildBeliefResearchRelationContext(input.source, input.repository);
    const ready = {
      contractVersion: '1.0.0' as const,
      contextDigest: digestBeliefResearchRelationContext(context), status: 'ready' as const,
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [], ambiguities: [], deferred: [], unrelated: [],
      execution: { mode: 'recommendation_only' as const, writes: [] as [] }, limitations: [],
    };
    expect(() => validateBeliefResearchRelationResult(context, ready)).toThrow(/coverage/i);

    const explicit = validateBeliefResearchRelationResult(context, {
      ...ready,
      ambiguities: [{
        sourceClaimId: 'claim-1', axis: 'thesis_bearing',
        candidateMainClaimIds: [CLAIM_ID],
        candidateThesisIds: [DEVELOPING_THESIS_ID, MONITORING_THESIS_ID],
        reason: 'The source bears on physical scarcity, but which thesis premise it governs requires judgment.',
      }], deferred: [],
    });
    expect(explicit.ambiguities).toHaveLength(1);
    expect(() => validateBeliefResearchRelationResult(context, {
      ...explicit,
      relations: [{
        relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
        sourceClaimId: 'claim-1', mainClaimRef: CLAIM_ID,
        claimDisposition: 'reuse_exact_provenance', thesisId: DEVELOPING_THESIS_ID,
        thesisType: 'asset', relationship: 'supports', confidence: 'low', rationale: 'Maybe.',
        bearingProof: {
          kind: 'direct_semantic_bearing', claimAnchor: input.source.claims[0].claim,
          thesisAnchor: input.repository.theses[0].argument.coreArgument, connection: 'Uncertain.',
        },
      }],
    })).toThrow(/ambiguity.*silently/i);
  });

  it('refuses malformed, stale, unsupported, and authority-ambiguous contexts and results', () => {
    const input = fixture();
    expect(() => buildBeliefResearchRelationContext(
      { ...input.source, authority: 'scope:trade-journal' } as never,
      input.repository,
    )).toThrow(/Notes/i);
    expect(() => buildBeliefResearchRelationContext(
      { ...input.source, contentSha256: 'stale-or-malformed' },
      input.repository,
    )).toThrow(/SHA-256/i);
    expect(() => buildBeliefResearchRelationContext(
      { ...input.source, claims: [] },
      input.repository,
    )).toThrow(/at least one/i);
    expect(() => buildBeliefResearchRelationContext(
      { ...input.source, claims: Array.from({ length: 26 }, (_, index) => ({
        ...input.source.claims[0], sourceClaimId: `claim-${index}`,
      })) },
      input.repository,
    )).toThrow(/at most 25/i);
    expect(() => validateBeliefResearchRelationContext({
      ...buildBeliefResearchRelationContext(input.source, input.repository),
      sourceEvidence: [{ ...input.source.claims[0], qualifier: undefined }],
    })).toThrow(/qualifier/i);
  });

  it('prepares only exact reusable relationship writes and user-only authorization', () => {
    const input = fixture();
    const context = buildBeliefResearchRelationContext(input.source, input.repository);
    const result = validateBeliefResearchRelationResult(context, {
      contractVersion: '1.0.0', contextDigest: digestBeliefResearchRelationContext(context), status: 'ready',
      sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
      relations: [{
        relationId: `relation:claim-1:asset:${DEVELOPING_THESIS_ID}`,
        sourceClaimId: 'claim-1', mainClaimRef: CLAIM_ID,
        claimDisposition: 'reuse_exact_provenance', thesisId: DEVELOPING_THESIS_ID,
        thesisType: 'asset', relationship: 'supports', confidence: 'high',
        rationale: 'Direct causal bearing.', bearingProof: {
          kind: 'direct_semantic_bearing', claimAnchor: input.source.claims[0].claim,
          thesisAnchor: input.repository.theses[0].argument.coreArgument,
          connection: 'Scarcity sustains pricing power.',
        },
      }], ambiguities: [], deferred: [], unrelated: [],
      execution: { mode: 'recommendation_only', writes: [] }, limitations: [],
    });
    const prepared = prepareBeliefResearchRelationRecording(context, result);
    expect(prepared).toMatchObject({
      status: 'authorization_required',
      relationCandidates: [{ mainClaimId: CLAIM_ID, thesisId: DEVELOPING_THESIS_ID }],
      permittedWriteSurface: {
        tables: ['claim_thesis_mappings', 'journal_entries'],
      },
      forbiddenAuthority: expect.arrayContaining([
        'main_claims', 'thesis_status', 'decision_resolution', 'strategies', 'positions', 'trades',
      ]),
    });
    expect(() => validateBeliefResearchRelationRecordingAuthorization(prepared, {
      contractVersion: '1.0.0', type: 'belief_research_relation_authorization',
      authorizationId: '77777777-7777-4777-8777-777777777777',
      authorizedBy: 'provider', authorizedAt: '2026-08-09T09:00:00.000Z',
      expiresAt: '2026-08-09T10:00:00.000Z', recordingDigest: prepared.recordingDigest,
      acceptedRelationIds: prepared.relationCandidates.map(({ relationId }) => relationId),
      acceptedDecisionIds: [],
      statement: prepared.authorization.statement,
    }, new Date('2026-08-09T09:01:00.000Z'))).toThrow(/only the user/i);
  });

  it('returns provider-neutral unavailable states without write authority', () => {
    expect(createUnavailableBeliefResearchRelationResult('database_unavailable', 'connection refused'))
      .toEqual({
        contractVersion: '1.0.0', status: 'unavailable', reason: 'database_unavailable',
        detail: 'connection refused', execution: { mode: 'recommendation_only', writes: [] },
      });
  });
});
