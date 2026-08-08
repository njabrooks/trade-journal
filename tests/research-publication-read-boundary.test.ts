import { describe, expect, it } from 'vitest';
import { digestClaimsSynthesisContext } from '../src/lib/intelligence/claimsSynthesis.js';
import {
  prepareResearchPublication,
  type ResearchPublicationReadRepository,
} from '../src/lib/intelligence/researchPublicationReadBoundary.js';

const INSIGHT_ID = '22222222-2222-4222-8222-222222222222';

function repository(
  overrides: Partial<ResearchPublicationReadRepository> = {},
): ResearchPublicationReadRepository {
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
      return [{
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Foundry scarcity persists',
        category: 'asset_specific',
        claim: 'Leading-edge foundry capacity remains structurally scarce.',
        status: 'complete',
        sourceInsightId: INSIGHT_ID,
        sourceClaimId: 'claim-1',
      }];
    },
    async loadActiveTheses() {
      return [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'asset',
        title: 'Bullish TSM Capacity Pricing',
        description: 'Scarce leading-edge capacity supports pricing power.',
        direction: 'bullish',
        status: 'monitoring',
        ticker: 'TSM',
      }];
    },
    ...overrides,
  };
}

async function synthesisResult() {
  const sourceRepository = repository();
  const { prepareClaimsSynthesisContext } = await import(
    '../src/lib/intelligence/claimsSynthesisReadBoundary.js'
  );
  const prepared = await prepareClaimsSynthesisContext(INSIGHT_ID, sourceRepository);
  if (prepared.status !== 'ready') throw new Error('fixture context unavailable');
  return {
    contractVersion: '1.0.0',
    contextDigest: digestClaimsSynthesisContext(prepared.context),
    status: 'ready',
    sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-1' }],
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
      rationale: 'The capacity constraint directly bears on pricing power.',
    }],
    ambiguities: [],
    recommendations: [{
      sourceClaimId: 'claim-1',
      action: 'reuse_existing_claim',
      rationale: 'Exact provenance requires reuse.',
    }],
    execution: { mode: 'recommendation_only', writes: [] },
    limitations: ['No writes.'],
  };
}

describe('research-publication repository read boundary', () => {
  it('re-reads the complete current synthesis context and returns a compact authorization-required result', async () => {
    const calls: string[] = [];
    const sourceRepository = repository({
      async loadSource(id) {
        calls.push(`source:${id}`);
        return repository().loadSource(id);
      },
      async loadMainClaims(source) {
        calls.push(`claims:${source.insightId}`);
        return repository().loadMainClaims(source);
      },
      async loadActiveTheses() {
        calls.push('theses');
        return repository().loadActiveTheses();
      },
    });

    const prepared = await prepareResearchPublication(
      INSIGHT_ID,
      await synthesisResult(),
      sourceRepository,
    );

    expect(prepared).toMatchObject({
      status: 'authorization_required',
      source: { insightId: INSIGHT_ID },
      claimCandidates: [{ disposition: 'reuse_existing_claim' }],
      relationshipCandidates: [{ relationship: 'supports' }],
      execution: { mode: 'authorization_required', writes: [] },
    });
    expect(calls).toEqual([`source:${INSIGHT_ID}`, `claims:${INSIGHT_ID}`, 'theses']);
  });

  it('refuses unavailable, malformed, and stale input without a write plan', async () => {
    await expect(prepareResearchPublication(
      INSIGHT_ID,
      await synthesisResult(),
      repository({ async loadSource() { return null; } }),
    )).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'source_unavailable',
      execution: { mode: 'refused', writes: [] },
    });

    await expect(prepareResearchPublication(
      INSIGHT_ID,
      { ...(await synthesisResult()), directApiMutation: true },
      repository(),
    )).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'malformed_input',
      execution: { mode: 'refused', writes: [] },
    });

    await expect(prepareResearchPublication(
      INSIGHT_ID,
      { ...(await synthesisResult()), contextDigest: `sha256:${'f'.repeat(64)}` },
      repository(),
    )).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'stale_input',
      execution: { mode: 'refused', writes: [] },
    });
  });
});
