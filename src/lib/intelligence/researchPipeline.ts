import { createHash } from 'node:crypto';
import {
  digestClaimsSynthesisContext,
  validateClaimsSynthesisResult,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisReadyResult,
} from './claimsSynthesis.js';
import {
  buildResearchPublication,
  digestResearchPublication,
} from './researchPublication.js';
import {
  digestBeliefResearchRelationContext,
  digestBeliefResearchRelationRecording,
  digestBeliefResearchRelationResult,
  prepareBeliefResearchRelationRecording,
  validateBeliefResearchRelationContext,
  validateBeliefResearchRelationResult,
  type BeliefResearchRelationContext,
  type BeliefResearchRelationReadyResult,
} from './beliefResearchRelation.js';

export const RESEARCH_PIPELINE_STAGE_ORDER = [
  'pipeline_status',
  'idea_intake',
  'thesis_formalization',
  'unknown_mapping',
  'research_preparation',
  'unknown_research',
  'evidence_synthesis',
  'claims_synthesis',
  'research_publication',
  'belief_research_relation',
  'thesis_expression',
  'gate_decision',
  'graduation',
] as const;

export type ResearchPipelineStage = typeof RESEARCH_PIPELINE_STAGE_ORDER[number];
export type ResearchPipelineOutcomeStatus =
  | 'incomplete'
  | 'unavailable'
  | 'stale'
  | 'refused'
  | 'failed'
  | 'judgment_required'
  | 'ready';

const GOVERNED_DEPENDENCIES = new Map<ResearchPipelineStage, string>([
  ['claims_synthesis', 'capability:scope:trade-journal/claims-synthesis'],
  ['research_publication', 'capability:scope:trade-journal/research-publication'],
  ['belief_research_relation', 'capability:scope:trade-journal/belief-research-relation'],
]);
const MAX_DETAIL_LENGTH = 1000;
const MAX_LIMITATION_LENGTH = 500;
const MAX_LIMITATIONS_TOTAL_LENGTH = 4000;

export interface ResearchPipelineAggregateInput {
  insightId: string;
  dependencies: {
    claimsSynthesis?: ResearchPipelineNonReadyDependency | {
      status: 'ready';
      context: ClaimsSynthesisContext;
      result: ClaimsSynthesisReadyResult;
    };
    researchPublication?: ResearchPipelineNonReadyDependency | {
      status: 'judgment_required';
      context: ClaimsSynthesisContext;
      claimsSynthesisResult: ClaimsSynthesisReadyResult;
    };
    beliefResearchRelation?: ResearchPipelineNonReadyDependency | {
      status: 'ready' | 'judgment_required';
      context: BeliefResearchRelationContext;
      result: BeliefResearchRelationReadyResult;
    };
  };
}

export interface ResearchPipelineNonReadyDependency {
  status: 'unavailable' | 'stale' | 'refused' | 'failed';
  detail: string;
}

export interface ResearchPipelineDelegatedWrite {
  capabilityId: string;
  operation: string;
  requiresExactUserAuthorization: true;
}

export interface ResearchPipelineStageOutcome {
  stage: ResearchPipelineStage;
  status: ResearchPipelineOutcomeStatus;
  migration: 'governed_dependency' | 'legacy_unmigrated';
  capabilityId: string | null;
  detail: string;
  binding?: {
    sourceInsightId: string;
    contextDigest: string;
    resultDigest: string;
  };
  writes: [];
  delegatedWrite: ResearchPipelineDelegatedWrite | null;
}

export interface ResearchPipelineAggregateResult {
  contractVersion: '1.0.0';
  status: ResearchPipelineOutcomeStatus;
  aggregateDigest: string;
  insightId: string;
  stageOutcomes: ResearchPipelineStageOutcome[];
  execution: { mode: 'aggregate_coordination_only'; writes: [] };
  retry: { deterministic: true; key: string };
  limitations: string[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, path: string, allowed: string[]): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw new Error(`${path} contains unsupported fields: ${unsupported.join(', ')}`);
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length) throw new Error(`${path} is missing fields: ${missing.join(', ')}`);
}

function emptyWrites(value: unknown, path: string): asserts value is [] {
  if (!Array.isArray(value) || value.length !== 0) throw new Error(`${path} writes must be empty`);
}

function mapValidationError(error: unknown): Pick<ResearchPipelineStageOutcome, 'status' | 'detail'> {
  const rawDetail = error instanceof Error ? error.message : String(error);
  const suffix = `… [truncated; ${digest(rawDetail)}]`;
  const detail = rawDetail.length <= MAX_DETAIL_LENGTH
    ? rawDetail
    : `${rawDetail.slice(0, MAX_DETAIL_LENGTH - suffix.length)}${suffix}`;
  return {
    status: /digest|stale|expired/i.test(detail) ? 'stale' : 'refused',
    detail,
  };
}

function validateDependencyInput(
  value: unknown,
  path: string,
  readyStatus: 'ready' | 'judgment_required' | 'relation',
): void {
  const dependency = objectAt(value, path);
  const status = dependency.status;
  if (status === 'unavailable' || status === 'stale' || status === 'refused' || status === 'failed') {
    exactKeys(dependency, path, ['status', 'detail']);
    if (typeof dependency.detail !== 'string' || dependency.detail.length === 0
      || dependency.detail.length > MAX_DETAIL_LENGTH) {
      throw new Error(`${path}.detail must be a bounded non-empty string`);
    }
    return;
  }
  if (readyStatus === 'ready' && status === 'ready') {
    exactKeys(dependency, path, ['status', 'context', 'result']);
    return;
  }
  if (readyStatus === 'judgment_required' && status === 'judgment_required') {
    exactKeys(dependency, path, ['status', 'context', 'claimsSynthesisResult']);
    return;
  }
  if (readyStatus === 'relation' && (status === 'ready' || status === 'judgment_required')) {
    exactKeys(dependency, path, ['status', 'context', 'result']);
    return;
  }
  throw new Error(`${path}.status is unsupported`);
}

export function validateResearchPipelineAggregateInput(
  value: unknown,
): ResearchPipelineAggregateInput {
  const input = objectAt(value, 'input');
  exactKeys(input, 'input', ['insightId', 'dependencies']);
  if (typeof input.insightId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.insightId)) {
    throw new Error('input.insightId must be a UUID');
  }
  const dependencies = objectAt(input.dependencies, 'input.dependencies');
  const allowedDependencies = ['claimsSynthesis', 'researchPublication', 'beliefResearchRelation'];
  const unsupported = Object.keys(dependencies).filter((key) => !allowedDependencies.includes(key));
  if (unsupported.length) {
    throw new Error(`input.dependencies contains unsupported fields: ${unsupported.join(', ')}`);
  }
  if (dependencies.claimsSynthesis !== undefined) {
    validateDependencyInput(dependencies.claimsSynthesis, 'input.dependencies.claimsSynthesis', 'ready');
  }
  if (dependencies.researchPublication !== undefined) {
    validateDependencyInput(
      dependencies.researchPublication,
      'input.dependencies.researchPublication',
      'judgment_required',
    );
  }
  if (dependencies.beliefResearchRelation !== undefined) {
    validateDependencyInput(
      dependencies.beliefResearchRelation,
      'input.dependencies.beliefResearchRelation',
      'relation',
    );
  }
  return value as ResearchPipelineAggregateInput;
}

export function validateResearchPipelineAggregateResult(
  value: unknown,
): ResearchPipelineAggregateResult {
  const result = objectAt(value, 'result');
  exactKeys(result, 'result', [
    'contractVersion', 'status', 'aggregateDigest', 'insightId', 'stageOutcomes',
    'execution', 'retry', 'limitations',
  ]);
  if (result.contractVersion !== '1.0.0') throw new Error('result.contractVersion must be 1.0.0');
  if (!RESEARCH_PIPELINE_OUTCOME_STATUSES.has(result.status as ResearchPipelineOutcomeStatus)) {
    throw new Error('result.status is unsupported');
  }
  if (typeof result.insightId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.insightId)) {
    throw new Error('result.insightId must be a UUID');
  }
  if (!Array.isArray(result.stageOutcomes)
    || result.stageOutcomes.length !== RESEARCH_PIPELINE_STAGE_ORDER.length) {
    throw new Error('result.stageOutcomes must contain the complete bounded lifecycle');
  }
  const stageOutcomeValues = result.stageOutcomes as unknown[];
  stageOutcomeValues.forEach((candidate, index) => {
    const stage = objectAt(candidate, `result.stageOutcomes[${index}]`);
    const allowed = [
      'stage', 'status', 'migration', 'capabilityId', 'detail', 'writes', 'delegatedWrite',
      ...(stage.binding === undefined ? [] : ['binding']),
    ];
    exactKeys(stage, `result.stageOutcomes[${index}]`, allowed);
    if (stage.stage !== RESEARCH_PIPELINE_STAGE_ORDER[index]) {
      throw new Error('result.stageOutcomes must use the exact lifecycle order');
    }
    if (!RESEARCH_PIPELINE_OUTCOME_STATUSES.has(stage.status as ResearchPipelineOutcomeStatus)) {
      throw new Error(`result.stageOutcomes[${index}].status is unsupported`);
    }
    if (typeof stage.detail !== 'string' || stage.detail.length === 0
      || stage.detail.length > MAX_DETAIL_LENGTH) {
      throw new Error(`result.stageOutcomes[${index}].detail must be bounded and non-empty`);
    }
    const expectedCapabilityId = GOVERNED_DEPENDENCIES.get(stage.stage as ResearchPipelineStage) ?? null;
    if (stage.capabilityId !== expectedCapabilityId
      || stage.migration !== (expectedCapabilityId ? 'governed_dependency' : 'legacy_unmigrated')) {
      throw new Error(`result.stageOutcomes[${index}] has an invalid capability binding`);
    }
    if (stage.binding !== undefined) {
      const binding = objectAt(stage.binding, `result.stageOutcomes[${index}].binding`);
      exactKeys(binding, `result.stageOutcomes[${index}].binding`, [
        'sourceInsightId', 'contextDigest', 'resultDigest',
      ]);
      if (binding.sourceInsightId !== result.insightId
        || ![binding.contextDigest, binding.resultDigest].every(
          (item) => typeof item === 'string' && /^sha256:[0-9a-f]{64}$/.test(item),
        )) {
        throw new Error(`result.stageOutcomes[${index}].binding is invalid`);
      }
    }
    emptyWrites(stage.writes, `result.stageOutcomes[${index}]`);
    if (stage.delegatedWrite !== null) {
      const delegated = objectAt(stage.delegatedWrite, `result.stageOutcomes[${index}].delegatedWrite`);
      exactKeys(delegated, `result.stageOutcomes[${index}].delegatedWrite`, [
        'capabilityId', 'operation', 'requiresExactUserAuthorization',
      ]);
      const acceptedOperation = stage.stage === 'research_publication'
        ? 'scripts/ops/publish-research.ts --stdin'
        : stage.stage === 'belief_research_relation'
          ? 'scripts/ops/record-belief-research-relation.ts --stdin'
          : null;
      if (!acceptedOperation || delegated.operation !== acceptedOperation
        || delegated.capabilityId !== stage.capabilityId
        || delegated.requiresExactUserAuthorization !== true) {
        throw new Error(`result.stageOutcomes[${index}].delegatedWrite expands aggregate authority`);
      }
      if (stage.status !== 'judgment_required') {
        throw new Error(`result.stageOutcomes[${index}] delegation requires judgment_required`);
      }
    }
    const hasBinding = stage.binding !== undefined;
    const hasDelegation = stage.delegatedWrite !== null;
    if (!expectedCapabilityId) {
      if (stage.status !== 'incomplete' || hasBinding || hasDelegation) {
        throw new Error(`result.stageOutcomes[${index}] must honestly report an unmigrated stage`);
      }
    } else if (stage.stage === 'claims_synthesis') {
      if ((stage.status === 'ready') !== hasBinding || hasDelegation
        || stage.status === 'judgment_required') {
        throw new Error(`result.stageOutcomes[${index}] has an invalid claims-synthesis state`);
      }
    } else if (stage.stage === 'research_publication') {
      if (stage.status === 'ready'
        || (stage.status === 'judgment_required') !== (hasBinding && hasDelegation)
        || (stage.status !== 'judgment_required' && (hasBinding || hasDelegation))) {
        throw new Error(`result.stageOutcomes[${index}] has an invalid research-publication state`);
      }
    } else if (stage.stage === 'belief_research_relation') {
      const resolved = stage.status === 'ready' || stage.status === 'judgment_required';
      if (resolved !== hasBinding
        || (stage.status === 'judgment_required') !== hasDelegation) {
        throw new Error(`result.stageOutcomes[${index}] has an invalid belief-research-relation state`);
      }
    }
  });
  const execution = objectAt(result.execution, 'result.execution');
  exactKeys(execution, 'result.execution', ['mode', 'writes']);
  if (execution.mode !== 'aggregate_coordination_only') {
    throw new Error('result.execution.mode must be aggregate_coordination_only');
  }
  emptyWrites(execution.writes, 'result.execution');
  if (!Array.isArray(result.limitations) || result.limitations.length > 12
    || !result.limitations.every((limitation) => typeof limitation === 'string'
      && limitation.length > 0 && limitation.length <= MAX_LIMITATION_LENGTH)
    || result.limitations.reduce((total, limitation) => total + (limitation as string).length, 0)
      > MAX_LIMITATIONS_TOTAL_LENGTH) {
    throw new Error('result.limitations must be a bounded non-empty string array');
  }
  const derivedStatus = (['failed', 'refused', 'stale', 'unavailable'] as const)
    .find((status) => stageOutcomeValues.some((outcome) => (
      objectAt(outcome, 'result.stageOutcome').status === status
    ))) ?? 'incomplete';
  if (result.status !== derivedStatus) {
    throw new Error('result.status does not match the derived aggregate status');
  }
  const expectedDigest = digest({
    contractVersion: '1.0.0',
    insightId: result.insightId,
    stageOutcomes: result.stageOutcomes,
  });
  if (result.aggregateDigest !== expectedDigest) {
    throw new Error('result.aggregateDigest does not match the canonical aggregate result');
  }
  const retry = objectAt(result.retry, 'result.retry');
  exactKeys(retry, 'result.retry', ['deterministic', 'key']);
  if (retry.deterministic !== true || retry.key !== result.aggregateDigest) {
    throw new Error('result.retry must bind deterministic retry to aggregateDigest');
  }
  return value as ResearchPipelineAggregateResult;
}

const RESEARCH_PIPELINE_OUTCOME_STATUSES = new Set<ResearchPipelineOutcomeStatus>([
  'incomplete', 'unavailable', 'stale', 'refused', 'failed', 'judgment_required', 'ready',
]);

export function buildResearchPipelineAggregate(
  input: ResearchPipelineAggregateInput,
): ResearchPipelineAggregateResult {
  validateResearchPipelineAggregateInput(input);
  const stageOutcomes: ResearchPipelineStageOutcome[] = RESEARCH_PIPELINE_STAGE_ORDER.map((stage) => {
    const capabilityId = GOVERNED_DEPENDENCIES.get(stage) ?? null;
    return {
      stage,
      status: 'incomplete',
      migration: capabilityId ? 'governed_dependency' : 'legacy_unmigrated',
      capabilityId,
      detail: capabilityId
        ? 'No validated Registry-locked stage result was supplied.'
        : 'This legacy stage remains active but is not migrated in the expand release.',
      writes: [],
      delegatedWrite: null,
    };
  });

  const byStage = new Map(stageOutcomes.map((outcome) => [outcome.stage, outcome]));
  const claims = input.dependencies.claimsSynthesis;
  if (claims && claims.status === 'ready') {
    const outcome = byStage.get('claims_synthesis')!;
    try {
      const validated = validateClaimsSynthesisResult(claims.context, claims.result);
      outcome.status = 'ready';
      outcome.detail = 'The exact Registry-locked claims-synthesis result is valid and recommendation-only.';
      outcome.binding = {
        sourceInsightId: claims.context.source.insightId,
        contextDigest: digestClaimsSynthesisContext(claims.context),
        resultDigest: digest(validated),
      };
    } catch (error) {
      Object.assign(outcome, mapValidationError(error));
    }
  } else if (claims) {
    Object.assign(byStage.get('claims_synthesis')!, {
      status: claims.status,
      detail: claims.detail,
    });
  }

  const publication = input.dependencies.researchPublication;
  if (publication && publication.status === 'judgment_required') {
    const outcome = byStage.get('research_publication')!;
    if (byStage.get('claims_synthesis')!.status !== 'ready') {
      outcome.detail = 'Blocked until the exact claims-synthesis dependency is ready.';
    } else {
      try {
        const prepared = buildResearchPublication(
          publication.context,
          publication.claimsSynthesisResult,
        );
        if (digest(publication.claimsSynthesisResult)
          !== byStage.get('claims_synthesis')!.binding?.resultDigest) {
          throw new Error('research publication claims-synthesis result digest is stale');
        }
        outcome.status = 'judgment_required';
        outcome.detail = 'Publication candidates are prepared; only exact user authorization may delegate persistence.';
        outcome.binding = {
          sourceInsightId: publication.context.source.insightId,
          contextDigest: digestClaimsSynthesisContext(publication.context),
          resultDigest: digestResearchPublication(prepared),
        };
        outcome.delegatedWrite = {
          capabilityId: 'capability:scope:trade-journal/research-publication',
          operation: 'scripts/ops/publish-research.ts --stdin',
          requiresExactUserAuthorization: true,
        };
      } catch (error) {
        Object.assign(outcome, mapValidationError(error));
      }
    }
  } else if (publication) {
    Object.assign(byStage.get('research_publication')!, {
      status: publication.status,
      detail: publication.detail,
    });
  }

  const relation = input.dependencies.beliefResearchRelation;
  if (relation && (relation.status === 'ready' || relation.status === 'judgment_required')) {
    const outcome = byStage.get('belief_research_relation')!;
    if (!claims || claims.status !== 'ready' || byStage.get('claims_synthesis')!.status !== 'ready') {
      outcome.detail = 'Blocked until the exact claims-synthesis dependency is ready.';
    } else try {
      const context = validateBeliefResearchRelationContext(relation.context);
      const validated = validateBeliefResearchRelationResult(context, relation.result);
      if (digest({ source: context.source, sourceEvidence: context.sourceEvidence })
        !== digest({ source: claims.context.source, sourceEvidence: claims.context.sourceEvidence })) {
        throw new Error('belief-research-relation provenance and Toulmin source digest is stale');
      }
      outcome.status = relation.status;
      outcome.detail = relation.status === 'ready'
        ? 'The exact Registry-locked belief-research-relation result is valid and recommendation-only.'
        : 'Relation and Decision Item candidates are prepared; only exact user authorization may delegate persistence.';
      outcome.binding = {
        sourceInsightId: context.source.insightId,
        contextDigest: digestBeliefResearchRelationContext(context),
        resultDigest: relation.status === 'ready'
          ? digestBeliefResearchRelationResult(validated)
          : digestBeliefResearchRelationRecording(
            prepareBeliefResearchRelationRecording(context, validated),
          ),
      };
      if (relation.status === 'judgment_required') {
        outcome.delegatedWrite = {
          capabilityId: 'capability:scope:trade-journal/belief-research-relation',
          operation: 'scripts/ops/record-belief-research-relation.ts --stdin',
          requiresExactUserAuthorization: true,
        };
      }
    } catch (error) {
      Object.assign(outcome, mapValidationError(error));
    }
  } else if (relation) {
    Object.assign(byStage.get('belief_research_relation')!, {
      status: relation.status,
      detail: 'detail' in relation ? relation.detail : 'The relation stage did not produce a valid outcome.',
    });
  }

  for (const outcome of stageOutcomes) {
    if (outcome.binding && outcome.binding.sourceInsightId !== input.insightId) {
      throw new Error(`${outcome.stage} source insight does not match the aggregate insightId`);
    }
  }
  const digestInput = {
    contractVersion: '1.0.0',
    insightId: input.insightId,
    stageOutcomes,
  };
  const aggregateDigest = digest(digestInput);
  const terminalStatus = (['failed', 'refused', 'stale', 'unavailable'] as const)
    .find((status) => stageOutcomes.some((outcome) => outcome.status === status));
  return {
    contractVersion: '1.0.0',
    status: terminalStatus ?? 'incomplete',
    aggregateDigest,
    insightId: input.insightId,
    stageOutcomes,
    execution: { mode: 'aggregate_coordination_only', writes: [] },
    retry: { deterministic: true, key: aggregateDigest },
    limitations: [
      'Legacy stage entry points remain active and are explicitly unmigrated in this expand release.',
      'The aggregate has no database, scheduler, credential, provider-discovery, strategy, position, or trade authority.',
    ],
  };
}
