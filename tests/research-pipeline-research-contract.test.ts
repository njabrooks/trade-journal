import { describe, expect, it } from 'vitest';
import {
  buildClaimsSynthesisContext,
  digestClaimsSynthesisContext,
  validateClaimsSynthesisResult,
} from '../src/lib/intelligence/claimsSynthesis.js';
import {
  buildIdeaIntakeResult,
  buildThesisFormalizationResult,
  buildUnknownMappingResult,
} from '../src/lib/intelligence/researchPipelineIntake.js';
import {
  buildResearchPreparationResult,
  buildEvidenceSynthesisResult,
  buildGateDecisionResult,
  buildGraduationResult,
  buildThesisExpressionResult,
  buildUnknownResearchResult,
  digestResearchPipelineResearchValue,
  validateResearchPipelineResearchResult,
} from '../src/lib/intelligence/researchPipelineResearch.js';
import {
  buildResearchPipelineAggregate,
  validateResearchPipelineAggregateResult,
} from '../src/lib/intelligence/researchPipeline.js';

const INSIGHT_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_DIGEST = `sha256:${'a'.repeat(64)}`;

function source() {
  return {
    authority: 'scope:notes' as const,
    insightId: INSIGHT_ID,
    claimId: 'claim-7',
    contentSha256: CONTENT_DIGEST,
  };
}

function redigestStageResult(value: Record<string, unknown>): void {
  const unsigned = structuredClone(value);
  delete unsigned.stageDigest;
  value.stageDigest = digestResearchPipelineResearchValue(unsigned);
}

function claimsSynthesis() {
  const context = buildClaimsSynthesisContext({
    authority: 'scope:notes', artifactId: '99999999-9999-4999-8999-999999999999',
    insightId: INSIGHT_ID, title: 'Copper timing source', sourceType: 'tana_content',
    sourceUrl: null, contentSha256: CONTENT_DIGEST, observedAt: '2026-08-10T08:00:00.000Z',
    claims: [{
      sourceClaimId: 'claim-7', title: 'Copper timing', category: 'asset_specific',
      claim: 'Grid investment will constrain copper supply before new mines reach production.',
      evidence: ['Permitting lead times exceed visible inventories.'],
      reasoning: 'Demand arrives before supply.', backing: 'Mine projects have long lead times.',
      qualifier: 'medium', rebuttal: ['Substitution may reduce intensity.'],
      timeHorizon: 'medium_term', relevantTickers: ['COPPER'],
    }],
  }, {
    existingMainClaims: [{
      id: '77777777-7777-4777-8777-777777777777', title: 'Copper timing',
      category: 'asset_specific', claim: 'Grid demand arrives before copper supply.', status: 'active',
      sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-7',
    }],
    theses: [],
  });
  const result = validateClaimsSynthesisResult(context, {
    contractVersion: '1.0.0', contextDigest: digestClaimsSynthesisContext(context), status: 'ready',
    sourceEvidence: [{ insightId: INSIGHT_ID, sourceClaimId: 'claim-7' }],
    existingMainClaims: [{
      sourceClaimId: 'claim-7', mainClaimId: '77777777-7777-4777-8777-777777777777',
      disposition: 'reuse_exact_provenance',
    }],
    synthesizedInvestmentClaims: [], thesisMappings: [], ambiguities: [],
    recommendations: [{
      sourceClaimId: 'claim-7', action: 'reuse_existing_claim',
      rationale: 'The provenance pair is an exact match.',
    }],
    execution: { mode: 'recommendation_only', writes: [] },
    limitations: ['No claim or relationship is written.'],
  });
  return { context, result };
}

function acceptedUnknownMapping() {
  const intake = buildIdeaIntakeResult({
    source: source(),
    claim: {
      claim: 'Grid investment will constrain copper supply before new mines reach production.',
      evidence: ['Permitting lead times exceed current visible inventories.'],
      reasoning: 'Demand arrives before the supply response can become operational.',
      backing: 'Large mines require long permitting and construction cycles.',
      qualifier: 'medium' as const,
      rebuttals: ['Substitution may reduce copper intensity.', 'Recycling may respond faster.'],
      timeHorizon: 'medium_term' as const,
      ambiguities: ['The timing and size of grid demand remain uncertain.'],
    },
    selection: {
      selectedBy: 'user' as const,
      noveltyScore: 0.72,
      noveltyOverrideRationale: null,
      rationale: 'The timing mismatch is decision-relevant and falsifiable.',
      audit: { decisionId: 'decision-intake-7', actorId: 'user', recordedAt: '2026-08-10T08:01:00.000Z' },
    },
    idea: { ideaId: 'idea-009', title: 'Copper timing', slug: 'copper-timing', confidence: 0.62 },
    thesisClassification: {
      chosenBy: 'user' as const,
      kind: 'asset' as const,
      direction: 'bullish' as const,
      thesisType: null,
      underlyingTicker: 'COPPER',
    },
  });
  const formalizationInput = {
    source: source(),
    previousStage: intake,
    thesis: {
      coreThesis: 'Copper prices will rise before 2029 because grid demand arrives before permitted mine supply.',
      primaryEconomicDriver: 'The gap between grid copper demand and commissioned mine supply.',
      valueChainImpact: 'Miners gain pricing power while manufacturers face higher costs.',
      beneficiaries: [{ name: 'Copper miners', rationale: 'Existing production captures higher prices.' }],
      victims: [{ name: 'Grid manufacturers', rationale: 'Input costs rise before substitution scales.' }],
      failureModes: [
        { title: 'Grid build slows', category: 'structural' as const, description: 'Demand does not arrive.', indicators: ['Grid capex falls.'] },
        { title: 'Supply accelerates', category: 'structural' as const, description: 'Supply arrives sooner.', indicators: ['Capacity beats plan.'] },
        { title: 'Margins fail', category: 'execution' as const, description: 'Inflation absorbs gains.', indicators: ['Margins contract.'] },
        { title: 'Timing slips', category: 'timing' as const, description: 'Deficit starts later.', indicators: ['Inventories stay flat.'] },
        { title: 'Substitution scales', category: 'external' as const, description: 'Aluminium replaces copper.', indicators: ['Intensity falls.'] },
      ],
      qualifier: 'medium' as const,
      rebuttals: [...intake.claim.rebuttals],
      ambiguities: [...intake.claim.ambiguities],
    },
    gate: {
      recommendation: 'advance' as const,
      decision: 'advance' as const,
      decidedBy: 'user' as const,
      rationale: 'The framing is accepted for research.',
      audit: { decisionId: 'decision-formalize-7', actorId: 'user', recordedAt: '2026-08-10T08:02:00.000Z' },
    },
  };
  const formalization = buildThesisFormalizationResult(formalizationInput);
  const mapping = buildUnknownMappingResult({
    source: source(),
    previousStage: formalization,
    unknowns: [
      {
        id: 'unknown-1', question: 'Will grid demand arrive before mine supply?', impact: 'high' as const,
        resolutionType: 'empirical' as const, externallyResolvable: 'yes' as const,
        killCondition: 'Commissioned mine supply exceeds grid demand growth through 2028.',
        convictionIncreaseCondition: 'Grid orders accelerate while committed mine supply remains flat.',
        recommendedSources: ['Company filings', 'Grid operator plans'], estimatedEffortHours: 6,
        researchQueries: ['Compare committed mine supply with grid demand through 2028.'],
        ambiguities: ['Announcements may not become completed projects.'], pricedIn: 'no' as const,
      },
      {
        id: 'unknown-2', question: 'Can substitution reduce copper intensity?', impact: 'medium' as const,
        resolutionType: 'technological' as const, externallyResolvable: 'partially' as const,
        killCondition: 'Aluminium reaches equivalent performance at lower installed cost.',
        convictionIncreaseCondition: 'Copper remains required in high-growth components.',
        recommendedSources: ['Equipment specifications'], estimatedEffortHours: 3,
        researchQueries: ['Measure copper substitution in grid equipment.'], ambiguities: [], pricedIn: 'partially' as const,
      },
      {
        id: 'unknown-3', question: 'Will producer margins expand?', impact: 'medium' as const,
        resolutionType: 'industry' as const, externallyResolvable: 'yes' as const,
        killCondition: 'Cost inflation offsets higher prices.',
        convictionIncreaseCondition: 'Prices rise faster than cash costs.',
        recommendedSources: ['Producer results'], estimatedEffortHours: 2,
        researchQueries: ['Compare realized prices with unit costs.'], ambiguities: [], pricedIn: 'no' as const,
      },
    ],
    researchPlan: {
      priority: ['unknown-1', 'unknown-2', 'unknown-3'], totalEstimatedEffortHours: 11,
      recommendedApproach: 'Test the supply-demand timing mismatch first.',
    },
    assessment: {
      decisiveUnknownsExist: true, allUnknownsPricedIn: false,
      thesisExternallyResearchable: true, researchPayoff: 'asymmetric' as const,
    },
    gate: {
      recommendation: 'advance' as const, decision: 'advance' as const, decidedBy: 'user' as const,
      rationale: 'The decisive unknown is externally resolvable.',
      audit: { decisionId: 'decision-unknowns-7', actorId: 'user', recordedAt: '2026-08-10T08:03:00.000Z' },
    },
  });
  return { intake, formalization, mapping };
}

function preparedResearch(
  track: 'falsification' | 'validation' | 'analogues' = 'falsification',
  unknownId = 'unknown-1',
) {
  const { formalization, mapping } = acceptedUnknownMapping();
  return buildResearchPreparationResult({
    source: source(), thesisFormalization: formalization, previousStage: mapping,
    unknownId, track, delivery: 'portable_research_brief',
  });
}

function researchedUnknown(
  unknownId = 'unknown-1',
  track: 'falsification' | 'validation' | 'analogues' = 'falsification',
) {
  const suffix = `${unknownId.at(-1)!}-${track.at(0)!}`;
  return buildUnknownResearchResult({
    source: source(), previousStage: preparedResearch(track, unknownId), researchedAt: '2026-08-10T09:00:00.000Z',
    findings: [
      {
        id: `finding-${suffix}-a`, title: 'Committed supply remains delayed',
        url: `https://www.example-regulator.gov/mines/committed-supply-${suffix}`,
        sourceType: 'government_data', credibility: 'high',
        content: 'Permitted capacity remains below demand growth through 2028.',
        bearing: 'The kill condition is not currently met.',
      },
      {
        id: `finding-${suffix}-b`, title: 'Grid orders accelerate',
        url: `https://investor.example.com/results/grid-orders-${suffix}`,
        sourceType: 'company_filing', credibility: 'high',
        content: 'Grid-equipment orders increased while committed mine supply remained flat.',
        bearing: 'The evidence supports the mechanism but leaves timing uncertain.',
      },
    ],
    assessment: {
      killCondition: 'not_triggered', convictionCondition: 'partially_met', confidence: 'medium',
      rationale: 'Independent sources align, with timing still uncertain.',
      unresolvedAmbiguities: ['Announced orders may be cancelled.'],
    },
  });
}

function synthesizedEvidence() {
  const { mapping } = acceptedUnknownMapping();
  const research = mapping.unknowns.map(({ id }) => researchedUnknown(id));
  research.push(researchedUnknown('unknown-1', 'validation'));
  return buildEvidenceSynthesisResult({
    source: source(), previousStage: mapping, researchResults: research, priorConfidence: 0.62,
    synthesis: {
      themes: [{ title: 'Supply remains slow', strength: 'strong', findingIds: ['finding-1-f-a'] }],
      contradictions: [],
      unknownResolutions: [
        { unknownId: 'unknown-1', resolution: 'resolved', killCondition: 'not_triggered', convictionCondition: 'partially_met', rationale: 'The decisive timing mismatch survives.' },
        { unknownId: 'unknown-2', resolution: 'unresolved', killCondition: 'inconclusive', convictionCondition: 'inconclusive', rationale: 'Substitution remains uncertain.' },
        { unknownId: 'unknown-3', resolution: 'unresolved', killCondition: 'inconclusive', convictionCondition: 'inconclusive', rationale: 'Margins remain uncertain.' },
      ],
      evidenceQuality: 'adequate', coreMechanismSupported: true, posteriorConfidence: 0.68,
      recommendation: 'advance', rationale: 'The decisive high-impact unknown is resolved.', modifiedThesis: null,
    },
  });
}

function expressedThesis() {
  return buildThesisExpressionResult({
    source: source(), previousStage: synthesizedEvidence(),
    entryDecision: {
      decision: 'advance', decidedBy: 'user', rationale: 'Proceed to expression analysis.',
      audit: { decisionId: 'decision-stage-5', actorId: 'user', recordedAt: '2026-08-10T09:10:00.000Z' },
    },
    expression: {
      valueChain: [{ layer: 'direct', entity: 'Copper futures', revenueSensitivity: 'high', marginImpact: 'neutral', capitalIntensity: 'low', timing: 'immediate', executionRisk: 'Timing can defeat the thesis.' }],
      candidates: [{ id: 'expression-1', instrument: 'COPPER', orderOfEffect: 'first', consensus: 'moderate', thesisRightExpressionFailsRisk: 'The deficit arrives after the contract horizon.', entryCriteria: ['Inventories decline.'], profitExitCriteria: ['The deficit is fully priced.'], lossExitCriteria: ['Supply overtakes demand.'], reviewTriggers: ['Commissioning accelerates.'], sizingInputs: { liquidity: 'high', volatility: 'high', portfolioCorrelation: 'medium', maximumAdverseScenario: 'Demand slows.', horizonAlignment: 'medium' } }],
      recommendedAction: 'act', recommendedExpressionIds: ['expression-1'],
      rationale: 'The direct expression best matches the evidence horizon.',
    },
  });
}

function acceptedFinalGate(decision: 'act' | 'watch' | 'discard' = 'watch') {
  return buildGateDecisionResult({
    source: source(), previousStage: expressedThesis(),
    gate: {
      recommendation: 'act', decision, decidedBy: 'user',
      rationale: decision === 'watch' ? 'Wait for inventory confirmation.' : 'User accepted the final disposition.',
      audit: { decisionId: 'decision-final-gate', actorId: 'user', recordedAt: '2026-08-10T09:12:00.000Z' },
    },
  });
}

describe('research-pipeline research and expression stage contracts', () => {
  it('builds a portable, deterministic, zero-write research brief from accepted provenance', () => {
    const { formalization, mapping } = acceptedUnknownMapping();
    const input = {
      source: source(),
      thesisFormalization: formalization,
      previousStage: mapping,
      unknownId: 'unknown-1',
      track: 'falsification' as const,
      delivery: 'portable_research_brief' as const,
    };

    const first = buildResearchPreparationResult(input);
    const retry = buildResearchPreparationResult(structuredClone(input));

    expect(first).toEqual(retry);
    expect(first.brief).toMatchObject({
      thesis: formalization.thesis.coreThesis,
      question: mapping.unknowns[0].question,
      killCondition: mapping.unknowns[0].killCondition,
      convictionIncreaseCondition: mapping.unknowns[0].convictionIncreaseCondition,
    });
    expect(first.brief.sourceRequirements).toEqual({
      inlineUrlsRequired: true,
      minimumIndependentSources: 2,
      primarySourcesPreferred: true,
    });
    expect(first.execution).toEqual({ mode: 'stage_result_only', writes: [] });
    expect(JSON.stringify(first)).not.toMatch(/Claude Desktop|connector|WebSearch/);
    expect(validateResearchPipelineResearchResult(first)).toEqual(first);

    expect(() => buildResearchPreparationResult({ ...input, delivery: 'claude_desktop' })).toThrow(/delivery/i);
    expect(() => buildResearchPreparationResult({ ...input, unknownId: 'unknown-99' })).toThrow(/unknownId/i);

    const forged = structuredClone(first) as unknown as Record<string, unknown>;
    delete (forged.source as Record<string, unknown>).authority;
    redigestStageResult(forged);
    expect(() => validateResearchPipelineResearchResult(forged)).toThrow(/source.*authority|missing fields/i);
  });

  it('validates source-diverse unknown research without writing or inventing unavailable evidence', () => {
    const preparation = preparedResearch();
    const input = {
      source: source(),
      previousStage: preparation,
      researchedAt: '2026-08-10T09:00:00.000Z',
      findings: [
        {
          id: 'finding-1', title: 'Committed supply remains delayed',
          url: 'https://www.example-regulator.gov/mines/committed-supply',
          sourceType: 'government_data' as const, credibility: 'high' as const,
          content: 'Permitted capacity remains below the demand-growth base case through 2028.',
          bearing: 'The kill condition is not currently met.',
        },
        {
          id: 'finding-2', title: 'Grid orders accelerate',
          url: 'https://investor.example.com/results/grid-orders',
          sourceType: 'company_filing' as const, credibility: 'high' as const,
          content: 'Reported grid-equipment orders increased while committed mine supply remained flat.',
          bearing: 'The evidence weakens the falsification case but does not resolve timing.',
        },
      ],
      assessment: {
        killCondition: 'not_triggered' as const,
        convictionCondition: 'partially_met' as const,
        confidence: 'medium' as const,
        rationale: 'Two independent sources point in the same direction, with timing still uncertain.',
        unresolvedAmbiguities: ['Announced orders may be delayed or cancelled.'],
      },
    };

    const first = buildUnknownResearchResult(input);
    if (first.status !== 'ready') throw new Error('expected ready research');
    expect(buildUnknownResearchResult(structuredClone(input))).toEqual(first);
    expect(first.findings).toHaveLength(2);
    expect(first.sourceDomains).toEqual(['example-regulator.gov', 'investor.example.com']);
    expect(first.execution.writes).toEqual([]);
    expect(validateResearchPipelineResearchResult(first)).toEqual(first);

    const oneDomain = structuredClone(input);
    oneDomain.findings[1].url = 'https://www.example-regulator.gov/mines/orders';
    expect(() => buildUnknownResearchResult(oneDomain)).toThrow(/independent source/i);

    const unavailable = buildUnknownResearchResult({
      source: source(), previousStage: preparation,
      availability: {
        status: 'unavailable',
        reason: 'No browser or supplied source bundle is available.',
        unavailablePrerequisites: ['https_source_access'],
      },
    });
    expect(unavailable).toMatchObject({
      stage: 'unknown_research', status: 'unavailable',
      execution: { mode: 'stage_result_only', writes: [] },
    });
    expect(validateResearchPipelineResearchResult(unavailable)).toEqual(unavailable);
  });

  it('synthesizes contradictions and derives an evidence gate without mutating belief state', () => {
    const { mapping } = acceptedUnknownMapping();
    const research = mapping.unknowns.map(({ id }) => researchedUnknown(id));
    research.push(researchedUnknown('unknown-1', 'validation'));
    const input = {
      source: source(), previousStage: mapping, researchResults: research, priorConfidence: 0.62,
      synthesis: {
        themes: [
          { title: 'Supply response remains slow', strength: 'strong' as const, findingIds: ['finding-1-f-a'] },
          { title: 'Demand timing is supportive but uncertain', strength: 'moderate' as const, findingIds: ['finding-1-f-b'] },
        ],
        contradictions: [
          { topic: 'Order conversion', positionA: 'Orders imply near-term demand.', positionB: 'Orders may be delayed.', resolution: 'unresolved' as const },
        ],
        unknownResolutions: [
          { unknownId: 'unknown-1', resolution: 'resolved' as const, killCondition: 'not_triggered' as const, convictionCondition: 'partially_met' as const, rationale: 'The timing mismatch survives.' },
          { unknownId: 'unknown-2', resolution: 'unresolved' as const, killCondition: 'inconclusive' as const, convictionCondition: 'inconclusive' as const, rationale: 'Substitution remains uncertain.' },
          { unknownId: 'unknown-3', resolution: 'unresolved' as const, killCondition: 'inconclusive' as const, convictionCondition: 'inconclusive' as const, rationale: 'Margin capture remains uncertain.' },
        ],
        evidenceQuality: 'adequate' as const,
        coreMechanismSupported: true,
        posteriorConfidence: 0.68,
        recommendation: 'advance' as const,
        rationale: 'The decisive high-impact unknown is resolved without a kill trigger.',
        modifiedThesis: null,
      },
    };

    const result = buildEvidenceSynthesisResult(input);
    expect(buildEvidenceSynthesisResult(structuredClone(input))).toEqual(result);
    expect(result.confidenceChange).toBeCloseTo(0.06);
    expect(result.researchResultDigests).toEqual(research.map(({ stageDigest }) => stageDigest).sort());
    expect(result.execution.writes).toEqual([]);
    expect(validateResearchPipelineResearchResult(result)).toEqual(result);

    const forcedAdvance = structuredClone(input);
    forcedAdvance.synthesis.posteriorConfidence = 0.42;
    forcedAdvance.synthesis.recommendation = 'advance';
    expect(() => buildEvidenceSynthesisResult(forcedAdvance)).toThrow(/recommendation must be kill/i);

    const criticalGap = structuredClone(input);
    criticalGap.synthesis.unknownResolutions[0].resolution = 'unresolved';
    criticalGap.synthesis.recommendation = 'advance';
    expect(() => buildEvidenceSynthesisResult(criticalGap)).toThrow(/recommendation must be hold/i);

    expect(() => buildEvidenceSynthesisResult({ ...input, researchResults: [research[0]] }))
      .toThrow(/cover every mapped unknown at least once/i);

    const prematureModify = structuredClone(input) as unknown as Record<string, unknown>;
    const prematureSynthesis = prematureModify.synthesis as Record<string, unknown>;
    prematureSynthesis.posteriorConfidence = 0.6;
    prematureSynthesis.modifiedThesis = 'A narrower but still unvalidated thesis.';
    prematureSynthesis.recommendation = 'modify';
    expect(() => buildEvidenceSynthesisResult(prematureModify)).toThrow(/recommendation must be hold/i);

    const duplicateResolution = structuredClone(result) as unknown as Record<string, unknown>;
    const duplicatedSynthesis = duplicateResolution.synthesis as Record<string, unknown>;
    const duplicatedResolutions = duplicatedSynthesis.unknownResolutions as Array<Record<string, unknown>>;
    duplicatedResolutions[1].unknownId = duplicatedResolutions[0].unknownId;
    redigestStageResult(duplicateResolution);
    expect(() => validateResearchPipelineResearchResult(duplicateResolution)).toThrow(/unique unknown IDs/i);
  });

  it('frames thesis expressions and sizing inputs without recommending a size or acquiring trade authority', () => {
    const evidence = synthesizedEvidence();
    const input = {
      source: source(), previousStage: evidence,
      entryDecision: {
        decision: 'advance' as const, decidedBy: 'user' as const,
        rationale: 'Proceed to expression analysis without authorizing a trade.',
        audit: { decisionId: 'decision-stage-5', actorId: 'user', recordedAt: '2026-08-10T09:10:00.000Z' },
      },
      expression: {
        valueChain: [
          { layer: 'upstream' as const, entity: 'Existing copper miners', revenueSensitivity: 'high' as const, marginImpact: 'improve' as const, capitalIntensity: 'high' as const, timing: 'one_to_two_years' as const, executionRisk: 'Cost inflation may absorb price gains.' },
          { layer: 'direct' as const, entity: 'Copper futures', revenueSensitivity: 'high' as const, marginImpact: 'neutral' as const, capitalIntensity: 'low' as const, timing: 'immediate' as const, executionRisk: 'Roll and timing can defeat the thesis.' },
        ],
        candidates: [
          { id: 'expression-1', instrument: 'COPPER', orderOfEffect: 'first' as const, consensus: 'moderate' as const, thesisRightExpressionFailsRisk: 'The deficit may arrive after the contract horizon.', entryCriteria: ['Visible inventories decline with grid orders rising.'], profitExitCriteria: ['The supply deficit is fully reflected in the curve.'], lossExitCriteria: ['Committed supply overtakes demand growth.'], reviewTriggers: ['Mine commissioning accelerates.'], sizingInputs: { liquidity: 'high', volatility: 'high', portfolioCorrelation: 'medium', maximumAdverseScenario: 'A cyclical slowdown delays grid demand.', horizonAlignment: 'medium' } },
        ],
        recommendedAction: 'act' as const,
        recommendedExpressionIds: ['expression-1'],
        rationale: 'The direct expression best matches the evidence horizon, subject to human allocation judgment.',
      },
    };

    const result = buildThesisExpressionResult(input);
    expect(buildThesisExpressionResult(structuredClone(input))).toEqual(result);
    expect(result.execution.writes).toEqual([]);
    expect(JSON.stringify(result.expression)).not.toMatch(/positionSize|quantity|placeOrder|trade authority/i);
    expect(validateResearchPipelineResearchResult(result)).toEqual(result);

    const inferred = structuredClone(input) as Record<string, unknown>;
    (inferred.expression as Record<string, unknown>).positionSize = '10%';
    expect(() => buildThesisExpressionResult(inferred)).toThrow(/unsupported fields/i);

    const noEntryJudgment = structuredClone(input);
    noEntryJudgment.entryDecision.decidedBy = 'provider' as 'user';
    expect(() => buildThesisExpressionResult(noEntryJudgment)).toThrow(/decidedBy must be user/i);
  });

  it('keeps the final gate pending until an audited user decision, including an explicit override', () => {
    const expression = expressedThesis();
    const pendingInput = {
      source: source(), previousStage: expression,
      gate: {
        recommendation: 'act' as const, decision: null, decidedBy: null,
        rationale: 'The evidence supports action, but allocation judgment belongs to the user.', audit: null,
      },
    };
    const pending = buildGateDecisionResult(pendingInput);
    expect(pending.status).toBe('judgment_required');
    expect(pending.execution.writes).toEqual([]);

    const acceptedInput = structuredClone(pendingInput) as Omit<typeof pendingInput, 'gate'> & {
      gate: {
        recommendation: 'act' | 'watch' | 'discard';
        decision: 'act' | 'watch' | 'discard' | null;
        decidedBy: 'user' | null;
        rationale: string;
        audit: { decisionId: string; actorId: string; recordedAt: string } | null;
      };
    };
    acceptedInput.gate.decision = 'watch';
    acceptedInput.gate.decidedBy = 'user';
    acceptedInput.gate.audit = {
      decisionId: 'decision-final-gate', actorId: 'user', recordedAt: '2026-08-10T09:12:00.000Z',
    };
    acceptedInput.gate.rationale = 'Override to watch until inventories confirm the timing.';
    const accepted = buildGateDecisionResult(acceptedInput);
    expect(accepted.status).toBe('ready');
    expect(accepted.gate).toMatchObject({ recommendation: 'act', decision: 'watch', decidedBy: 'user' });
    expect(validateResearchPipelineResearchResult(accepted)).toEqual(accepted);

    const providerDecision = structuredClone(acceptedInput) as Record<string, unknown>;
    (providerDecision.gate as Record<string, unknown>).decidedBy = 'provider';
    expect(() => buildGateDecisionResult(providerDecision)).toThrow(/decidedBy must be user/i);
  });

  it('prepares a provenance-bound graduation handoff with no persistence or lifecycle authority', () => {
    const gate = acceptedFinalGate('watch');
    const input = {
      source: source(), previousStage: gate,
      claimsSynthesis: claimsSynthesis(),
      acceptance: {
        decision: null, decidedBy: null,
        rationale: 'The exact graduation handoff awaits user review.', audit: null,
      },
      handoff: {
        disposition: 'prepare_thesis_handoff' as const,
        thesisCandidate: {
          kind: 'asset' as const, title: 'Copper grid demand and mine lead times',
          direction: 'bullish' as const, thesisType: null, underlyingTicker: 'COPPER',
          initialLifecycle: 'developing' as const,
        },
        provenanceClaims: [
          { sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-7', existingMainClaimId: '77777777-7777-4777-8777-777777777777' },
        ],
        articulation: { required: true as const, deriveResolutionFromRebuttals: true as const },
        dependencyStates: [
          { capabilityId: 'capability:scope:trade-journal/claims-synthesis' as const, state: 'registry_locked' as const },
          { capabilityId: 'capability:scope:trade-journal/research-publication' as const, state: 'registry_locked' as const },
          { capabilityId: 'capability:scope:trade-journal/belief-research-relation' as const, state: 'registry_locked' as const },
          { capabilityId: 'capability:scope:trade-journal/thesis-underwriting' as const, state: 'registry_locked' as const },
        ],
      },
    };

    const pending = buildGraduationResult(input);
    expect(pending.status).toBe('judgment_required');
    const acceptedInput = structuredClone(input) as unknown as Record<string, unknown>;
    acceptedInput.acceptance = {
      decision: 'accept', decidedBy: 'user', rationale: 'Proceed with this exact handoff.',
      audit: {
        decisionId: 'decision-graduation', actorId: 'user', recordedAt: '2026-08-10T09:15:00.000Z',
        boundaryDigest: pending.acceptanceBoundaryDigest,
      },
    };
    const result = buildGraduationResult(acceptedInput);
    expect(buildGraduationResult(structuredClone(acceptedInput))).toEqual(result);
    expect(result.status).toBe('ready');
    expect(result.handoff.thesisCandidate?.initialLifecycle).toBe('developing');
    expect(result.execution.writes).toEqual([]);
    expect(JSON.stringify(result.handoff)).not.toMatch(/monitoring|strategyId|positionId|orderId|tradeId|configureSignal/i);
    expect(validateResearchPipelineResearchResult(result)).toEqual(result);

    const declinedInput = structuredClone(acceptedInput) as Record<string, unknown>;
    declinedInput.acceptance = {
      decision: 'decline', decidedBy: 'user', rationale: 'Do not proceed with this handoff.',
      audit: {
        decisionId: 'decision-graduation-decline', actorId: 'user', recordedAt: '2026-08-10T09:16:00.000Z',
        boundaryDigest: pending.acceptanceBoundaryDigest,
      },
    };
    const declined = buildGraduationResult(declinedInput);
    expect(declined.status).toBe('refused');
    expect(validateResearchPipelineResearchResult(declined)).toEqual(declined);

    const unavailable = structuredClone(input) as Record<string, unknown>;
    const unavailableHandoff = unavailable.handoff as Record<string, unknown>;
    const unavailableDependencies = unavailableHandoff.dependencyStates as Array<Record<string, unknown>>;
    unavailableDependencies[3].state = 'unavailable';
    expect(() => buildGraduationResult(unavailable)).toThrow(/dependency.*unavailable/i);

    const duplicateClaim = structuredClone(input);
    duplicateClaim.handoff.provenanceClaims.push(structuredClone(duplicateClaim.handoff.provenanceClaims[0]));
    expect(() => buildGraduationResult(duplicateClaim)).toThrow(/duplicate provenance/i);

    const inventedClaim = structuredClone(input);
    inventedClaim.handoff.provenanceClaims[0].sourceClaimId = 'invented-claim';
    expect(() => buildGraduationResult(inventedClaim)).toThrow(/exact source claim/i);

    const unverifiedMapping = structuredClone(input) as unknown as Record<string, unknown>;
    const unverifiedClaims = (unverifiedMapping.handoff as Record<string, unknown>)
      .provenanceClaims as Array<Record<string, unknown>>;
    unverifiedClaims[0].existingMainClaimId = '22222222-2222-4222-8222-222222222222';
    expect(() => buildGraduationResult(unverifiedMapping)).toThrow(/verified claim mapping/i);

    const providerReclassification = structuredClone(acceptedInput) as Record<string, unknown>;
    const reclassifiedHandoff = providerReclassification.handoff as Record<string, unknown>;
    (reclassifiedHandoff.thesisCandidate as Record<string, unknown>).underlyingTicker = 'COPPER-PROVIDER';
    expect(() => buildGraduationResult(providerReclassification)).toThrow(/boundaryDigest is stale/i);
  });

  it('composes the complete second tranche as governed zero-write aggregate stages', () => {
    const { intake, formalization, mapping } = acceptedUnknownMapping();
    const preparations = mapping.unknowns.map(({ id }) => preparedResearch('falsification', id));
    preparations.push(preparedResearch('validation', 'unknown-1'));
    const research = mapping.unknowns.map(({ id }) => researchedUnknown(id));
    research.push(researchedUnknown('unknown-1', 'validation'));
    const synthesis = synthesizedEvidence();
    const expression = expressedThesis();
    const gate = acceptedFinalGate('watch');
    const claims = claimsSynthesis();
    const graduationInput = {
      source: source(), previousStage: gate,
      claimsSynthesis: claimsSynthesis(),
      acceptance: {
        decision: null, decidedBy: null,
        rationale: 'The exact graduation handoff awaits user review.', audit: null,
      },
      handoff: {
        disposition: 'prepare_thesis_handoff',
        thesisCandidate: { kind: 'asset', title: 'Copper timing', direction: 'bullish', thesisType: null, underlyingTicker: 'COPPER', initialLifecycle: 'developing' },
        provenanceClaims: [{ sourceInsightId: INSIGHT_ID, sourceClaimId: 'claim-7', existingMainClaimId: '77777777-7777-4777-8777-777777777777' }],
        articulation: { required: true, deriveResolutionFromRebuttals: true },
        dependencyStates: [
          { capabilityId: 'capability:scope:trade-journal/claims-synthesis', state: 'registry_locked' },
          { capabilityId: 'capability:scope:trade-journal/research-publication', state: 'registry_locked' },
          { capabilityId: 'capability:scope:trade-journal/belief-research-relation', state: 'registry_locked' },
          { capabilityId: 'capability:scope:trade-journal/thesis-underwriting', state: 'registry_locked' },
        ],
      },
    };
    const pendingGraduation = buildGraduationResult(graduationInput);
    const graduation = buildGraduationResult({
      ...graduationInput,
      acceptance: {
        decision: 'accept', decidedBy: 'user', rationale: 'Proceed with this exact handoff.',
        audit: {
          decisionId: 'decision-graduation', actorId: 'user', recordedAt: '2026-08-10T09:15:00.000Z',
          boundaryDigest: pendingGraduation.acceptanceBoundaryDigest,
        },
      },
    });
    const result = buildResearchPipelineAggregate({
      insightId: INSIGHT_ID,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake },
        thesisFormalization: { status: 'ready', result: formalization },
        unknownMapping: { status: 'ready', result: mapping },
        researchPreparation: { status: 'ready', results: preparations },
        unknownResearch: { status: 'ready', results: research },
        evidenceSynthesis: { status: 'ready', result: synthesis },
        claimsSynthesis: { status: 'ready', context: claims.context, result: claims.result },
        thesisExpression: { status: 'ready', result: expression },
        gateDecision: { status: 'ready', result: gate },
        graduation: { status: 'ready', result: graduation },
      },
    });

    expect(result.contractVersion).toBe('1.2.0');
    for (const stage of [
      'research_preparation', 'unknown_research', 'evidence_synthesis',
      'thesis_expression', 'gate_decision', 'graduation',
    ]) {
      expect(result.stageOutcomes.find((outcome) => outcome.stage === stage)).toMatchObject({
        status: 'ready', migration: 'governed_stage',
        capabilityId: 'capability:scope:trade-journal/research-pipeline', writes: [], delegatedWrite: null,
      });
    }
    expect(result.execution.writes).toEqual([]);
    expect(validateResearchPipelineAggregateResult(result)).toEqual(result);

    const declinedGraduation = buildGraduationResult({
      ...graduationInput,
      acceptance: {
        decision: 'decline', decidedBy: 'user', rationale: 'Do not proceed with this exact handoff.',
        audit: {
          decisionId: 'decision-graduation-decline', actorId: 'user', recordedAt: '2026-08-10T09:16:00.000Z',
          boundaryDigest: pendingGraduation.acceptanceBoundaryDigest,
        },
      },
    });
    const declinedAggregate = buildResearchPipelineAggregate({
      insightId: INSIGHT_ID,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake },
        thesisFormalization: { status: 'ready', result: formalization },
        unknownMapping: { status: 'ready', result: mapping },
        researchPreparation: { status: 'ready', results: preparations },
        unknownResearch: { status: 'ready', results: research },
        evidenceSynthesis: { status: 'ready', result: synthesis },
        claimsSynthesis: { status: 'ready', context: claims.context, result: claims.result },
        thesisExpression: { status: 'ready', result: expression },
        gateDecision: { status: 'ready', result: gate },
        graduation: { status: 'refused', result: declinedGraduation },
      },
    });
    expect(declinedAggregate.stageOutcomes.find(({ stage }) => stage === 'graduation'))
      .toMatchObject({ status: 'refused', writes: [] });
    expect(validateResearchPipelineAggregateResult(declinedAggregate)).toEqual(declinedAggregate);

    const staleDecline = structuredClone(declinedGraduation) as unknown as Record<string, unknown>;
    staleDecline.previousStageDigest = `sha256:${'b'.repeat(64)}`;
    const staleBoundary = digestResearchPipelineResearchValue({
      source: staleDecline.source,
      previousStageDigest: staleDecline.previousStageDigest,
      claimsSynthesisBinding: staleDecline.claimsSynthesisBinding,
      handoff: staleDecline.handoff,
    });
    staleDecline.acceptanceBoundaryDigest = staleBoundary;
    const staleAcceptance = staleDecline.acceptance as Record<string, unknown>;
    (staleAcceptance.audit as Record<string, unknown>).boundaryDigest = staleBoundary;
    redigestStageResult(staleDecline);
    const staleDeclineAggregate = buildResearchPipelineAggregate({
      insightId: INSIGHT_ID,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake },
        thesisFormalization: { status: 'ready', result: formalization },
        unknownMapping: { status: 'ready', result: mapping },
        researchPreparation: { status: 'ready', results: preparations },
        unknownResearch: { status: 'ready', results: research },
        evidenceSynthesis: { status: 'ready', result: synthesis },
        thesisExpression: { status: 'ready', result: expression },
        gateDecision: { status: 'ready', result: gate },
        claimsSynthesis: { status: 'ready', context: claims.context, result: claims.result },
        graduation: { status: 'refused', result: staleDecline as never },
      },
    });
    expect(staleDeclineAggregate.stageOutcomes.find(({ stage }) => stage === 'graduation'))
      .toMatchObject({ status: 'stale', writes: [] });

    const unavailableClaimsAggregate = buildResearchPipelineAggregate({
      insightId: INSIGHT_ID,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake },
        thesisFormalization: { status: 'ready', result: formalization },
        unknownMapping: { status: 'ready', result: mapping },
        researchPreparation: { status: 'ready', results: preparations },
        unknownResearch: { status: 'ready', results: research },
        evidenceSynthesis: { status: 'ready', result: synthesis },
        thesisExpression: { status: 'ready', result: expression },
        gateDecision: { status: 'ready', result: gate },
        claimsSynthesis: { status: 'unavailable', detail: 'Claims snapshot is unavailable.' },
        graduation: { status: 'ready', result: graduation },
      },
    });
    expect(unavailableClaimsAggregate.stageOutcomes.find(({ stage }) => stage === 'graduation'))
      .toMatchObject({ status: 'unavailable', detail: 'Claims snapshot is unavailable.', writes: [] });

    const unavailableResearch = buildUnknownResearchResult({
      source: source(), previousStage: preparations[2],
      availability: {
        status: 'unavailable', reason: 'The required primary source is unavailable.',
        unavailablePrerequisites: ['primary_source_access'],
      },
    });
    const unavailableAggregate = buildResearchPipelineAggregate({
      insightId: INSIGHT_ID,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake },
        thesisFormalization: { status: 'ready', result: formalization },
        unknownMapping: { status: 'ready', result: mapping },
        researchPreparation: { status: 'ready', results: preparations },
        unknownResearch: {
          status: 'unavailable',
          results: [research[0], research[1], unavailableResearch, research[3]],
        },
      },
    });
    expect(unavailableAggregate.stageOutcomes.find(({ stage }) => stage === 'unknown_research'))
      .toMatchObject({ status: 'unavailable', writes: [] });
    expect(validateResearchPipelineAggregateResult(unavailableAggregate)).toEqual(unavailableAggregate);

    const forgedSynthesis = structuredClone(synthesis) as unknown as Record<string, unknown>;
    forgedSynthesis.decisionCriticalUnknownIds = ['unknown-2'];
    const forgedPayload = forgedSynthesis.synthesis as Record<string, unknown>;
    for (const resolution of forgedPayload.unknownResolutions as Array<Record<string, unknown>>) {
      resolution.resolution = 'resolved';
    }
    redigestStageResult(forgedSynthesis);
    const staleAggregate = buildResearchPipelineAggregate({
      insightId: INSIGHT_ID,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake },
        thesisFormalization: { status: 'ready', result: formalization },
        unknownMapping: { status: 'ready', result: mapping },
        researchPreparation: { status: 'ready', results: preparations },
        unknownResearch: { status: 'ready', results: research },
        evidenceSynthesis: { status: 'ready', result: forgedSynthesis as never },
      },
    });
    expect(staleAggregate.stageOutcomes.find(({ stage }) => stage === 'evidence_synthesis'))
      .toMatchObject({ status: 'stale', writes: [] });
  });
});
