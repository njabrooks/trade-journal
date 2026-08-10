import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDEA_ID_PATTERN = /^idea-[0-9]{3,}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TEXT = 2_000;
const MAX_COLLECTION = 50;

export type ResearchPipelineIntakeStage =
  | 'pipeline_status'
  | 'idea_intake'
  | 'thesis_formalization'
  | 'unknown_mapping';

export type ResearchPipelineIntakeStatus = 'ready' | 'judgment_required';

export interface ResearchPipelineSource {
  authority: 'scope:notes';
  insightId: string;
  claimId: string;
  contentSha256: string;
}

interface StageExecution {
  mode: 'stage_result_only';
  writes: [];
}

interface StageBase {
  contractVersion: '1.0.0';
  stage: ResearchPipelineIntakeStage;
  status: ResearchPipelineIntakeStatus;
  stageDigest: string;
  execution: StageExecution;
  limitations: string[];
}

export interface PipelineIdeaStatus {
  ideaId: string;
  title: string;
  sourceInsightId: string | null;
  currentStage: number;
  status: 'active' | 'hold' | 'killed' | 'archived' | 'expressed';
  confidence: number;
  createdAt: string;
}

export interface PipelineKillStatus {
  ideaId: string;
  title: string;
  stage: number;
  category: string;
  killedAt: string;
}

export interface PipelineStatusInput {
  targetInsightId: string;
  asOf: string;
  ideas: PipelineIdeaStatus[];
  kills: PipelineKillStatus[];
}

export interface PipelineStatusResult extends StageBase {
  stage: 'pipeline_status';
  status: 'ready';
  targetInsightId: string;
  snapshot: {
    asOf: string;
    targetIdea: PipelineIdeaStatus | null;
    ideas: PipelineIdeaStatus[];
    kills: PipelineKillStatus[];
    counts: {
      active: number;
      hold: number;
      killed: number;
      archived: number;
      expressed: number;
    };
  };
}

export interface ToulminClaim {
  claim: string;
  evidence: string[];
  reasoning: string;
  backing: string;
  qualifier: 'high' | 'medium' | 'low' | 'exploratory';
  rebuttals: string[];
  timeHorizon: 'long_term' | 'medium_term' | 'short_term';
  ambiguities: string[];
}

export interface IdeaIntakeInput {
  source: ResearchPipelineSource;
  claim: ToulminClaim;
  selection: {
    selectedBy: 'user';
    noveltyScore: number;
    noveltyOverrideRationale: string | null;
    rationale: string;
    audit: UserJudgmentAudit;
  };
  idea: {
    ideaId: string;
    title: string;
    slug: string;
    confidence: number;
  };
  thesisClassification: {
    chosenBy: 'user';
    kind: 'macro' | 'asset';
    direction: 'bullish' | 'bearish' | 'neutral';
    thesisType: 'secular' | 'cyclical' | 'structural' | null;
    underlyingTicker: string | null;
  };
}

export interface IdeaIntakeResult extends StageBase, IdeaIntakeInput {
  stage: 'idea_intake';
  status: 'ready';
}

export type FailureModeCategory = 'structural' | 'execution' | 'timing' | 'external';

export interface UserJudgmentAudit {
  decisionId: string;
  actorId: string;
  recordedAt: string;
}

export interface ThesisFormalizationInput {
  source: ResearchPipelineSource;
  previousStage: IdeaIntakeResult;
  thesis: {
    coreThesis: string;
    primaryEconomicDriver: string;
    valueChainImpact: string;
    beneficiaries: Array<{ name: string; rationale: string }>;
    victims: Array<{ name: string; rationale: string }>;
    failureModes: Array<{
      title: string;
      category: FailureModeCategory;
      description: string;
      indicators: string[];
    }>;
    qualifier: 'high' | 'medium' | 'low' | 'exploratory';
    rebuttals: string[];
    ambiguities: string[];
  };
  gate: {
    recommendation: 'advance' | 'hold' | 'kill';
    decision: 'advance' | 'hold' | 'kill' | null;
    decidedBy: 'user' | null;
    rationale: string;
    audit: UserJudgmentAudit | null;
  };
}

export interface ThesisFormalizationResult extends StageBase {
  stage: 'thesis_formalization';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  thesis: ThesisFormalizationInput['thesis'];
  gate: ThesisFormalizationInput['gate'];
}

export interface UnknownMappingInput {
  source: ResearchPipelineSource;
  previousStage: ThesisFormalizationResult;
  unknowns: Array<{
    id: string;
    question: string;
    impact: 'high' | 'medium' | 'low';
    resolutionType: 'empirical' | 'industry' | 'regulatory' | 'technological';
    externallyResolvable: 'yes' | 'no' | 'partially';
    killCondition: string;
    convictionIncreaseCondition: string;
    recommendedSources: string[];
    estimatedEffortHours: number;
    researchQueries: string[];
    ambiguities: string[];
    pricedIn: 'yes' | 'no' | 'partially';
  }>;
  researchPlan: {
    priority: string[];
    totalEstimatedEffortHours: number;
    recommendedApproach: string;
  };
  assessment: {
    decisiveUnknownsExist: boolean;
    allUnknownsPricedIn: boolean;
    thesisExternallyResearchable: boolean;
    researchPayoff: 'asymmetric' | 'symmetric' | 'negative';
  };
  gate: {
    recommendation: 'advance' | 'kill' | 'archive';
    decision: 'advance' | 'kill' | 'archive' | null;
    decidedBy: 'user' | null;
    rationale: string;
    audit: UserJudgmentAudit | null;
  };
}

export interface UnknownMappingResult extends StageBase {
  stage: 'unknown_mapping';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  unknowns: UnknownMappingInput['unknowns'];
  researchPlan: UnknownMappingInput['researchPlan'];
  assessment: UnknownMappingInput['assessment'];
  gate: UnknownMappingInput['gate'];
}

export type ResearchPipelineIntakeResult =
  | PipelineStatusResult
  | IdeaIntakeResult
  | ThesisFormalizationResult
  | UnknownMappingResult;

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

export function digestResearchPipelineIntakeValue(value: unknown): string {
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

function text(value: unknown, path: string, max = MAX_TEXT): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new Error(`${path} must be a bounded non-empty string`);
  }
}

function nullableText(value: unknown, path: string): void {
  if (value !== null) text(value, path);
}

function stringArray(value: unknown, path: string, allowEmpty = false): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path} must be a bounded string array`);
  }
  value.forEach((item, index) => text(item, `${path}[${index}]`));
}

function isoTimestamp(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${path} must be an ISO timestamp`);
  }
}

function validateUserJudgmentAudit(value: unknown, path: string): void {
  const audit = objectAt(value, path);
  exactKeys(audit, path, ['decisionId', 'actorId', 'recordedAt']);
  text(audit.decisionId, `${path}.decisionId`, 200);
  text(audit.actorId, `${path}.actorId`, 200);
  isoTimestamp(audit.recordedAt, `${path}.recordedAt`);
}

function confidence(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${path} must be between 0 and 1`);
  }
}

function integer(value: unknown, path: string, minimum: number, maximum: number): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${path} must be an integer from ${minimum} to ${maximum}`);
  }
}

function oneOf<T extends string>(value: unknown, path: string, accepted: readonly T[]): asserts value is T {
  if (typeof value !== 'string' || !accepted.includes(value as T)) {
    throw new Error(`${path} is unsupported`);
  }
}

function validateSource(value: unknown, path: string): ResearchPipelineSource {
  const source = objectAt(value, path);
  exactKeys(source, path, ['authority', 'insightId', 'claimId', 'contentSha256']);
  if (source.authority !== 'scope:notes') throw new Error(`${path}.authority must be scope:notes`);
  if (typeof source.insightId !== 'string' || !UUID_PATTERN.test(source.insightId)) {
    throw new Error(`${path}.insightId must be a UUID`);
  }
  text(source.claimId, `${path}.claimId`, 200);
  if (typeof source.contentSha256 !== 'string' || !DIGEST_PATTERN.test(source.contentSha256)) {
    throw new Error(`${path}.contentSha256 must be a sha256 digest`);
  }
  return value as ResearchPipelineSource;
}

function validateToulminClaim(value: unknown, path: string): ToulminClaim {
  const claim = objectAt(value, path);
  exactKeys(claim, path, [
    'claim', 'evidence', 'reasoning', 'backing', 'qualifier', 'rebuttals', 'timeHorizon', 'ambiguities',
  ]);
  text(claim.claim, `${path}.claim`);
  stringArray(claim.evidence, `${path}.evidence`);
  text(claim.reasoning, `${path}.reasoning`);
  text(claim.backing, `${path}.backing`);
  oneOf(claim.qualifier, `${path}.qualifier`, ['high', 'medium', 'low', 'exploratory'] as const);
  stringArray(claim.rebuttals, `${path}.rebuttals`);
  oneOf(claim.timeHorizon, `${path}.timeHorizon`, ['long_term', 'medium_term', 'short_term'] as const);
  stringArray(claim.ambiguities, `${path}.ambiguities`, true);
  return value as ToulminClaim;
}

function validateExecution(value: unknown, path: string): void {
  const execution = objectAt(value, path);
  exactKeys(execution, path, ['mode', 'writes']);
  if (execution.mode !== 'stage_result_only') throw new Error(`${path}.mode must be stage_result_only`);
  if (!Array.isArray(execution.writes) || execution.writes.length !== 0) {
    throw new Error(`${path} writes must be empty`);
  }
}

function validateLimitations(value: unknown, path: string): void {
  stringArray(value, path);
  if ((value as string[]).length > 8) throw new Error(`${path} must contain at most 8 limitations`);
}

function resultDigest(result: Record<string, unknown>): string {
  const { stageDigest: _ignored, ...digestInput } = result;
  void _ignored;
  return digestResearchPipelineIntakeValue(digestInput);
}

function finish<T extends Omit<ResearchPipelineIntakeResult, 'stageDigest'>>(value: T): T & { stageDigest: string } {
  const cloned = structuredClone(value) as T;
  return { ...cloned, stageDigest: digestResearchPipelineIntakeValue(cloned) };
}

function validateIdeaStatus(value: unknown, path: string): PipelineIdeaStatus {
  const idea = objectAt(value, path);
  exactKeys(idea, path, ['ideaId', 'title', 'sourceInsightId', 'currentStage', 'status', 'confidence', 'createdAt']);
  if (typeof idea.ideaId !== 'string' || !IDEA_ID_PATTERN.test(idea.ideaId)) throw new Error(`${path}.ideaId is invalid`);
  text(idea.title, `${path}.title`);
  if (idea.sourceInsightId !== null
    && (typeof idea.sourceInsightId !== 'string' || !UUID_PATTERN.test(idea.sourceInsightId))) {
    throw new Error(`${path}.sourceInsightId must be null or a UUID`);
  }
  integer(idea.currentStage, `${path}.currentStage`, 1, 5);
  oneOf(idea.status, `${path}.status`, ['active', 'hold', 'killed', 'archived', 'expressed'] as const);
  confidence(idea.confidence, `${path}.confidence`);
  isoTimestamp(idea.createdAt, `${path}.createdAt`);
  return value as PipelineIdeaStatus;
}

function validateKillStatus(value: unknown, path: string): PipelineKillStatus {
  const kill = objectAt(value, path);
  exactKeys(kill, path, ['ideaId', 'title', 'stage', 'category', 'killedAt']);
  if (typeof kill.ideaId !== 'string' || !IDEA_ID_PATTERN.test(kill.ideaId)) throw new Error(`${path}.ideaId is invalid`);
  text(kill.title, `${path}.title`);
  integer(kill.stage, `${path}.stage`, 1, 5);
  text(kill.category, `${path}.category`, 100);
  isoTimestamp(kill.killedAt, `${path}.killedAt`);
  return value as PipelineKillStatus;
}

function validatePipelineStatusInput(value: unknown): PipelineStatusInput {
  const input = objectAt(value, 'pipelineStatusInput');
  exactKeys(input, 'pipelineStatusInput', ['targetInsightId', 'asOf', 'ideas', 'kills']);
  if (typeof input.targetInsightId !== 'string' || !UUID_PATTERN.test(input.targetInsightId)) {
    throw new Error('pipelineStatusInput.targetInsightId must be a UUID');
  }
  isoTimestamp(input.asOf, 'pipelineStatusInput.asOf');
  if (!Array.isArray(input.ideas) || input.ideas.length > MAX_COLLECTION) {
    throw new Error('pipelineStatusInput.ideas must be a bounded array');
  }
  input.ideas.forEach((idea, index) => validateIdeaStatus(idea, `pipelineStatusInput.ideas[${index}]`));
  if (!Array.isArray(input.kills) || input.kills.length > MAX_COLLECTION) {
    throw new Error('pipelineStatusInput.kills must be a bounded array');
  }
  input.kills.forEach((kill, index) => validateKillStatus(kill, `pipelineStatusInput.kills[${index}]`));
  const ids = (input.ideas as PipelineIdeaStatus[]).map(({ ideaId }) => ideaId);
  if (new Set(ids).size !== ids.length) throw new Error('pipelineStatusInput.ideas contains duplicate ideaId values');
  return value as PipelineStatusInput;
}

export function buildPipelineStatusResult(value: unknown): PipelineStatusResult {
  const input = validatePipelineStatusInput(value);
  const ideas = structuredClone(input.ideas).sort((left, right) => left.ideaId.localeCompare(right.ideaId));
  const kills = structuredClone(input.kills).sort((left, right) => (
    left.killedAt.localeCompare(right.killedAt) || left.ideaId.localeCompare(right.ideaId)
  ));
  const targetMatches = ideas.filter(({ sourceInsightId }) => sourceInsightId === input.targetInsightId);
  if (targetMatches.length > 1) throw new Error('pipelineStatusInput contains multiple ideas for targetInsightId');
  const counts = { active: 0, hold: 0, killed: 0, archived: 0, expressed: 0 };
  ideas.forEach(({ status }) => { counts[status] += 1; });
  return finish({
    contractVersion: '1.0.0',
    stage: 'pipeline_status',
    status: 'ready',
    targetInsightId: input.targetInsightId,
    snapshot: { asOf: input.asOf, targetIdea: targetMatches[0] ?? null, ideas, kills, counts },
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'The status result reads supplied coordination records only and does not mutate the shared research workspace.',
      'Legacy pipeline discovery and persistence remain active and unchanged during issue #67 coexistence.',
    ],
  });
}

function validateIdeaIntakeInput(value: unknown): IdeaIntakeInput {
  const input = objectAt(value, 'ideaIntakeInput');
  exactKeys(input, 'ideaIntakeInput', ['source', 'claim', 'selection', 'idea', 'thesisClassification']);
  validateSource(input.source, 'ideaIntakeInput.source');
  validateToulminClaim(input.claim, 'ideaIntakeInput.claim');
  const selection = objectAt(input.selection, 'ideaIntakeInput.selection');
  exactKeys(selection, 'ideaIntakeInput.selection', [
    'selectedBy', 'noveltyScore', 'noveltyOverrideRationale', 'rationale', 'audit',
  ]);
  if (selection.selectedBy !== 'user') throw new Error('ideaIntakeInput.selection.selectedBy must be user');
  confidence(selection.noveltyScore, 'ideaIntakeInput.selection.noveltyScore');
  nullableText(selection.noveltyOverrideRationale, 'ideaIntakeInput.selection.noveltyOverrideRationale');
  if (Number(selection.noveltyScore) < 0.6 && selection.noveltyOverrideRationale === null) {
    throw new Error('ideaIntakeInput.selection requires a user noveltyOverrideRationale below 0.6');
  }
  text(selection.rationale, 'ideaIntakeInput.selection.rationale');
  validateUserJudgmentAudit(selection.audit, 'ideaIntakeInput.selection.audit');
  const idea = objectAt(input.idea, 'ideaIntakeInput.idea');
  exactKeys(idea, 'ideaIntakeInput.idea', ['ideaId', 'title', 'slug', 'confidence']);
  if (typeof idea.ideaId !== 'string' || !IDEA_ID_PATTERN.test(idea.ideaId)) throw new Error('ideaIntakeInput.idea.ideaId is invalid');
  text(idea.title, 'ideaIntakeInput.idea.title');
  if (typeof idea.slug !== 'string' || !SLUG_PATTERN.test(idea.slug)) throw new Error('ideaIntakeInput.idea.slug is invalid');
  confidence(idea.confidence, 'ideaIntakeInput.idea.confidence');
  const classification = objectAt(input.thesisClassification, 'ideaIntakeInput.thesisClassification');
  exactKeys(classification, 'ideaIntakeInput.thesisClassification', [
    'chosenBy', 'kind', 'direction', 'thesisType', 'underlyingTicker',
  ]);
  if (classification.chosenBy !== 'user') throw new Error('ideaIntakeInput.thesisClassification.chosenBy must be user');
  oneOf(classification.kind, 'ideaIntakeInput.thesisClassification.kind', ['macro', 'asset'] as const);
  oneOf(classification.direction, 'ideaIntakeInput.thesisClassification.direction', ['bullish', 'bearish', 'neutral'] as const);
  if (classification.kind === 'macro') {
    oneOf(classification.thesisType, 'ideaIntakeInput.thesisClassification.thesisType', ['secular', 'cyclical', 'structural'] as const);
    if (classification.underlyingTicker !== null) throw new Error('macro classification cannot set underlyingTicker');
  } else {
    if (classification.thesisType !== null) throw new Error('asset classification cannot set thesisType');
    text(classification.underlyingTicker, 'ideaIntakeInput.thesisClassification.underlyingTicker', 50);
  }
  return value as IdeaIntakeInput;
}

export function buildIdeaIntakeResult(value: unknown): IdeaIntakeResult {
  const input = validateIdeaIntakeInput(value);
  return finish({
    contractVersion: '1.0.0',
    stage: 'idea_intake',
    status: 'ready',
    ...structuredClone(input),
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'Notes/Tana remains authoritative for capture, source material, and Toulmin extraction.',
      'This result does not create a pipeline directory, thesis, journal entry, status change, or Decision Item.',
      'Legacy persistence remains available through the unchanged stage-1 entry point during coexistence.',
    ],
  });
}

function validateNamedRationale(value: unknown, path: string): void {
  const item = objectAt(value, path);
  exactKeys(item, path, ['name', 'rationale']);
  text(item.name, `${path}.name`);
  text(item.rationale, `${path}.rationale`);
}

function validateFailureMode(value: unknown, path: string): void {
  const mode = objectAt(value, path);
  exactKeys(mode, path, ['title', 'category', 'description', 'indicators']);
  text(mode.title, `${path}.title`);
  oneOf(mode.category, `${path}.category`, ['structural', 'execution', 'timing', 'external'] as const);
  text(mode.description, `${path}.description`);
  stringArray(mode.indicators, `${path}.indicators`);
}

function validateThesisPayload(
  value: unknown,
  path: string,
  sourceClaim?: Pick<ToulminClaim, 'qualifier' | 'rebuttals' | 'ambiguities'>,
): void {
  const thesis = objectAt(value, path);
  exactKeys(thesis, path, [
    'coreThesis', 'primaryEconomicDriver', 'valueChainImpact', 'beneficiaries', 'victims',
    'failureModes', 'qualifier', 'rebuttals', 'ambiguities',
  ]);
  text(thesis.coreThesis, `${path}.coreThesis`);
  if ((thesis.coreThesis as string).trim().split(/\s+/).length > 25) {
    throw new Error(`${path}.coreThesis must contain at most 25 words`);
  }
  text(thesis.primaryEconomicDriver, `${path}.primaryEconomicDriver`);
  text(thesis.valueChainImpact, `${path}.valueChainImpact`);
  for (const field of ['beneficiaries', 'victims'] as const) {
    const values = thesis[field];
    if (!Array.isArray(values) || values.length === 0 || values.length > 10) {
      throw new Error(`${path}.${field} must be a bounded non-empty array`);
    }
    values.forEach((item, index) => validateNamedRationale(item, `${path}.${field}[${index}]`));
  }
  if (!Array.isArray(thesis.failureModes) || thesis.failureModes.length !== 5) {
    throw new Error(`${path}.failureModes must contain exactly 5 modes`);
  }
  thesis.failureModes.forEach((mode, index) => validateFailureMode(mode, `${path}.failureModes[${index}]`));
  const categories = (thesis.failureModes as Array<{ category: FailureModeCategory }>).map(({ category }) => category);
  if (categories.filter((category) => category === 'structural').length < 2 || !categories.includes('execution')) {
    throw new Error('failureModes require at least 2 structural modes and 1 execution mode');
  }
  oneOf(thesis.qualifier, `${path}.qualifier`, ['high', 'medium', 'low', 'exploratory'] as const);
  stringArray(thesis.rebuttals, `${path}.rebuttals`);
  stringArray(thesis.ambiguities, `${path}.ambiguities`, true);
  if (sourceClaim && thesis.qualifier !== sourceClaim.qualifier) {
    throw new Error(`${path}.qualifier must preserve the source qualifier`);
  }
  if (sourceClaim?.rebuttals.some((rebuttal) => !(thesis.rebuttals as string[]).includes(rebuttal))) {
    throw new Error(`${path}.rebuttals must preserve every source rebuttal`);
  }
  if (sourceClaim?.ambiguities.some((ambiguity) => !(thesis.ambiguities as string[]).includes(ambiguity))) {
    throw new Error(`${path}.ambiguities must preserve every source ambiguity`);
  }
}

function validateFormalizationInput(value: unknown): ThesisFormalizationInput {
  const input = objectAt(value, 'thesisFormalizationInput');
  exactKeys(input, 'thesisFormalizationInput', ['source', 'previousStage', 'thesis', 'gate']);
  const source = validateSource(input.source, 'thesisFormalizationInput.source');
  let previous: ResearchPipelineIntakeResult;
  try {
    previous = validateResearchPipelineIntakeResult(input.previousStage);
  } catch (error) {
    throw new Error(`thesisFormalizationInput.previousStageDigest is stale or invalid: ${String(error)}`);
  }
  if (previous.stage !== 'idea_intake' || previous.status !== 'ready') {
    throw new Error('thesisFormalizationInput.previousStage must be a ready idea_intake result');
  }
  if (digestResearchPipelineIntakeValue(previous.source) !== digestResearchPipelineIntakeValue(source)) {
    throw new Error('thesisFormalizationInput.previousStage provenance is stale');
  }
  validateThesisPayload(input.thesis, 'thesisFormalizationInput.thesis', previous.claim);
  validateGate(input.gate, 'thesisFormalizationInput.gate', ['advance', 'hold', 'kill']);
  return value as ThesisFormalizationInput;
}

function validateGate(value: unknown, path: string, decisions: readonly string[]): ResearchPipelineIntakeStatus {
  const gate = objectAt(value, path);
  exactKeys(gate, path, ['recommendation', 'decision', 'decidedBy', 'rationale', 'audit']);
  oneOf(gate.recommendation, `${path}.recommendation`, decisions);
  text(gate.rationale, `${path}.rationale`);
  if (gate.decision === null) {
    if (gate.decidedBy !== null) throw new Error(`${path}.decidedBy must be null while judgment is unresolved`);
    if (gate.audit !== null) throw new Error(`${path}.audit must be null while judgment is unresolved`);
    return 'judgment_required';
  }
  oneOf(gate.decision, `${path}.decision`, decisions);
  if (gate.decidedBy !== 'user') throw new Error(`${path}.decidedBy must be user for a resolved gate`);
  validateUserJudgmentAudit(gate.audit, `${path}.audit`);
  return 'ready';
}

export function buildThesisFormalizationResult(value: unknown): ThesisFormalizationResult {
  const input = validateFormalizationInput(value);
  const status = input.gate.decision === null ? 'judgment_required' : 'ready';
  return finish({
    contractVersion: '1.0.0',
    stage: 'thesis_formalization',
    status,
    source: structuredClone(input.source),
    previousStageDigest: input.previousStage.stageDigest,
    thesis: structuredClone(input.thesis),
    gate: structuredClone(input.gate),
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'The gate recommendation is provider analysis; only an explicit user decision can make the stage ready.',
      'This result does not write stage files, mutate a thesis, change status, or create or resolve a Decision Item.',
      'Legacy persistence remains available through the unchanged stage-2 entry point during coexistence.',
    ],
  });
}

function validateUnknown(value: unknown, path: string): void {
  const unknown = objectAt(value, path);
  exactKeys(unknown, path, [
    'id', 'question', 'impact', 'resolutionType', 'externallyResolvable', 'killCondition',
    'convictionIncreaseCondition', 'recommendedSources', 'estimatedEffortHours', 'researchQueries', 'ambiguities',
    'pricedIn',
  ]);
  if (typeof unknown.id !== 'string' || !/^unknown-[1-9][0-9]*$/.test(unknown.id)) throw new Error(`${path}.id is invalid`);
  text(unknown.question, `${path}.question`);
  oneOf(unknown.impact, `${path}.impact`, ['high', 'medium', 'low'] as const);
  oneOf(unknown.resolutionType, `${path}.resolutionType`, ['empirical', 'industry', 'regulatory', 'technological'] as const);
  oneOf(unknown.externallyResolvable, `${path}.externallyResolvable`, ['yes', 'no', 'partially'] as const);
  text(unknown.killCondition, `${path}.killCondition`);
  text(unknown.convictionIncreaseCondition, `${path}.convictionIncreaseCondition`);
  stringArray(unknown.recommendedSources, `${path}.recommendedSources`);
  if (typeof unknown.estimatedEffortHours !== 'number' || !Number.isFinite(unknown.estimatedEffortHours)
    || unknown.estimatedEffortHours <= 0 || unknown.estimatedEffortHours > 1_000) {
    throw new Error(`${path}.estimatedEffortHours must be positive and bounded`);
  }
  stringArray(unknown.researchQueries, `${path}.researchQueries`);
  stringArray(unknown.ambiguities, `${path}.ambiguities`, true);
  oneOf(unknown.pricedIn, `${path}.pricedIn`, ['yes', 'no', 'partially'] as const);
}

function validateUnknownMappingPayload(
  unknownValues: unknown,
  researchPlanValue: unknown,
  path: string,
): UnknownMappingInput['unknowns'] {
  if (!Array.isArray(unknownValues) || unknownValues.length < 3 || unknownValues.length > MAX_COLLECTION) {
    throw new Error(`${path}.unknowns must contain at least 3 bounded entries`);
  }
  unknownValues.forEach((item, index) => validateUnknown(item, `${path}.unknowns[${index}]`));
  const unknowns = unknownValues as UnknownMappingInput['unknowns'];
  const ids = unknowns.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`${path}.unknowns contains duplicate IDs`);
  const impactRank = { high: 0, medium: 1, low: 2 } as const;
  if (unknowns.some((item, index) => index > 0
    && impactRank[item.impact] < impactRank[unknowns[index - 1].impact])) {
    throw new Error(`${path}.unknowns must be ranked high to low by decision impact`);
  }
  const researchPlan = objectAt(researchPlanValue, `${path}.researchPlan`);
  exactKeys(researchPlan, `${path}.researchPlan`, [
    'priority', 'totalEstimatedEffortHours', 'recommendedApproach',
  ]);
  stringArray(researchPlan.priority, `${path}.researchPlan.priority`);
  if ((researchPlan.priority as string[]).length !== ids.length
    || (researchPlan.priority as string[]).some((id, index) => id !== ids[index])) {
    throw new Error(`${path}.researchPlan.priority must list every unknown once in input order`);
  }
  const effort = unknowns.reduce((total, item) => total + item.estimatedEffortHours, 0);
  if (researchPlan.totalEstimatedEffortHours !== effort) {
    throw new Error(`${path}.researchPlan.totalEstimatedEffortHours must equal the unknown effort total`);
  }
  text(researchPlan.recommendedApproach, `${path}.researchPlan.recommendedApproach`);
  return unknowns;
}

function validateUnknownMappingInput(value: unknown): UnknownMappingInput {
  const input = objectAt(value, 'unknownMappingInput');
  exactKeys(input, 'unknownMappingInput', [
    'source', 'previousStage', 'unknowns', 'researchPlan', 'assessment', 'gate',
  ]);
  const source = validateSource(input.source, 'unknownMappingInput.source');
  let previous: ResearchPipelineIntakeResult;
  try {
    previous = validateResearchPipelineIntakeResult(input.previousStage);
  } catch (error) {
    throw new Error(`unknownMappingInput.previousStageDigest is stale or invalid: ${String(error)}`);
  }
  if (previous.stage !== 'thesis_formalization' || previous.status !== 'ready') {
    throw new Error('unknownMappingInput.previousStage must be a ready thesis_formalization result');
  }
  if (previous.gate.decision !== 'advance' || previous.gate.decidedBy !== 'user') {
    throw new Error('unknownMappingInput.previousStage requires an explicit user advance decision');
  }
  if (digestResearchPipelineIntakeValue(previous.source) !== digestResearchPipelineIntakeValue(source)) {
    throw new Error('unknownMappingInput.previousStage provenance is stale');
  }
  const unknowns = validateUnknownMappingPayload(input.unknowns, input.researchPlan, 'unknownMappingInput');
  const assessment = objectAt(input.assessment, 'unknownMappingInput.assessment');
  exactKeys(assessment, 'unknownMappingInput.assessment', [
    'decisiveUnknownsExist', 'allUnknownsPricedIn', 'thesisExternallyResearchable', 'researchPayoff',
  ]);
  for (const field of ['decisiveUnknownsExist', 'allUnknownsPricedIn', 'thesisExternallyResearchable'] as const) {
    if (typeof assessment[field] !== 'boolean') {
      throw new Error(`unknownMappingInput.assessment.${field} must be boolean`);
    }
  }
  oneOf(assessment.researchPayoff, 'unknownMappingInput.assessment.researchPayoff', [
    'asymmetric', 'symmetric', 'negative',
  ] as const);
  const allUnknownsPricedIn = unknowns.every((item) => item.pricedIn === 'yes');
  if (assessment.allUnknownsPricedIn !== allUnknownsPricedIn) {
    throw new Error('unknownMappingInput.assessment.allUnknownsPricedIn must match the unknown assessments');
  }
  const decisiveUnknownsExist = unknowns.some((item) => item.impact === 'high');
  if (assessment.decisiveUnknownsExist !== decisiveUnknownsExist) {
    throw new Error('unknownMappingInput.assessment.decisiveUnknownsExist must match the ranked unknowns');
  }
  const thesisExternallyResearchable = unknowns.some((item) => item.impact === 'high'
    && (item.externallyResolvable === 'yes' || item.externallyResolvable === 'partially'));
  if (assessment.thesisExternallyResearchable !== thesisExternallyResearchable) {
    throw new Error('unknownMappingInput.assessment.thesisExternallyResearchable must match the ranked unknowns');
  }
  validateGate(input.gate, 'unknownMappingInput.gate', ['advance', 'kill', 'archive']);
  const gate = objectAt(input.gate, 'unknownMappingInput.gate');
  const hasAdvanceUnknown = unknowns.some((item) => item.impact === 'high'
    && (item.externallyResolvable === 'yes' || item.externallyResolvable === 'partially')
    && item.pricedIn !== 'yes' && item.killCondition.trim().length > 0);
  const mustKill = assessment.decisiveUnknownsExist === false
    || assessment.allUnknownsPricedIn === true
    || assessment.thesisExternallyResearchable === false;
  const canAdvance = !mustKill && hasAdvanceUnknown && assessment.researchPayoff === 'asymmetric';
  const requiredRecommendation = mustKill ? 'kill' : canAdvance ? 'advance' : 'archive';
  if (gate.recommendation !== requiredRecommendation) {
    throw new Error(`unknownMappingInput.gate.recommendation must be ${requiredRecommendation} for the gate assessment`);
  }
  if (gate.decision !== null && gate.decision !== requiredRecommendation) {
    throw new Error(`unknownMappingInput.gate.decision must be ${requiredRecommendation} for the gate assessment`);
  }
  return value as UnknownMappingInput;
}

export function buildUnknownMappingResult(value: unknown): UnknownMappingResult {
  const input = validateUnknownMappingInput(value);
  const status = input.gate.decision === null ? 'judgment_required' : 'ready';
  return finish({
    contractVersion: '1.0.0',
    stage: 'unknown_mapping',
    status,
    source: structuredClone(input.source),
    previousStageDigest: input.previousStage.stageDigest,
    unknowns: structuredClone(input.unknowns),
    researchPlan: structuredClone(input.researchPlan),
    assessment: structuredClone(input.assessment),
    gate: structuredClone(input.gate),
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'The gate recommendation is provider analysis; only an explicit user decision can make the stage ready.',
      'This result does not perform research, write stage files, mutate a thesis, or create or resolve a Decision Item.',
      'Legacy persistence remains available through the unchanged stage-3 entry point during coexistence.',
    ],
  });
}

export function validateResearchPipelineIntakeResult(value: unknown): ResearchPipelineIntakeResult {
  const result = objectAt(value, 'result');
  const stage = result.stage;
  oneOf(stage, 'result.stage', ['pipeline_status', 'idea_intake', 'thesis_formalization', 'unknown_mapping'] as const);
  const common = ['contractVersion', 'stage', 'status', 'stageDigest', 'execution', 'limitations'];
  if (stage === 'pipeline_status') {
    exactKeys(result, 'result', [...common, 'targetInsightId', 'snapshot']);
    if (result.status !== 'ready') throw new Error('pipeline_status result.status must be ready');
    const snapshot = objectAt(result.snapshot, 'result.snapshot');
    exactKeys(snapshot, 'result.snapshot', ['asOf', 'targetIdea', 'ideas', 'kills', 'counts']);
    const rebuilt = buildPipelineStatusResult({
      targetInsightId: result.targetInsightId,
      asOf: snapshot.asOf,
      ideas: snapshot.ideas,
      kills: snapshot.kills,
    });
    if (digestResearchPipelineIntakeValue(rebuilt.snapshot) !== digestResearchPipelineIntakeValue(snapshot)) {
      throw new Error('result.snapshot does not match the deterministic pipeline status');
    }
  } else if (stage === 'idea_intake') {
    exactKeys(result, 'result', [
      ...common, 'source', 'claim', 'selection', 'idea', 'thesisClassification',
    ]);
    if (result.status !== 'ready') throw new Error('idea_intake result.status must be ready');
    validateIdeaIntakeInput({
      source: result.source,
      claim: result.claim,
      selection: result.selection,
      idea: result.idea,
      thesisClassification: result.thesisClassification,
    });
  } else if (stage === 'thesis_formalization') {
    exactKeys(result, 'result', [...common, 'source', 'previousStageDigest', 'thesis', 'gate']);
    validateSource(result.source, 'result.source');
    if (typeof result.previousStageDigest !== 'string' || !DIGEST_PATTERN.test(result.previousStageDigest)) {
      throw new Error('result.previousStageDigest must be a sha256 digest');
    }
    const gateStatus = validateGate(result.gate, 'result.gate', ['advance', 'hold', 'kill']);
    validateThesisPayload(result.thesis, 'result.thesis');
    if (result.status !== gateStatus) throw new Error('result.status does not match the thesis gate');
  } else {
    exactKeys(result, 'result', [
      ...common, 'source', 'previousStageDigest', 'unknowns', 'researchPlan', 'assessment', 'gate',
    ]);
    validateSource(result.source, 'result.source');
    if (typeof result.previousStageDigest !== 'string' || !DIGEST_PATTERN.test(result.previousStageDigest)) {
      throw new Error('result.previousStageDigest must be a sha256 digest');
    }
    const unknowns = validateUnknownMappingPayload(result.unknowns, result.researchPlan, 'result');
    const assessment = objectAt(result.assessment, 'result.assessment');
    exactKeys(assessment, 'result.assessment', [
      'decisiveUnknownsExist', 'allUnknownsPricedIn', 'thesisExternallyResearchable', 'researchPayoff',
    ]);
    for (const field of ['decisiveUnknownsExist', 'allUnknownsPricedIn', 'thesisExternallyResearchable'] as const) {
      if (typeof assessment[field] !== 'boolean') throw new Error(`result.assessment.${field} must be boolean`);
    }
    oneOf(assessment.researchPayoff, 'result.assessment.researchPayoff', [
      'asymmetric', 'symmetric', 'negative',
    ] as const);
    if (assessment.allUnknownsPricedIn !== unknowns.every((item) => item.pricedIn === 'yes')) {
      throw new Error('result.assessment.allUnknownsPricedIn must match the unknown assessments');
    }
    if (assessment.decisiveUnknownsExist !== unknowns.some((item) => item.impact === 'high')) {
      throw new Error('result.assessment.decisiveUnknownsExist must match the ranked unknowns');
    }
    const thesisExternallyResearchable = unknowns.some((item) => item.impact === 'high'
      && (item.externallyResolvable === 'yes' || item.externallyResolvable === 'partially'));
    if (assessment.thesisExternallyResearchable !== thesisExternallyResearchable) {
      throw new Error('result.assessment.thesisExternallyResearchable must match the ranked unknowns');
    }
    const gateStatus = validateGate(result.gate, 'result.gate', ['advance', 'kill', 'archive']);
    const gate = objectAt(result.gate, 'result.gate');
    const hasAdvanceUnknown = unknowns.some((item) => item.impact === 'high'
      && (item.externallyResolvable === 'yes' || item.externallyResolvable === 'partially')
      && item.pricedIn !== 'yes' && item.killCondition.trim().length > 0);
    const mustKill = assessment.decisiveUnknownsExist === false
      || assessment.allUnknownsPricedIn === true
      || assessment.thesisExternallyResearchable === false;
    const requiredRecommendation = mustKill
      ? 'kill'
      : hasAdvanceUnknown && assessment.researchPayoff === 'asymmetric' ? 'advance' : 'archive';
    if (gate.recommendation !== requiredRecommendation) {
      throw new Error(`result.gate.recommendation must be ${requiredRecommendation} for the gate assessment`);
    }
    if (gate.decision !== null && gate.decision !== requiredRecommendation) {
      throw new Error(`result.gate.decision must be ${requiredRecommendation} for the gate assessment`);
    }
    if (result.status !== gateStatus) throw new Error('result.status does not match the unknown-mapping gate');
  }
  if (result.contractVersion !== '1.0.0') throw new Error('result.contractVersion must be 1.0.0');
  validateExecution(result.execution, 'result.execution');
  validateLimitations(result.limitations, 'result.limitations');
  if (typeof result.stageDigest !== 'string' || !DIGEST_PATTERN.test(result.stageDigest)
    || result.stageDigest !== resultDigest(result)) {
    throw new Error('result.stageDigest does not match the canonical stage result');
  }
  return value as ResearchPipelineIntakeResult;
}
