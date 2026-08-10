import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESEARCH_PIPELINE_STAGE_ORDER,
  buildResearchPipelineAggregate,
  validateResearchPipelineAggregateInput,
  validateResearchPipelineAggregateResult,
} from '../src/lib/intelligence/researchPipeline.js';
import {
  digestClaimsSynthesisContext,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisReadyResult,
} from '../src/lib/intelligence/claimsSynthesis.js';
import {
  digestBeliefResearchRelationContext,
  validateBeliefResearchRelationContext,
  type BeliefResearchRelationContext,
  type BeliefResearchRelationReadyResult,
} from '../src/lib/intelligence/beliefResearchRelation.js';
import {
  buildIdeaIntakeResult,
  buildPipelineStatusResult,
  buildThesisFormalizationResult,
  buildUnknownMappingResult,
  digestResearchPipelineIntakeValue,
} from '../src/lib/intelligence/researchPipelineIntake.js';

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8')) as Record<string, unknown>;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function intakeStageChain() {
  const insightId = '22222222-2222-4222-8222-222222222222';
  const source = {
    authority: 'scope:notes' as const,
    insightId,
    claimId: 'claim-67',
    contentSha256: `sha256:${'7'.repeat(64)}`,
  };
  const pipelineStatus = buildPipelineStatusResult({
    targetInsightId: insightId,
    asOf: '2026-08-10T08:00:00.000Z',
    ideas: [],
    kills: [],
  });
  const ideaIntake = buildIdeaIntakeResult({
    source,
    claim: {
      claim: 'Grid demand can arrive before new copper mine supply.',
      evidence: ['Mine development lead times remain long.'],
      reasoning: 'Demand and supply have different delivery timelines.',
      backing: 'Permitting and construction constrain mine commissioning.',
      qualifier: 'medium',
      rebuttals: ['Substitution can reduce copper intensity.'],
      timeHorizon: 'medium_term',
      ambiguities: ['Grid capital plans may slip.'],
    },
    selection: {
      selectedBy: 'user', noveltyScore: 0.8, noveltyOverrideRationale: null,
      rationale: 'The timing mismatch is decision-critical.',
      audit: { decisionId: 'decision-intake-67', actorId: 'user', recordedAt: '2026-08-10T08:01:00.000Z' },
    },
    idea: { ideaId: 'idea-067', title: 'Copper timing gap', slug: 'copper-timing-gap', confidence: 0.6 },
    thesisClassification: {
      chosenBy: 'user', kind: 'asset', direction: 'bullish', thesisType: null, underlyingTicker: 'COPPER',
    },
  });
  const thesisFormalization = buildThesisFormalizationResult({
    source,
    previousStage: ideaIntake,
    thesis: {
      coreThesis: 'Copper prices rise before 2029 as grid demand outpaces commissioned mine supply.',
      primaryEconomicDriver: 'The timing gap between grid orders and commissioned mine supply.',
      valueChainImpact: 'Existing miners gain pricing power while equipment manufacturers face input inflation.',
      beneficiaries: [{ name: 'Existing miners', rationale: 'They own commissioned supply.' }],
      victims: [{ name: 'Equipment makers', rationale: 'Their copper input costs rise.' }],
      failureModes: [
        { title: 'Demand slows', category: 'structural', description: 'Grid orders fall.', indicators: ['Orders decline.'] },
        { title: 'Supply accelerates', category: 'structural', description: 'Mines arrive early.', indicators: ['Commissioning rises.'] },
        { title: 'Margins fail', category: 'execution', description: 'Costs absorb prices.', indicators: ['Margins contract.'] },
        { title: 'Deficit is late', category: 'timing', description: 'Deficit follows 2029.', indicators: ['Inventories remain high.'] },
        { title: 'Substitution scales', category: 'external', description: 'Aluminium replaces copper.', indicators: ['Copper intensity falls.'] },
      ],
      qualifier: 'medium',
      rebuttals: ['Substitution can reduce copper intensity.'],
      ambiguities: ['Grid capital plans may slip.', 'Order announcements may not become builds.'],
    },
    gate: {
      recommendation: 'advance', decision: 'advance', decidedBy: 'user', rationale: 'Accepted by the owner.',
      audit: { decisionId: 'decision-formalize-67', actorId: 'user', recordedAt: '2026-08-10T08:02:00.000Z' },
    },
  });
  const unknownMapping = buildUnknownMappingResult({
    source,
    previousStage: thesisFormalization,
    unknowns: [1, 2, 3].map((number) => ({
      id: `unknown-${number}`,
      question: `Decision-critical question ${number}?`,
      impact: number === 1 ? 'high' as const : 'medium' as const,
      resolutionType: 'empirical' as const,
      externallyResolvable: 'yes' as const,
      killCondition: `Kill condition ${number}.`,
      convictionIncreaseCondition: `Conviction condition ${number}.`,
      recommendedSources: [`Primary source ${number}`],
      estimatedEffortHours: number,
      researchQueries: [`Research query ${number}.`],
      ambiguities: [],
      pricedIn: number === 2 ? 'partially' as const : 'no' as const,
    })),
    researchPlan: {
      priority: ['unknown-1', 'unknown-2', 'unknown-3'], totalEstimatedEffortHours: 6,
      recommendedApproach: 'Research the foundational unknown first.',
    },
    assessment: {
      decisiveUnknownsExist: true, allUnknownsPricedIn: false,
      thesisExternallyResearchable: true, researchPayoff: 'asymmetric',
    },
    gate: {
      recommendation: 'advance', decision: null, decidedBy: null,
      rationale: 'The owner must accept the plan.', audit: null,
    },
  });
  return { insightId, pipelineStatus, ideaIntake, thesisFormalization, unknownMapping };
}

describe('research-pipeline aggregate contract', () => {
  it('reports the complete expand-phase lifecycle as deterministic, incomplete, and zero-write', () => {
    const first = buildResearchPipelineAggregate({
      insightId: '11111111-1111-4111-8111-111111111111',
      dependencies: {},
    });
    const retry = buildResearchPipelineAggregate({
      insightId: '11111111-1111-4111-8111-111111111111',
      dependencies: {},
    });

    expect(first).toEqual(retry);
    expect(first.status).toBe('incomplete');
    expect(first.execution).toEqual({ mode: 'aggregate_coordination_only', writes: [] });
    expect(first.stageOutcomes.map(({ stage }) => stage)).toEqual(RESEARCH_PIPELINE_STAGE_ORDER);
    expect(first.stageOutcomes.filter(({ migration }) => migration === 'governed_dependency'))
      .toHaveLength(3);
    expect(first.stageOutcomes.filter(({ migration }) => migration === 'governed_stage'))
      .toHaveLength(10);
    expect(first.stageOutcomes.filter(({ migration }) => migration === 'legacy_unmigrated'))
      .toHaveLength(0);
    expect(first.stageOutcomes.every(({ writes }) => writes.length === 0)).toBe(true);
    expect(first.limitations).toContain(
      'All ten legacy persistence entry points are non-executable protective tombstones mapped to these governed stage results.',
    );
    expect(first.limitations.join(' ')).not.toMatch(/legacy .*remain(?:s)? active|legacy persistence remains|coexist with unchanged/i);
  });

  it('composes the exact governed stage validators and delegates judgment-bound writes', () => {
    const intake = intakeStageChain();
    const publication = fixture('research-publication-adapter-equivalence.json') as {
      context: ClaimsSynthesisContext;
      claimsSynthesisResult: ClaimsSynthesisReadyResult;
    };
    const relation = fixture('belief-research-relation-adapter-equivalence.json') as {
      context: BeliefResearchRelationContext & {
        thesisTargets: Array<{ argument: Record<string, unknown> }>;
      };
      result: BeliefResearchRelationReadyResult;
    };
    publication.context.source = structuredClone(relation.context.source);
    publication.context.sourceEvidence = structuredClone(relation.context.sourceEvidence);
    publication.claimsSynthesisResult.contextDigest = digestClaimsSynthesisContext(publication.context);
    const argument = relation.context.thesisTargets[0].argument;
    argument.digest = digest({
      coreArgument: argument.coreArgument,
      keyAssumptions: argument.keyAssumptions,
      keyDrivers: argument.keyDrivers,
      source: argument.source,
    });
    relation.result.contextDigest = digestBeliefResearchRelationContext(
      validateBeliefResearchRelationContext(relation.context),
    );

    const result = buildResearchPipelineAggregate({
      insightId: '22222222-2222-4222-8222-222222222222',
      dependencies: {
        pipelineStatus: { status: 'ready', result: intake.pipelineStatus },
        ideaIntake: { status: 'ready', result: intake.ideaIntake },
        thesisFormalization: { status: 'ready', result: intake.thesisFormalization },
        unknownMapping: { status: 'judgment_required', result: intake.unknownMapping },
        claimsSynthesis: {
          status: 'ready',
          context: publication.context,
          result: publication.claimsSynthesisResult,
        },
        researchPublication: {
          status: 'judgment_required',
          context: publication.context,
          claimsSynthesisResult: publication.claimsSynthesisResult,
        },
        beliefResearchRelation: {
          status: 'ready',
          context: relation.context,
          result: relation.result,
        },
      },
    });

    const outcomes = Object.fromEntries(result.stageOutcomes.map((outcome) => [outcome.stage, outcome]));
    expect(outcomes.pipeline_status).toMatchObject({ status: 'ready', migration: 'governed_stage' });
    expect(outcomes.idea_intake).toMatchObject({ status: 'ready', migration: 'governed_stage' });
    expect(outcomes.thesis_formalization).toMatchObject({ status: 'ready', migration: 'governed_stage' });
    expect(outcomes.unknown_mapping).toMatchObject({
      status: 'judgment_required', migration: 'governed_stage', delegatedWrite: null,
    });
    expect(outcomes.claims_synthesis).toMatchObject({ status: 'ready', delegatedWrite: null });
    expect(outcomes.research_publication).toMatchObject({
      status: 'judgment_required',
      delegatedWrite: {
        operation: 'scripts/ops/publish-research.ts --stdin',
        capabilityId: 'capability:scope:trade-journal/research-publication',
        requiresExactUserAuthorization: true,
      },
    });
    expect(outcomes.belief_research_relation).toMatchObject({ status: 'ready', delegatedWrite: null });
    expect(result.status).toBe('incomplete');
    expect(result.execution.writes).toEqual([]);

    const relationJudgment = buildResearchPipelineAggregate({
      insightId: '22222222-2222-4222-8222-222222222222',
      dependencies: {
        claimsSynthesis: {
          status: 'ready', context: publication.context, result: publication.claimsSynthesisResult,
        },
        researchPublication: {
          status: 'judgment_required', context: publication.context,
          claimsSynthesisResult: publication.claimsSynthesisResult,
        },
        beliefResearchRelation: {
          status: 'judgment_required', context: relation.context, result: relation.result,
        },
      },
    });
    expect(relationJudgment.stageOutcomes.find(({ stage }) => stage === 'belief_research_relation'))
      .toMatchObject({
        status: 'judgment_required',
        delegatedWrite: {
          operation: 'scripts/ops/record-belief-research-relation.ts --stdin',
          capabilityId: 'capability:scope:trade-journal/belief-research-relation',
          requiresExactUserAuthorization: true,
        },
      });
  });

  it.each(['unavailable', 'stale', 'refused', 'failed'] as const)(
    'preserves an explicit %s dependency outcome without retrying or writing',
    (status) => {
      const result = buildResearchPipelineAggregate({
        insightId: '11111111-1111-4111-8111-111111111111',
        dependencies: {
          claimsSynthesis: { status, detail: `${status} by the governed stage` },
        },
      });
      const stage = result.stageOutcomes.find((outcome) => outcome.stage === 'claims_synthesis');
      expect(stage).toMatchObject({ status, detail: `${status} by the governed stage`, writes: [] });
      expect(stage?.delegatedWrite).toBeNull();
      expect(result.status).toBe(status);
      expect(result.execution.writes).toEqual([]);
    },
  );

  it('refuses authority expansion and stale aggregate bytes', () => {
    const result = buildResearchPipelineAggregate({
      insightId: '11111111-1111-4111-8111-111111111111',
      dependencies: {},
    });
    expect(validateResearchPipelineAggregateResult(result)).toEqual(result);

    expect(() => validateResearchPipelineAggregateResult({
      ...result,
      directApiMutation: { requested: true },
    })).toThrow(/unsupported fields/i);
    expect(() => validateResearchPipelineAggregateResult({
      ...result,
      aggregateDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })).toThrow(/aggregateDigest does not match/i);
    expect(() => validateResearchPipelineAggregateResult({
      ...result,
      execution: { mode: 'aggregate_coordination_only', writes: ['main_claims'] },
    })).toThrow(/writes must be empty/i);

    expect(() => validateResearchPipelineAggregateResult({
      ...result,
      status: 'ready',
    })).toThrow(/derived aggregate status/i);

    const forgedDelegation = structuredClone(result);
    const publication = forgedDelegation.stageOutcomes.find(({ stage }) => stage === 'research_publication')!;
    publication.status = 'ready';
    publication.delegatedWrite = {
      capabilityId: 'capability:scope:trade-journal/research-publication',
      operation: 'scripts/ops/publish-research.ts --stdin',
      requiresExactUserAuthorization: true,
    };
    forgedDelegation.aggregateDigest = digest({
      contractVersion: '1.2.0', insightId: forgedDelegation.insightId,
      stageOutcomes: forgedDelegation.stageOutcomes,
    });
    forgedDelegation.retry.key = forgedDelegation.aggregateDigest;
    expect(() => validateResearchPipelineAggregateResult(forgedDelegation))
      .toThrow(/delegation requires judgment_required/i);

    expect(() => validateResearchPipelineAggregateInput({
      insightId: result.insightId,
      dependencies: {},
      genericWrites: [{ table: 'main_claims' }],
    })).toThrow(/unsupported fields/i);
    expect(() => validateResearchPipelineAggregateInput({
      insightId: result.insightId,
      dependencies: {
        claimsSynthesis: { status: 'ready', context: {}, result: {}, publish: true },
      },
    })).toThrow(/unsupported fields/i);
    expect(() => validateResearchPipelineAggregateInput({
      insightId: result.insightId,
      dependencies: {
        claimsSynthesis: { status: 'failed', detail: 'x'.repeat(1001) },
      },
    })).toThrow(/bounded non-empty string/i);

    const unbounded = structuredClone(result);
    unbounded.stageOutcomes[0].detail = 'x'.repeat(1001);
    unbounded.aggregateDigest = digest({
      contractVersion: '1.2.0', insightId: unbounded.insightId,
      stageOutcomes: unbounded.stageOutcomes,
    });
    unbounded.retry.key = unbounded.aggregateDigest;
    expect(() => validateResearchPipelineAggregateResult(unbounded)).toThrow(/detail must be bounded/i);
  });

  it('refuses provenance or Toulmin drift between composed governed stages', () => {
    const publication = fixture('research-publication-adapter-equivalence.json') as {
      context: ClaimsSynthesisContext;
      claimsSynthesisResult: ClaimsSynthesisReadyResult;
    };
    publication.claimsSynthesisResult.contextDigest = digestClaimsSynthesisContext(publication.context);
    const relation = fixture('belief-research-relation-adapter-equivalence.json') as {
      context: BeliefResearchRelationContext & { thesisTargets: Array<{ argument: Record<string, unknown> }> };
      result: BeliefResearchRelationReadyResult;
    };
    const argument = relation.context.thesisTargets[0].argument;
    argument.digest = digest({
      coreArgument: argument.coreArgument, keyAssumptions: argument.keyAssumptions,
      keyDrivers: argument.keyDrivers, source: argument.source,
    });
    relation.result.contextDigest = digestBeliefResearchRelationContext(
      validateBeliefResearchRelationContext(relation.context),
    );

    const result = buildResearchPipelineAggregate({
      insightId: publication.context.source.insightId,
      dependencies: {
        claimsSynthesis: { status: 'ready', context: publication.context, result: publication.claimsSynthesisResult },
        researchPublication: {
          status: 'judgment_required', context: publication.context,
          claimsSynthesisResult: publication.claimsSynthesisResult,
        },
        beliefResearchRelation: { status: 'ready', context: relation.context, result: relation.result },
      },
    });

    expect(result.stageOutcomes.find(({ stage }) => stage === 'belief_research_relation')).toMatchObject({
      status: 'stale', delegatedWrite: null,
    });
  });

  it('refuses provenance or rebuttal drift across the new intake and formalization chain', () => {
    const intake = intakeStageChain();
    const forged = structuredClone(intake.thesisFormalization);
    forged.thesis.rebuttals = ['A replacement rebuttal.'];
    const { stageDigest: _ignored, ...digestInput } = forged;
    void _ignored;
    forged.stageDigest = digestResearchPipelineIntakeValue(digestInput);

    const result = buildResearchPipelineAggregate({
      insightId: intake.insightId,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake.ideaIntake },
        thesisFormalization: { status: 'ready', result: forged },
      },
    });

    expect(result.stageOutcomes.find(({ stage }) => stage === 'idea_intake')?.status).toBe('ready');
    expect(result.stageOutcomes.find(({ stage }) => stage === 'thesis_formalization')).toMatchObject({
      status: 'stale', binding: undefined, delegatedWrite: null,
    });
  });

  it('keeps malformed governed stage material bounded as refused', () => {
    const intake = intakeStageChain();
    const malformed = { ...intake.thesisFormalization, thesis: null };
    const result = buildResearchPipelineAggregate({
      insightId: intake.insightId,
      dependencies: {
        ideaIntake: { status: 'ready', result: intake.ideaIntake },
        thesisFormalization: { status: 'ready', result: malformed as never },
      },
    });
    expect(result.stageOutcomes.find(({ stage }) => stage === 'thesis_formalization')).toMatchObject({
      status: 'refused', delegatedWrite: null, writes: [],
    });
    expect(validateResearchPipelineAggregateResult(result)).toEqual(result);
  });

  it('refuses publication material that is not the exact validated claims-synthesis output', () => {
    const first = fixture('research-publication-adapter-equivalence.json') as {
      context: ClaimsSynthesisContext;
      claimsSynthesisResult: ClaimsSynthesisReadyResult;
    };
    first.claimsSynthesisResult.contextDigest = digestClaimsSynthesisContext(first.context);
    const altered = structuredClone(first.claimsSynthesisResult);
    altered.recommendations[0].rationale = `${altered.recommendations[0].rationale} altered`;

    const result = buildResearchPipelineAggregate({
      insightId: first.context.source.insightId,
      dependencies: {
        claimsSynthesis: { status: 'ready', context: first.context, result: first.claimsSynthesisResult },
        researchPublication: {
          status: 'judgment_required',
          context: first.context,
          claimsSynthesisResult: altered,
        },
      },
    });

    expect(result.stageOutcomes.find(({ stage }) => stage === 'claims_synthesis')?.status).toBe('ready');
    expect(result.stageOutcomes.find(({ stage }) => stage === 'research_publication')).toMatchObject({
      status: 'stale',
      delegatedWrite: null,
    });
  });

  it.each([
    ['stale', (result: ClaimsSynthesisReadyResult) => {
      result.contextDigest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    }],
    ['refused', (result: ClaimsSynthesisReadyResult) => {
      (result.recommendations[0] as unknown as Record<string, unknown>).genericWrite = true;
    }],
  ] as const)('maps governed validator refusal to the explicit %s outcome', (status, mutate) => {
    const publication = fixture('research-publication-adapter-equivalence.json') as {
      context: ClaimsSynthesisContext;
      claimsSynthesisResult: ClaimsSynthesisReadyResult;
    };
    publication.claimsSynthesisResult.contextDigest = digestClaimsSynthesisContext(publication.context);
    mutate(publication.claimsSynthesisResult);
    const result = buildResearchPipelineAggregate({
      insightId: publication.context.source.insightId,
      dependencies: {
        claimsSynthesis: {
          status: 'ready',
          context: publication.context,
          result: publication.claimsSynthesisResult,
        },
        researchPublication: {
          status: 'judgment_required',
          context: publication.context,
          claimsSynthesisResult: publication.claimsSynthesisResult,
        },
      },
    });
    expect(result.stageOutcomes.find(({ stage }) => stage === 'claims_synthesis')?.status).toBe(status);
    expect(result.stageOutcomes.find(({ stage }) => stage === 'research_publication')?.status).toBe('incomplete');
    expect(result.status).toBe(status);
    expect(result.execution.writes).toEqual([]);
  });

  it('classifies malformed digest authority as refused rather than stale', () => {
    const intake = intakeStageChain();
    const malformed = structuredClone(intake.ideaIntake) as unknown as Record<string, unknown>;
    (malformed.source as Record<string, unknown>).contentSha256 = 'bad';
    const result = buildResearchPipelineAggregate({
      insightId: intake.insightId,
      dependencies: { ideaIntake: { status: 'ready', result: malformed as never } },
    });
    expect(result.stageOutcomes.find(({ stage }) => stage === 'idea_intake')?.status).toBe('refused');
    expect(validateResearchPipelineAggregateResult(result)).toEqual(result);
  });

  it('bounds mapped stage-validator diagnostics and emits a self-validating result', () => {
    const publication = fixture('research-publication-adapter-equivalence.json') as {
      context: ClaimsSynthesisContext;
      claimsSynthesisResult: ClaimsSynthesisReadyResult;
    };
    publication.claimsSynthesisResult.contextDigest = digestClaimsSynthesisContext(publication.context);
    const expanded = publication.claimsSynthesisResult as unknown as Record<string, unknown>;
    for (let index = 0; index < 300; index += 1) {
      expanded[`genericWriteAuthority${String(index).padStart(3, '0')}`] = true;
    }

    const result = buildResearchPipelineAggregate({
      insightId: publication.context.source.insightId,
      dependencies: {
        claimsSynthesis: {
          status: 'ready', context: publication.context, result: publication.claimsSynthesisResult,
        },
      },
    });
    const stage = result.stageOutcomes.find(({ stage: name }) => name === 'claims_synthesis')!;
    expect(stage.status).toBe('refused');
    expect(stage.detail.length).toBeLessThanOrEqual(1000);
    expect(stage.detail).toContain('truncated; sha256:');
    expect(validateResearchPipelineAggregateResult(result)).toEqual(result);
  });
});
