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

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8')) as Record<string, unknown>;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
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
    expect(first.stageOutcomes.filter(({ migration }) => migration === 'legacy_unmigrated'))
      .toHaveLength(RESEARCH_PIPELINE_STAGE_ORDER.length - 3);
    expect(first.stageOutcomes.every(({ writes }) => writes.length === 0)).toBe(true);
    expect(first.limitations).toContain(
      'Legacy stage entry points remain active and are explicitly unmigrated in this expand release.',
    );
  });

  it('composes the exact governed stage validators and delegates judgment-bound writes', () => {
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
      contractVersion: '1.0.0', insightId: forgedDelegation.insightId,
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
      contractVersion: '1.0.0', insightId: unbounded.insightId,
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
});
