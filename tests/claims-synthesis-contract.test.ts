import { describe, expect, it } from 'vitest';
import {
  buildClaimsSynthesisContext,
  createUnavailableClaimsSynthesisResult,
  digestClaimsSynthesisContext,
  validateClaimsSynthesisResult,
  validateClaimsSynthesisSource,
} from '../src/lib/intelligence/claimsSynthesis.js';

const sourceInput = {
  authority: 'scope:notes',
  artifactId: '11111111-1111-4111-8111-111111111111',
  insightId: '22222222-2222-4222-8222-222222222222',
  title: 'Semiconductor capital intensity',
  sourceType: 'tana_content',
  sourceUrl: 'https://example.test/source',
  contentSha256: `sha256:${'a'.repeat(64)}`,
  observedAt: '2026-08-08T09:30:00.000Z',
  claims: [{
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
  }],
};

describe('claims-synthesis source contract', () => {
  it('accepts a complete Notes-owned provenance-bearing source claim without collapsing its Toulmin fields', () => {
    const source = validateClaimsSynthesisSource(sourceInput);

    expect(source).toMatchObject({
      authority: 'scope:notes',
      artifactId: '11111111-1111-4111-8111-111111111111',
      insightId: '22222222-2222-4222-8222-222222222222',
      claims: [{
        sourceClaimId: 'claim-1',
        qualifier: 'medium',
        rebuttal: ['Demand could fall before the new capacity is commissioned.'],
      }],
    });
  });

  it('refuses duplicate source-claim provenance within one Notes insight', () => {
    expect(() => validateClaimsSynthesisSource({
      ...sourceInput,
      claims: [sourceInput.claims[0], { ...sourceInput.claims[0] }],
    })).toThrow(/sourceClaimId.*unique/i);
  });

  it('keeps source evidence, existing main claims, and thesis targets in distinct context collections', () => {
    const context = buildClaimsSynthesisContext(sourceInput, {
      existingMainClaims: [{
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Foundry scarcity persists',
        category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains structurally scarce.',
        status: 'active',
        sourceInsightId: '22222222-2222-4222-8222-222222222222',
        sourceClaimId: 'claim-1',
      }],
      theses: [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'asset',
        title: 'Bullish TSM Capacity Pricing',
        description: 'Scarce leading-edge capacity supports pricing power.',
        direction: 'bullish',
        status: 'monitoring',
        ticker: 'TSM',
      }],
    });

    expect(context).toMatchObject({
      contractVersion: '1.0.0',
      sourceEvidence: [{ sourceClaimId: 'claim-1' }],
      existingMainClaims: [{
        id: '33333333-3333-4333-8333-333333333333',
        provenanceMatch: 'exact',
      }],
      thesisTargets: [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'asset',
        status: 'monitoring',
      }],
    });
    expect(context).not.toHaveProperty('synthesizedInvestmentClaims');
    expect(context).not.toHaveProperty('thesisMappings');
  });

  function contextWithExistingClaim() {
    return buildClaimsSynthesisContext(sourceInput, {
      existingMainClaims: [{
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Foundry scarcity persists',
        category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains structurally scarce.',
        status: 'active',
        sourceInsightId: '22222222-2222-4222-8222-222222222222',
        sourceClaimId: 'claim-1',
      }],
      theses: [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'asset',
        title: 'Bullish TSM Capacity Pricing',
        description: 'Scarce leading-edge capacity supports pricing power.',
        direction: 'bullish',
        status: 'monitoring',
        ticker: 'TSM',
      }],
    });
  }

  it('requires deterministic reuse when an existing claim has the exact Notes provenance pair', () => {
    const context = contextWithExistingClaim();
    const result = validateClaimsSynthesisResult(context, {
      contractVersion: '1.0.0',
      contextDigest: digestClaimsSynthesisContext(context),
      status: 'ready',
      sourceEvidence: [{ insightId: sourceInput.insightId, sourceClaimId: 'claim-1' }],
      existingMainClaims: [{
        sourceClaimId: 'claim-1',
        mainClaimId: '33333333-3333-4333-8333-333333333333',
        disposition: 'reuse_exact_provenance',
      }],
      synthesizedInvestmentClaims: [],
      thesisMappings: [{
        sourceClaimId: 'claim-1',
        mainClaimRef: '33333333-3333-4333-8333-333333333333',
        thesisId: '44444444-4444-4444-8444-444444444444',
        thesisType: 'asset',
        relationship: 'supports',
        confidence: 'medium',
        rationale: 'The capacity constraint directly bears on the thesis pricing mechanism.',
      }],
      ambiguities: [],
      recommendations: [{
        sourceClaimId: 'claim-1',
        action: 'reuse_existing_claim',
        rationale: 'The provenance pair is an exact match.',
      }],
      execution: { mode: 'recommendation_only', writes: [] },
      limitations: ['No provider result creates or links a claim.'],
    });

    expect(result.existingMainClaims[0]?.mainClaimId).toBe('33333333-3333-4333-8333-333333333333');
    expect(result.execution).toEqual({ mode: 'recommendation_only', writes: [] });
  });

  it('refuses to synthesize a duplicate when the Notes provenance pair already exists', () => {
    const context = contextWithExistingClaim();

    expect(() => validateClaimsSynthesisResult(context, {
      contractVersion: '1.0.0',
      contextDigest: digestClaimsSynthesisContext(context),
      status: 'ready',
      sourceEvidence: [{ insightId: sourceInput.insightId, sourceClaimId: 'claim-1' }],
      existingMainClaims: [],
      synthesizedInvestmentClaims: [{
        ref: 'synthesized:claim-1',
        sourceClaimId: 'claim-1',
        title: 'Duplicate source claim',
        category: 'asset_specific',
        claim: sourceInput.claims[0].claim,
        evidence: sourceInput.claims[0].evidence,
        reasoning: sourceInput.claims[0].reasoning,
        backing: sourceInput.claims[0].backing,
        qualifier: sourceInput.claims[0].qualifier,
        rebuttal: sourceInput.claims[0].rebuttal,
        timeHorizon: sourceInput.claims[0].timeHorizon,
        relevantTickers: sourceInput.claims[0].relevantTickers,
        synthesisRationale: 'Copy it.',
      }],
      thesisMappings: [],
      ambiguities: [],
      recommendations: [],
      execution: { mode: 'recommendation_only', writes: [] },
      limitations: [],
    })).toThrow(/exact provenance.*must be reused/i);
  });

  it('keeps ambiguous semantic matches explicit and refuses mappings for them', () => {
    const context = buildClaimsSynthesisContext(sourceInput, {
      existingMainClaims: [],
      theses: [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'asset',
        title: 'Bullish TSM Capacity Pricing',
        description: 'Scarce leading-edge capacity supports pricing power.',
        direction: 'bullish',
        status: 'developing',
        ticker: 'TSM',
      }],
    });
    const base = {
      contractVersion: '1.0.0',
      contextDigest: digestClaimsSynthesisContext(context),
      status: 'ready',
      sourceEvidence: [{ insightId: sourceInput.insightId, sourceClaimId: 'claim-1' }],
      existingMainClaims: [],
      synthesizedInvestmentClaims: [],
      ambiguities: [{
        sourceClaimId: 'claim-1',
        kind: 'semantic_match',
        candidateMainClaimIds: [],
        candidateThesisIds: ['44444444-4444-4444-8444-444444444444'],
        reason: 'Ticker overlap does not establish whether this evidence supports the pricing mechanism.',
      }],
      recommendations: [{
        sourceClaimId: 'claim-1',
        action: 'defer_ambiguous',
        rationale: 'Human investment judgment is required.',
      }],
      execution: { mode: 'recommendation_only', writes: [] },
      limitations: [],
    };

    expect(validateClaimsSynthesisResult(context, { ...base, thesisMappings: [] }).ambiguities).toHaveLength(1);
    expect(() => validateClaimsSynthesisResult(context, {
      ...base,
      thesisMappings: [{
        sourceClaimId: 'claim-1',
        mainClaimRef: 'synthesized:claim-1',
        thesisId: '44444444-4444-4444-8444-444444444444',
        thesisType: 'asset',
        relationship: 'supports',
        confidence: 'low',
        rationale: 'Ticker overlap.',
      }],
    })).toThrow(/ambiguous.*must not have thesis mappings/i);
  });

  it('bounds provider recommendations and refuses every attempted execution write', () => {
    const context = contextWithExistingClaim();
    const base = {
      contractVersion: '1.0.0',
      contextDigest: digestClaimsSynthesisContext(context),
      status: 'ready',
      sourceEvidence: [{ insightId: sourceInput.insightId, sourceClaimId: 'claim-1' }],
      existingMainClaims: [{
        sourceClaimId: 'claim-1',
        mainClaimId: '33333333-3333-4333-8333-333333333333',
        disposition: 'reuse_exact_provenance',
      }],
      synthesizedInvestmentClaims: [],
      thesisMappings: [],
      ambiguities: [],
      recommendations: Array.from({ length: 26 }, (_, index) => ({
        sourceClaimId: 'claim-1',
        action: 'reuse_existing_claim',
        rationale: `Recommendation ${index}`,
      })),
      limitations: [],
    };

    expect(() => validateClaimsSynthesisResult(context, {
      ...base,
      execution: { mode: 'recommendation_only', writes: ['direct_sql'] },
    })).toThrow(/writes must be empty/i);
    expect(() => validateClaimsSynthesisResult(context, {
      ...base,
      execution: { mode: 'recommendation_only', writes: [] },
    })).toThrow(/recommendations.*at most 25/i);
  });

  it.each([
    'adHocSql',
    'supabaseMcpWrite',
    'directApiMutation',
    'createClaim',
    'linkClaim',
    'thesisStatusChange',
    'decisionItemResolution',
    'strategyMutation',
    'positionMutation',
    'tradeAuthority',
  ])('refuses the authority-expanding field %s', (field) => {
    const context = contextWithExistingClaim();
    const input = {
      contractVersion: '1.0.0',
      contextDigest: digestClaimsSynthesisContext(context),
      status: 'ready',
      sourceEvidence: [{ insightId: sourceInput.insightId, sourceClaimId: 'claim-1' }],
      existingMainClaims: [{
        sourceClaimId: 'claim-1',
        mainClaimId: '33333333-3333-4333-8333-333333333333',
        disposition: 'reuse_exact_provenance',
      }],
      synthesizedInvestmentClaims: [],
      thesisMappings: [],
      ambiguities: [],
      recommendations: [{
        sourceClaimId: 'claim-1',
        action: 'reuse_existing_claim',
        rationale: 'Exact provenance requires reuse.',
      }],
      execution: { mode: 'recommendation_only', writes: [] },
      limitations: [],
      [field]: { requested: true },
    };

    expect(() => validateClaimsSynthesisResult(context, input)).toThrow(/unsupported fields/i);
  });

  it('returns a bounded unavailable result without inventing source or database state', () => {
    expect(createUnavailableClaimsSynthesisResult('database_unavailable', 'connection refused')).toEqual({
      contractVersion: '1.0.0',
      status: 'unavailable',
      reason: 'database_unavailable',
      detail: 'connection refused',
      execution: { mode: 'recommendation_only', writes: [] },
    });
  });
});
