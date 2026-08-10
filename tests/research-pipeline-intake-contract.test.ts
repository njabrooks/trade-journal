import { describe, expect, it } from 'vitest';
import {
  buildIdeaIntakeResult,
  buildPipelineStatusResult,
  buildThesisFormalizationResult,
  buildUnknownMappingResult,
  validateResearchPipelineIntakeResult,
} from '../src/lib/intelligence/researchPipelineIntake.js';
import type {
  ThesisFormalizationInput,
  UnknownMappingInput,
} from '../src/lib/intelligence/researchPipelineIntake.js';

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

function intakeInput() {
  return {
    source: source(),
    claim: {
      claim: 'Grid investment will constrain copper supply before new mines reach production.',
      evidence: ['Permitting lead times exceed current visible inventories.'],
      reasoning: 'Demand arrives before the supply response can become operational.',
      backing: 'Large mines require long permitting and construction cycles.',
      qualifier: 'medium' as const,
      rebuttals: [
        'Substitution may reduce copper intensity.',
        'Recycling supply may respond faster than mine supply.',
      ],
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
    idea: {
      ideaId: 'idea-009',
      title: 'Copper grid demand and mine lead times',
      slug: 'copper-grid-demand-mine-lead-times',
      confidence: 0.62,
    },
    thesisClassification: {
      chosenBy: 'user' as const,
      kind: 'asset' as const,
      direction: 'bullish' as const,
      thesisType: null,
      underlyingTicker: 'COPPER',
    },
  };
}

function formalizationInput(intake = buildIdeaIntakeResult(intakeInput())): ThesisFormalizationInput {
  return {
    source: source(),
    previousStage: intake,
    thesis: {
      coreThesis: 'Copper prices will rise before 2029 because grid demand arrives before permitted mine supply.',
      primaryEconomicDriver: 'The gap between grid copper demand and commissioned mine supply.',
      valueChainImpact: 'Miners gain pricing power while copper-intensive manufacturers face higher input costs.',
      beneficiaries: [
        { name: 'Existing copper miners', rationale: 'They can sell current production into a tighter market.' },
        { name: 'Copper recyclers', rationale: 'Higher prices improve scrap collection economics.' },
      ],
      victims: [
        { name: 'Grid equipment manufacturers', rationale: 'Copper input costs rise before substitution scales.' },
      ],
      failureModes: [
        { title: 'Grid build slows', category: 'structural' as const, description: 'Demand does not arrive.', indicators: ['Grid capital expenditure declines for four quarters.'] },
        { title: 'Supply accelerates', category: 'structural' as const, description: 'Mine supply arrives sooner.', indicators: ['Commissioned capacity exceeds the base case.'] },
        { title: 'Miners fail to capture price', category: 'execution' as const, description: 'Cost inflation absorbs price gains.', indicators: ['Producer margins contract while copper rises.'] },
        { title: 'Timing slips', category: 'timing' as const, description: 'The deficit starts after 2029.', indicators: ['Visible inventories remain stable through 2028.'] },
        { title: 'Substitution scales', category: 'external' as const, description: 'Aluminium replaces copper.', indicators: ['Copper intensity falls materially in grid projects.'] },
      ],
      qualifier: 'medium' as const,
      rebuttals: [...intake.claim.rebuttals],
      ambiguities: [...intake.claim.ambiguities, 'Grid spending and substitution can move together.'],
    },
    gate: {
      recommendation: 'advance' as const,
      decision: null,
      decidedBy: null,
      rationale: 'The thesis is falsifiable, but the owner must accept the framing.',
      audit: null,
    },
  };
}

describe('research-pipeline intake and formalization stage contracts', () => {
  it('builds a deterministic zero-write pipeline status for one explicit insight', () => {
    const input = {
      targetInsightId: INSIGHT_ID,
      asOf: '2026-08-10T08:00:00.000Z',
      ideas: [
        { ideaId: 'idea-010', title: 'Later idea', sourceInsightId: null, currentStage: 1, status: 'hold' as const, confidence: 0.4, createdAt: '2026-08-09T08:00:00.000Z' },
        { ideaId: 'idea-009', title: 'Copper idea', sourceInsightId: INSIGHT_ID, currentStage: 3, status: 'active' as const, confidence: 0.62, createdAt: '2026-08-08T08:00:00.000Z' },
      ],
      kills: [
        { ideaId: 'idea-003', title: 'Old idea', stage: 2, category: 'unfalsifiable', killedAt: '2026-08-01T08:00:00.000Z' },
      ],
    };

    const first = buildPipelineStatusResult(input);
    const retry = buildPipelineStatusResult(structuredClone(input));

    expect(first).toEqual(retry);
    expect(first.status).toBe('ready');
    expect(first.snapshot.targetIdea?.ideaId).toBe('idea-009');
    expect(first.snapshot.ideas.map(({ ideaId }) => ideaId)).toEqual(['idea-009', 'idea-010']);
    expect(first.execution).toEqual({ mode: 'stage_result_only', writes: [] });
    expect(validateResearchPipelineIntakeResult(first)).toEqual(first);
  });

  it('preserves exact Toulmin provenance and requires explicit user classification at idea intake', () => {
    const result = buildIdeaIntakeResult(intakeInput());

    expect(result.status).toBe('ready');
    expect(result.source).toEqual(source());
    expect(result.claim.rebuttals).toHaveLength(2);
    expect(result.thesisClassification).toMatchObject({
      chosenBy: 'user', kind: 'asset', direction: 'bullish', underlyingTicker: 'COPPER',
    });
    expect(result.execution.writes).toEqual([]);

    const inferred = intakeInput() as Record<string, unknown>;
    inferred.providerRecommendation = { kind: 'asset', direction: 'bullish' };
    expect(() => buildIdeaIntakeResult(inferred)).toThrow(/unsupported fields/i);

    const missingClassification = intakeInput();
    (missingClassification as { thesisClassification?: unknown }).thesisClassification = undefined;
    expect(() => buildIdeaIntakeResult(missingClassification)).toThrow(/thesisClassification/i);
  });

  it('keeps thesis formalization at judgment_required until the user records the exact gate decision', () => {
    const pending = buildThesisFormalizationResult(formalizationInput());
    expect(pending.status).toBe('judgment_required');
    expect(pending.thesis.failureModes.filter(({ category }) => category === 'structural')).toHaveLength(2);
    expect(pending.thesis.failureModes.filter(({ category }) => category === 'execution')).toHaveLength(1);
    expect(pending.thesis.rebuttals).toHaveLength(2);
    expect(pending.execution.writes).toEqual([]);

    const acceptedInput = formalizationInput();
    acceptedInput.gate.decision = 'advance';
    acceptedInput.gate.decidedBy = 'user';
    acceptedInput.gate.audit = {
      decisionId: 'decision-formalization-7', actorId: 'user', recordedAt: '2026-08-10T08:02:00.000Z',
    };
    const accepted = buildThesisFormalizationResult(acceptedInput);
    expect(accepted.status).toBe('ready');
    expect(accepted.stageDigest).not.toBe(pending.stageDigest);
  });

  it('maps decision-critical unknowns without inferring semantic bearing from tickers or holdings', () => {
    const acceptedFormalizationInput = formalizationInput();
    acceptedFormalizationInput.gate.decision = 'advance';
    acceptedFormalizationInput.gate.decidedBy = 'user';
    acceptedFormalizationInput.gate.audit = {
      decisionId: 'decision-formalization-8', actorId: 'user', recordedAt: '2026-08-10T08:03:00.000Z',
    };
    const formalization = buildThesisFormalizationResult(acceptedFormalizationInput);
    const input: UnknownMappingInput = {
      source: source(),
      previousStage: formalization,
      unknowns: [
        {
          id: 'unknown-1', question: 'Will grid demand arrive before mine supply?', impact: 'high' as const,
          resolutionType: 'empirical' as const, externallyResolvable: 'yes' as const,
          killCondition: 'Commissioned mine supply exceeds grid demand growth through 2028.',
          convictionIncreaseCondition: 'Grid orders accelerate while committed mine supply remains flat.',
          recommendedSources: ['Company filings', 'Grid operator capital plans'], estimatedEffortHours: 6,
          researchQueries: ['Compare committed mine supply with grid project copper demand through 2028.'],
          ambiguities: ['Project announcements may not become completed projects.'],
          pricedIn: 'no' as const,
        },
        {
          id: 'unknown-2', question: 'Can substitution reduce copper intensity?', impact: 'medium' as const,
          resolutionType: 'technological' as const, externallyResolvable: 'partially' as const,
          killCondition: 'Aluminium reaches equivalent performance at materially lower installed cost.',
          convictionIncreaseCondition: 'Copper remains required in the highest-growth grid components.',
          recommendedSources: ['Equipment specifications'], estimatedEffortHours: 3,
          researchQueries: ['Measure copper-to-aluminium substitution in grid equipment.'], ambiguities: [],
          pricedIn: 'partially' as const,
        },
        {
          id: 'unknown-3', question: 'Will producer margins expand?', impact: 'medium' as const,
          resolutionType: 'industry' as const, externallyResolvable: 'yes' as const,
          killCondition: 'Cost inflation fully offsets higher realized copper prices.',
          convictionIncreaseCondition: 'Realized prices rise faster than unit cash costs.',
          recommendedSources: ['Producer results'], estimatedEffortHours: 2,
          researchQueries: ['Compare realized prices and unit cash costs.'], ambiguities: [],
          pricedIn: 'no' as const,
        },
      ],
      researchPlan: {
        priority: ['unknown-1', 'unknown-2', 'unknown-3'], totalEstimatedEffortHours: 11,
        recommendedApproach: 'Test the foundational supply-demand timing mismatch first.',
      },
      assessment: {
        decisiveUnknownsExist: true, allUnknownsPricedIn: false,
        thesisExternallyResearchable: true, researchPayoff: 'asymmetric' as const,
      },
      gate: {
        recommendation: 'advance' as const, decision: null, decidedBy: null,
        rationale: 'At least one high-impact unknown is externally resolvable.',
        audit: null,
      },
    };

    const pending = buildUnknownMappingResult(input);
    expect(pending.status).toBe('judgment_required');
    expect(pending.execution.writes).toEqual([]);
    expect(JSON.stringify(pending)).not.toMatch(/holding|providerRecommendation|tickerMatch|keywordMatch/);

    input.gate.decision = 'advance';
    input.gate.decidedBy = 'user';
    input.gate.audit = {
      decisionId: 'decision-unknowns-7', actorId: 'user', recordedAt: '2026-08-10T08:04:00.000Z',
    };
    const accepted = buildUnknownMappingResult(input);
    expect(accepted.status).toBe('ready');
    expect(validateResearchPipelineIntakeResult(accepted)).toEqual(accepted);

    const forcedAdvance = structuredClone(input);
    forcedAdvance.unknowns.forEach((unknown) => { unknown.pricedIn = 'yes'; });
    forcedAdvance.assessment.allUnknownsPricedIn = true;
    forcedAdvance.assessment.researchPayoff = 'negative';
    forcedAdvance.gate.recommendation = 'kill';
    forcedAdvance.gate.decision = 'advance';
    expect(() => buildUnknownMappingResult(forcedAdvance)).toThrow(/decision must be kill/i);

    const archive = structuredClone(input);
    archive.assessment.researchPayoff = 'symmetric';
    archive.gate.recommendation = 'archive';
    archive.gate.decision = 'archive';
    expect(buildUnknownMappingResult(archive).status).toBe('ready');

    const contradictory = structuredClone(input);
    contradictory.assessment.decisiveUnknownsExist = false;
    contradictory.gate.recommendation = 'kill';
    contradictory.gate.decision = 'kill';
    expect(() => buildUnknownMappingResult(contradictory)).toThrow(/decisiveUnknownsExist/i);

    const unranked = structuredClone(input);
    [unranked.unknowns[0], unranked.unknowns[1]] = [unranked.unknowns[1], unranked.unknowns[0]];
    unranked.researchPlan.priority = unranked.unknowns.map(({ id }) => id);
    expect(() => buildUnknownMappingResult(unranked)).toThrow(/ranked high to low/i);
  });

  it('refuses stale stage chaining and every attempted write surface', () => {
    const stale = formalizationInput();
    stale.previousStage.stageDigest = `sha256:${'f'.repeat(64)}`;
    expect(() => buildThesisFormalizationResult(stale)).toThrow(/previousStageDigest/i);

    const result = buildIdeaIntakeResult(intakeInput());
    expect(() => validateResearchPipelineIntakeResult({
      ...result,
      execution: { mode: 'stage_result_only', writes: ['research-workspace'] },
    })).toThrow(/writes must be empty/i);
    expect(() => validateResearchPipelineIntakeResult({
      ...result,
      stageDigest: `sha256:${'f'.repeat(64)}`,
    })).toThrow(/stageDigest/i);

    const lostQualifier = formalizationInput();
    lostQualifier.thesis.qualifier = 'low';
    expect(() => buildThesisFormalizationResult(lostQualifier)).toThrow(/source qualifier/i);

    const heldInput = formalizationInput();
    heldInput.gate.decision = 'hold';
    heldInput.gate.decidedBy = 'user';
    heldInput.gate.audit = {
      decisionId: 'decision-hold-7', actorId: 'user', recordedAt: '2026-08-10T08:05:00.000Z',
    };
    const held = buildThesisFormalizationResult(heldInput);
    expect(() => buildUnknownMappingResult({
      source: source(), previousStage: held, unknowns: [], researchPlan: {},
      assessment: {
        decisiveUnknownsExist: false, allUnknownsPricedIn: false,
        thesisExternallyResearchable: false, researchPayoff: 'negative',
      },
      gate: {
        recommendation: 'kill', decision: null, decidedBy: null, rationale: 'Held upstream.', audit: null,
      },
    })).toThrow(/advance decision/i);
  });
});
