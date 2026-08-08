import { describe, expect, it } from 'vitest';
import {
  buildResearchPublication,
  CLAIMS_SYNTHESIS_PACKAGE_DIGEST,
  CLAIMS_SYNTHESIS_SOURCE_RELEASE,
  RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
  validateResearchPublicationAuthorization,
} from '../src/lib/intelligence/researchPublication.js';
import {
  digestClaimsSynthesisContext,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisReadyResult,
} from '../src/lib/intelligence/claimsSynthesis.js';

const context: ClaimsSynthesisContext = {
  contractVersion: '1.0.0',
  source: {
    authority: 'scope:notes',
    artifactId: '11111111-1111-4111-8111-111111111111',
    insightId: '22222222-2222-4222-8222-222222222222',
    title: 'Semiconductor capacity and demand',
    sourceType: 'article',
    sourceUrl: 'https://example.test/source',
    contentSha256: `sha256:${'a'.repeat(64)}`,
    observedAt: '2026-08-08T09:30:00.000Z',
  },
  sourceEvidence: [
    {
      sourceClaimId: 'claim-1',
      title: 'Leading-edge capacity remains constrained',
      category: 'asset_specific',
      claim: 'Leading-edge foundry capacity remains constrained through 2027.',
      evidence: ['Announced capacity is substantially pre-committed.'],
      reasoning: 'Long lead times prevent supply from responding quickly.',
      backing: 'Foundry construction and qualification cycles span multiple years.',
      qualifier: 'medium',
      rebuttal: ['Demand could fall before the new capacity is commissioned.'],
      timeHorizon: 'medium_term',
      relevantTickers: ['TSM'],
    },
    {
      sourceClaimId: 'claim-2',
      title: 'Power constraints alter data-centre economics',
      category: 'asset_specific',
      claim: 'Grid connection delays are lengthening data-centre deployment schedules.',
      evidence: ['Utilities reported multi-year interconnection queues.'],
      reasoning: 'Delayed power access postpones revenue-generating compute capacity.',
      backing: 'Published utility interconnection queues.',
      qualifier: 'low',
      rebuttal: ['On-site generation could shorten some deployment delays.'],
      timeHorizon: 'medium_term',
      relevantTickers: ['VRT'],
    },
    {
      sourceClaimId: 'claim-3',
      title: 'AI demand remains elevated',
      category: 'asset_specific',
      claim: 'AI infrastructure demand remains elevated.',
      evidence: ['Sector orders grew year over year.'],
      reasoning: 'Order growth indicates continued investment.',
      backing: 'Supplier order reports.',
      qualifier: 'medium',
      rebuttal: ['Orders may reflect double ordering.'],
      timeHorizon: 'short_term',
      relevantTickers: ['TSM'],
    },
  ],
  existingMainClaims: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Foundry scarcity persists',
      category: 'asset_specific',
      claim: 'Leading-edge foundry capacity remains structurally scarce.',
      status: 'complete',
      sourceInsightId: '22222222-2222-4222-8222-222222222222',
      sourceClaimId: 'claim-1',
      provenanceMatch: 'exact',
    },
  ],
  thesisTargets: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'asset',
      title: 'Bullish TSM Capacity Pricing',
      description: 'Scarce leading-edge capacity supports pricing power.',
      direction: 'bullish',
      status: 'monitoring',
      ticker: 'TSM',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'asset',
      title: 'Data-centre power bottlenecks',
      description: 'Power availability constrains deployment.',
      direction: 'bullish',
      status: 'developing',
      ticker: 'VRT',
    },
  ],
};

function synthesisResult(): ClaimsSynthesisReadyResult {
  return {
    contractVersion: '1.0.0',
    contextDigest: digestClaimsSynthesisContext(context),
    status: 'ready',
    sourceEvidence: context.sourceEvidence.map(({ sourceClaimId }) => ({
      insightId: context.source.insightId,
      sourceClaimId,
    })),
    existingMainClaims: [{
      sourceClaimId: 'claim-1',
      mainClaimId: '33333333-3333-4333-8333-333333333333',
      disposition: 'reuse_exact_provenance',
    }],
    synthesizedInvestmentClaims: [{
      ...context.sourceEvidence[1],
      ref: 'synthesized:claim-2',
      title: 'Power access delays defer data-centre revenue',
      claim: 'Grid interconnection delays defer revenue-generating data-centre deployments.',
      synthesisRationale: 'A distinct investable implication that preserves source provenance.',
    }],
    thesisMappings: [
      {
        sourceClaimId: 'claim-1',
        mainClaimRef: '33333333-3333-4333-8333-333333333333',
        thesisId: '44444444-4444-4444-8444-444444444444',
        thesisType: 'asset',
        relationship: 'supports',
        confidence: 'medium',
        rationale: 'The capacity constraint directly bears on pricing power.',
      },
      {
        sourceClaimId: 'claim-2',
        mainClaimRef: 'synthesized:claim-2',
        thesisId: '55555555-5555-4555-8555-555555555555',
        thesisType: 'asset',
        relationship: 'foundation',
        confidence: 'medium',
        rationale: 'Grid delay is the causal bottleneck described by the thesis.',
      },
    ],
    ambiguities: [{
      sourceClaimId: 'claim-3',
      axis: 'claim_identity',
      kind: 'claim_distinction',
      candidateMainClaimIds: [],
      candidateThesisIds: ['44444444-4444-4444-8444-444444444444'],
      reason: 'The source assertion may duplicate another claim.',
    }],
    recommendations: [
      { sourceClaimId: 'claim-1', action: 'reuse_existing_claim', rationale: 'Exact provenance.' },
      { sourceClaimId: 'claim-2', action: 'synthesize_investment_claim', rationale: 'Distinct assertion.' },
      { sourceClaimId: 'claim-3', action: 'defer_ambiguous', rationale: 'Judgment required.' },
    ],
    execution: { mode: 'recommendation_only', writes: [] },
    limitations: ['No writes were performed by claims synthesis.'],
  };
}

describe('research-publication contract', () => {
  it('prepares only unambiguous, thesis-related claims for explicit user authorization', () => {
    const prepared = buildResearchPublication(context, synthesisResult());

    expect(prepared).toMatchObject({
      contractVersion: '1.0.0',
      status: 'authorization_required',
      source: {
        authority: 'scope:notes',
        insightId: context.source.insightId,
        contentSha256: context.source.contentSha256,
      },
      claimsSynthesis: {
        capabilityId: 'capability:scope:trade-journal/claims-synthesis',
        capabilityVersion: '1.0.0',
        sourceRelease: CLAIMS_SYNTHESIS_SOURCE_RELEASE,
        packageDigest: CLAIMS_SYNTHESIS_PACKAGE_DIGEST,
        contextDigest: digestClaimsSynthesisContext(context),
      },
      sourceEvidence: [
        { sourceClaimId: 'claim-1' },
        { sourceClaimId: 'claim-2' },
        { sourceClaimId: 'claim-3' },
      ],
      claimCandidates: [
        {
          sourceClaimId: 'claim-1',
          mainClaimRef: '33333333-3333-4333-8333-333333333333',
          disposition: 'reuse_existing_claim',
        },
        {
          sourceClaimId: 'claim-2',
          mainClaimRef: 'synthesized:claim-2',
          disposition: 'create_main_claim',
        },
      ],
      exclusions: [{
        sourceClaimId: 'claim-3',
        reason: 'claim_identity_ambiguous',
      }],
      authorization: {
        required: true,
        authorizedBy: 'user_only',
      },
      permittedWriteSurface: {
        tables: ['main_claims', 'claim_thesis_mappings', 'journal_entries'],
      },
      execution: { mode: 'authorization_required', writes: [] },
    });
    expect(prepared.relationshipCandidates).toHaveLength(2);
    expect(prepared.publicationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('preserves every ambiguity axis instead of collapsing a dual-axis refusal', () => {
    const result = synthesisResult();
    result.ambiguities.push({
      sourceClaimId: 'claim-3',
      axis: 'thesis_mapping',
      kind: 'thesis_bearing',
      candidateMainClaimIds: [],
      candidateThesisIds: ['44444444-4444-4444-8444-444444444444'],
      reason: 'The claim may be adjacent to the thesis without direct bearing.',
    });
    const prepared = buildResearchPublication(context, result);
    expect(prepared.exclusions.filter(({ sourceClaimId }) => sourceClaimId === 'claim-3')).toEqual([
      expect.objectContaining({ reason: 'claim_identity_ambiguous' }),
      expect.objectContaining({ reason: 'thesis_mapping_ambiguous' }),
    ]);
  });

  it('refuses duplicate logical relationship candidates before authorization', () => {
    const result = synthesisResult();
    result.thesisMappings.push({ ...result.thesisMappings[0] });
    expect(() => buildResearchPublication(context, result)).toThrow(
      'Duplicate governed relationship candidate',
    );
  });

  it('accepts only a short-lived digest-bound user decision naming exact claims and relationships', () => {
    const prepared = buildResearchPublication(context, synthesisResult());
    const authorization = {
      contractVersion: '1.0.0',
      type: 'research_publication_authorization',
      authorizationId: '66666666-6666-4666-8666-666666666666',
      authorizedBy: 'user',
      authorizedAt: '2026-08-08T10:00:00.000Z',
      expiresAt: '2026-08-08T22:00:00.000Z',
      publicationDigest: prepared.publicationDigest,
      acceptedClaimRefs: [
        '33333333-3333-4333-8333-333333333333',
        'synthesized:claim-2',
      ],
      acceptedRelationshipIds: prepared.relationshipCandidates.map(({ relationshipId }) => relationshipId),
      statement: RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
    };

    expect(validateResearchPublicationAuthorization(
      prepared,
      authorization,
      new Date('2026-08-08T10:01:00.000Z'),
    )).toEqual(authorization);
  });

  it.each([
    ['provider authorization', { authorizedBy: 'claude' }],
    ['wrong publication bytes', { publicationDigest: `sha256:${'f'.repeat(64)}` }],
    ['expired authority', { expiresAt: '2026-08-08T09:59:00.000Z' }],
    ['over-broad lifetime', { expiresAt: '2026-08-10T10:00:00.000Z' }],
    ['unrestricted generic write', { genericWrite: true }],
    ['direct API mutation', { directApiMutation: true }],
    ['Supabase MCP write', { supabaseMcpWrite: true }],
    ['ad-hoc SQL', { adHocSql: 'INSERT INTO main_claims ...' }],
    ['status authority', { status: 'monitoring' }],
    ['Decision Item authority', { resolveDecisionItem: true }],
    ['strategy authority', { strategyId: '77777777-7777-4777-8777-777777777777' }],
    ['position authority', { positionId: '88888888-8888-4888-8888-888888888888' }],
    ['trade authority', { placeTrade: true }],
  ])('refuses %s', (_label, override) => {
    const prepared = buildResearchPublication(context, synthesisResult());
    const authorization = {
      contractVersion: '1.0.0',
      type: 'research_publication_authorization',
      authorizationId: '66666666-6666-4666-8666-666666666666',
      authorizedBy: 'user',
      authorizedAt: '2026-08-08T10:00:00.000Z',
      expiresAt: '2026-08-08T22:00:00.000Z',
      publicationDigest: prepared.publicationDigest,
      acceptedClaimRefs: ['33333333-3333-4333-8333-333333333333'],
      acceptedRelationshipIds: [prepared.relationshipCandidates[0].relationshipId],
      statement: RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
      ...override,
    };

    expect(() => validateResearchPublicationAuthorization(
      prepared,
      authorization,
      new Date('2026-08-08T10:01:00.000Z'),
    )).toThrow();
  });

  it('refuses orphan claims, relationships for unaccepted claims, and unknown candidate IDs', () => {
    const prepared = buildResearchPublication(context, synthesisResult());
    const base = {
      contractVersion: '1.0.0',
      type: 'research_publication_authorization',
      authorizationId: '66666666-6666-4666-8666-666666666666',
      authorizedBy: 'user',
      authorizedAt: '2026-08-08T10:00:00.000Z',
      expiresAt: '2026-08-08T22:00:00.000Z',
      publicationDigest: prepared.publicationDigest,
      statement: RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
    };

    expect(() => validateResearchPublicationAuthorization(prepared, {
      ...base,
      acceptedClaimRefs: prepared.claimCandidates.map(({ mainClaimRef }) => mainClaimRef),
      acceptedRelationshipIds: [prepared.relationshipCandidates[0].relationshipId],
    }, new Date('2026-08-08T10:01:00.000Z'))).toThrow(/exactly the claims used/);

    expect(() => validateResearchPublicationAuthorization(prepared, {
      ...base,
      acceptedClaimRefs: ['synthesized:claim-2'],
      acceptedRelationshipIds: [prepared.relationshipCandidates[0].relationshipId],
    }, new Date('2026-08-08T10:01:00.000Z'))).toThrow(/accepted claim/);

    expect(() => validateResearchPublicationAuthorization(prepared, {
      ...base,
      acceptedClaimRefs: ['unknown:claim'],
      acceptedRelationshipIds: ['relationship:unknown'],
    }, new Date('2026-08-08T10:01:00.000Z'))).toThrow(/candidate/);
  });
});
