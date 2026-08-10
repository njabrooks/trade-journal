import { createHash } from 'node:crypto';
import {
  digestClaimsSynthesisContext,
  validateClaimsSynthesisResult,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisReadyResult,
} from './claimsSynthesis.js';
import {
  digestResearchPipelineIntakeValue,
  validateResearchPipelineSource,
  validateResearchPipelineIntakeResult,
  type ResearchPipelineSource,
  type ThesisFormalizationResult,
  type UnknownMappingResult,
  type UserJudgmentAudit,
} from './researchPipelineIntake.js';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_TEXT = 2_000;
const MAX_COLLECTION = 50;

export type ResearchPipelineResearchStage =
  | 'research_preparation'
  | 'unknown_research'
  | 'evidence_synthesis'
  | 'thesis_expression'
  | 'gate_decision'
  | 'graduation';

interface StageBase {
  contractVersion: '1.0.0';
  stage: ResearchPipelineResearchStage;
  status: 'ready' | 'judgment_required' | 'unavailable' | 'refused';
  stageDigest: string;
  execution: { mode: 'stage_result_only'; writes: [] };
  limitations: string[];
}

export interface ResearchPreparationInput {
  source: ResearchPipelineSource;
  thesisFormalization: ThesisFormalizationResult;
  previousStage: UnknownMappingResult;
  unknownId: string;
  track: 'falsification' | 'validation' | 'analogues';
  delivery: 'portable_research_brief';
}

export interface ResearchPreparationResult extends StageBase {
  stage: 'research_preparation';
  status: 'ready';
  source: ResearchPipelineSource;
  thesisFormalizationDigest: string;
  previousStageDigest: string;
  unknownId: string;
  track: ResearchPreparationInput['track'];
  delivery: ResearchPreparationInput['delivery'];
  brief: {
    thesis: string;
    question: string;
    decisionImpact: 'high' | 'medium' | 'low';
    killCondition: string;
    convictionIncreaseCondition: string;
    researchQueries: string[];
    recommendedSources: string[];
    ambiguities: string[];
    sourceRequirements: {
      inlineUrlsRequired: true;
      minimumIndependentSources: 2;
      primarySourcesPreferred: true;
    };
  };
}

export type ResearchSourceType =
  | 'company_filing'
  | 'government_data'
  | 'industry_report'
  | 'academic_paper'
  | 'expert_opinion'
  | 'news_media';

export interface UnknownResearchReadyInput {
  source: ResearchPipelineSource;
  previousStage: ResearchPreparationResult;
  researchedAt: string;
  findings: Array<{
    id: string;
    title: string;
    url: string;
    sourceType: ResearchSourceType;
    credibility: 'high' | 'medium' | 'low';
    content: string;
    bearing: string;
  }>;
  assessment: {
    killCondition: 'triggered' | 'not_triggered' | 'partially_triggered' | 'inconclusive';
    convictionCondition: 'met' | 'not_met' | 'partially_met' | 'inconclusive';
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
    unresolvedAmbiguities: string[];
  };
}

export interface UnknownResearchUnavailableInput {
  source: ResearchPipelineSource;
  previousStage: ResearchPreparationResult;
  availability: {
    status: 'unavailable';
    reason: string;
    unavailablePrerequisites: string[];
  };
}

export type UnknownResearchInput = UnknownResearchReadyInput | UnknownResearchUnavailableInput;

export interface UnknownResearchReadyResult extends StageBase {
  stage: 'unknown_research';
  status: 'ready';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  unknownMappingDigest: string;
  unknownId: string;
  track: ResearchPreparationInput['track'];
  researchedAt: string;
  findings: UnknownResearchReadyInput['findings'];
  sourceDomains: string[];
  assessment: UnknownResearchReadyInput['assessment'];
}

export interface UnknownResearchUnavailableResult extends StageBase {
  stage: 'unknown_research';
  status: 'unavailable';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  unknownMappingDigest: string;
  unknownId: string;
  track: ResearchPreparationInput['track'];
  availability: UnknownResearchUnavailableInput['availability'];
}

export type UnknownResearchResult = UnknownResearchReadyResult | UnknownResearchUnavailableResult;

export interface EvidenceSynthesisInput {
  source: ResearchPipelineSource;
  previousStage: UnknownMappingResult;
  researchResults: UnknownResearchReadyResult[];
  priorConfidence: number;
  synthesis: {
    themes: Array<{ title: string; strength: 'strong' | 'moderate' | 'weak'; findingIds: string[] }>;
    contradictions: Array<{
      topic: string;
      positionA: string;
      positionB: string;
      resolution: 'resolved' | 'unresolved';
    }>;
    unknownResolutions: Array<{
      unknownId: string;
      resolution: 'resolved' | 'partial' | 'unresolved';
      killCondition: UnknownResearchReadyInput['assessment']['killCondition'];
      convictionCondition: UnknownResearchReadyInput['assessment']['convictionCondition'];
      rationale: string;
    }>;
    evidenceQuality: 'good' | 'adequate' | 'poor';
    coreMechanismSupported: boolean;
    posteriorConfidence: number;
    recommendation: 'advance' | 'hold' | 'kill' | 'modify';
    rationale: string;
    modifiedThesis: string | null;
  };
}

export interface EvidenceSynthesisResult extends StageBase {
  stage: 'evidence_synthesis';
  status: 'ready';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  researchResultDigests: string[];
  priorConfidence: number;
  posteriorConfidence: number;
  confidenceChange: number;
  decisionCriticalUnknownIds: string[];
  synthesis: EvidenceSynthesisInput['synthesis'];
}

export interface ThesisExpressionInput {
  source: ResearchPipelineSource;
  previousStage: EvidenceSynthesisResult;
  entryDecision: {
    decision: 'advance' | 'modify_and_advance';
    decidedBy: 'user';
    rationale: string;
    audit: UserJudgmentAudit;
  };
  expression: {
    valueChain: Array<{
      layer: 'upstream' | 'direct' | 'downstream' | 'enabler';
      entity: string;
      revenueSensitivity: 'high' | 'medium' | 'low';
      marginImpact: 'improve' | 'compress' | 'neutral';
      capitalIntensity: 'high' | 'medium' | 'low';
      timing: 'immediate' | 'one_to_two_years' | 'three_to_five_years';
      executionRisk: string;
    }>;
    candidates: Array<{
      id: string;
      instrument: string;
      orderOfEffect: 'first' | 'second' | 'third' | 'victim';
      consensus: 'crowded' | 'moderate' | 'underfollowed';
      thesisRightExpressionFailsRisk: string;
      entryCriteria: string[];
      profitExitCriteria: string[];
      lossExitCriteria: string[];
      reviewTriggers: string[];
      sizingInputs: {
        liquidity: string;
        volatility: string;
        portfolioCorrelation: string;
        maximumAdverseScenario: string;
        horizonAlignment: string;
      };
    }>;
    recommendedAction: 'act' | 'watch' | 'discard';
    recommendedExpressionIds: string[];
    rationale: string;
  };
}

export interface ThesisExpressionResult extends StageBase {
  stage: 'thesis_expression';
  status: 'ready';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  entryDecision: ThesisExpressionInput['entryDecision'];
  expression: ThesisExpressionInput['expression'];
}

export interface GateDecisionInput {
  source: ResearchPipelineSource;
  previousStage: ThesisExpressionResult;
  gate: {
    recommendation: 'act' | 'watch' | 'discard';
    decision: 'act' | 'watch' | 'discard' | null;
    decidedBy: 'user' | null;
    rationale: string;
    audit: UserJudgmentAudit | null;
  };
}

export interface GateDecisionResult extends StageBase {
  stage: 'gate_decision';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  gate: GateDecisionInput['gate'];
}

const GRADUATION_DEPENDENCIES = [
  'capability:scope:trade-journal/claims-synthesis',
  'capability:scope:trade-journal/research-publication',
  'capability:scope:trade-journal/belief-research-relation',
  'capability:scope:trade-journal/thesis-underwriting',
] as const;

export interface GraduationInput {
  source: ResearchPipelineSource;
  previousStage: GateDecisionResult;
  claimsSynthesis: {
    context: ClaimsSynthesisContext;
    result: ClaimsSynthesisReadyResult;
  } | null;
  acceptance: {
    decision: 'accept' | 'decline' | null;
    decidedBy: 'user' | null;
    rationale: string;
    audit: (UserJudgmentAudit & { boundaryDigest: string }) | null;
  };
  handoff: {
    disposition: 'prepare_thesis_handoff' | 'no_graduation';
    thesisCandidate: {
      kind: 'macro' | 'asset';
      title: string;
      direction: 'bullish' | 'bearish' | 'neutral';
      thesisType: 'secular' | 'cyclical' | 'structural' | null;
      underlyingTicker: string | null;
      initialLifecycle: 'developing';
    } | null;
    provenanceClaims: Array<{
      sourceInsightId: string;
      sourceClaimId: string;
      existingMainClaimId: string | null;
    }>;
    articulation: { required: true; deriveResolutionFromRebuttals: true };
    dependencyStates: Array<{
      capabilityId: typeof GRADUATION_DEPENDENCIES[number];
      state: 'registry_locked' | 'unavailable';
    }>;
  };
}

export interface GraduationResult extends StageBase {
  stage: 'graduation';
  status: 'ready' | 'judgment_required' | 'refused';
  source: ResearchPipelineSource;
  previousStageDigest: string;
  finalDecision: 'act' | 'watch' | 'discard';
  claimsSynthesisBinding: {
    sourceClaimId: string;
    existingMainClaimId: string | null;
    contextDigest: string;
    resultDigest: string;
  } | null;
  acceptanceBoundaryDigest: string;
  acceptance: GraduationInput['acceptance'];
  handoff: GraduationInput['handoff'];
}

export type ResearchPipelineResearchResult =
  | ResearchPreparationResult
  | UnknownResearchResult
  | EvidenceSynthesisResult
  | ThesisExpressionResult
  | GateDecisionResult
  | GraduationResult;

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

export function digestResearchPipelineResearchValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, path: string, allowed: string[]): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw new Error(`${path} contains unsupported fields: ${unsupported.join(', ')}`);
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length) throw new Error(`${path} is missing fields: ${missing.join(', ')}`);
}

function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_TEXT) {
    throw new Error(`${path} must be a bounded non-empty string`);
  }
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

function oneOf(value: unknown, path: string, accepted: readonly string[]): void {
  if (typeof value !== 'string' || !accepted.includes(value)) throw new Error(`${path} is unsupported`);
}

function confidence(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${path} must be between 0 and 1`);
  }
}

function validateUserJudgmentAudit(value: unknown, path: string): void {
  const audit = objectAt(value, path);
  exactKeys(audit, path, ['decisionId', 'actorId', 'recordedAt']);
  text(audit.decisionId, `${path}.decisionId`);
  text(audit.actorId, `${path}.actorId`);
  isoTimestamp(audit.recordedAt, `${path}.recordedAt`);
}

function sameSource(left: ResearchPipelineSource, right: ResearchPipelineSource): boolean {
  return digestResearchPipelineIntakeValue(left) === digestResearchPipelineIntakeValue(right);
}

function finish<T extends Omit<ResearchPipelineResearchResult, 'stageDigest'>>(
  value: T,
): T & { stageDigest: string } {
  const cloned = structuredClone(value) as T;
  return { ...cloned, stageDigest: digestResearchPipelineResearchValue(cloned) };
}

export function buildResearchPreparationResult(value: unknown): ResearchPreparationResult {
  const input = objectAt(value, 'researchPreparationInput');
  exactKeys(input, 'researchPreparationInput', [
    'source', 'thesisFormalization', 'previousStage', 'unknownId', 'track', 'delivery',
  ]);
  const formalization = validateResearchPipelineIntakeResult(input.thesisFormalization);
  const mapping = validateResearchPipelineIntakeResult(input.previousStage);
  if (formalization.stage !== 'thesis_formalization' || formalization.status !== 'ready') {
    throw new Error('researchPreparationInput.thesisFormalization must be a ready thesis_formalization result');
  }
  if (mapping.stage !== 'unknown_mapping' || mapping.status !== 'ready') {
    throw new Error('researchPreparationInput.previousStage must be a ready unknown_mapping result');
  }
  if (mapping.gate.decision !== 'advance' || mapping.gate.decidedBy !== 'user') {
    throw new Error('researchPreparationInput.previousStage requires an explicit user advance decision');
  }
  if (mapping.previousStageDigest !== formalization.stageDigest) {
    throw new Error('researchPreparationInput thesis-formalization digest is stale');
  }
  const source = validateResearchPipelineSource(input.source, 'researchPreparationInput.source');
  if (!sameSource(source, formalization.source) || !sameSource(source, mapping.source)) {
    throw new Error('researchPreparationInput source provenance is stale');
  }
  if (!['falsification', 'validation', 'analogues'].includes(String(input.track))) {
    throw new Error('researchPreparationInput.track is unsupported');
  }
  if (input.delivery !== 'portable_research_brief') {
    throw new Error('researchPreparationInput.delivery must be portable_research_brief');
  }
  const unknown = mapping.unknowns.find(({ id }) => id === input.unknownId);
  if (!unknown) throw new Error('researchPreparationInput.unknownId is not present in the accepted unknown mapping');

  return finish({
    contractVersion: '1.0.0',
    stage: 'research_preparation',
    status: 'ready',
    source: structuredClone(source),
    thesisFormalizationDigest: formalization.stageDigest,
    previousStageDigest: mapping.stageDigest,
    unknownId: unknown.id,
    track: input.track as ResearchPreparationInput['track'],
    delivery: 'portable_research_brief',
    brief: {
      thesis: formalization.thesis.coreThesis,
      question: unknown.question,
      decisionImpact: unknown.impact,
      killCondition: unknown.killCondition,
      convictionIncreaseCondition: unknown.convictionIncreaseCondition,
      researchQueries: structuredClone(unknown.researchQueries),
      recommendedSources: structuredClone(unknown.recommendedSources),
      ambiguities: structuredClone(unknown.ambiguities),
      sourceRequirements: {
        inlineUrlsRequired: true,
        minimumIndependentSources: 2,
        primarySourcesPreferred: true,
      },
    },
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'This portable brief does not require or imply a particular provider or runtime.',
      'Notes/Tana remains authoritative for capture, source material, and Toulmin extraction.',
      'This result does not perform research, write a pipeline file, or mutate any Trade Journal entity.',
      'The unchanged stage-4a preparation entry point remains the rollback-capable persistence path.',
    ],
  });
}

function validateFinding(value: unknown, path: string): URL {
  const finding = objectAt(value, path);
  exactKeys(finding, path, ['id', 'title', 'url', 'sourceType', 'credibility', 'content', 'bearing']);
  for (const field of ['id', 'title', 'content', 'bearing'] as const) text(finding[field], `${path}.${field}`);
  oneOf(finding.sourceType, `${path}.sourceType`, [
    'company_filing', 'government_data', 'industry_report', 'academic_paper', 'expert_opinion', 'news_media',
  ]);
  oneOf(finding.credibility, `${path}.credibility`, ['high', 'medium', 'low']);
  let url: URL;
  try {
    url = new URL(String(finding.url));
  } catch {
    throw new Error(`${path}.url must be an absolute URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${path}.url must use https`);
  return url;
}

function validateAssessment(value: unknown, path: string): void {
  const assessment = objectAt(value, path);
  exactKeys(assessment, path, [
    'killCondition', 'convictionCondition', 'confidence', 'rationale', 'unresolvedAmbiguities',
  ]);
  oneOf(assessment.killCondition, `${path}.killCondition`, [
    'triggered', 'not_triggered', 'partially_triggered', 'inconclusive',
  ]);
  oneOf(assessment.convictionCondition, `${path}.convictionCondition`, [
    'met', 'not_met', 'partially_met', 'inconclusive',
  ]);
  oneOf(assessment.confidence, `${path}.confidence`, ['high', 'medium', 'low']);
  text(assessment.rationale, `${path}.rationale`);
  stringArray(assessment.unresolvedAmbiguities, `${path}.unresolvedAmbiguities`, true);
}

export function buildUnknownResearchResult(value: unknown): UnknownResearchResult {
  const input = objectAt(value, 'unknownResearchInput');
  const unavailable = 'availability' in input;
  exactKeys(input, 'unknownResearchInput', unavailable
    ? ['source', 'previousStage', 'availability']
    : ['source', 'previousStage', 'researchedAt', 'findings', 'assessment']);
  const previous = validateResearchPipelineResearchResult(input.previousStage);
  if (previous.stage !== 'research_preparation' || previous.status !== 'ready') {
    throw new Error('unknownResearchInput.previousStage must be a ready research_preparation result');
  }
  const source = validateResearchPipelineSource(input.source, 'unknownResearchInput.source');
  if (!sameSource(source, previous.source)) throw new Error('unknownResearchInput source provenance is stale');
  if (unavailable) {
    const availability = objectAt(input.availability, 'unknownResearchInput.availability');
    exactKeys(availability, 'unknownResearchInput.availability', [
      'status', 'reason', 'unavailablePrerequisites',
    ]);
    if (availability.status !== 'unavailable') {
      throw new Error('unknownResearchInput.availability.status must be unavailable');
    }
    text(availability.reason, 'unknownResearchInput.availability.reason');
    stringArray(
      availability.unavailablePrerequisites,
      'unknownResearchInput.availability.unavailablePrerequisites',
    );
    return finish({
      contractVersion: '1.0.0', stage: 'unknown_research', status: 'unavailable',
      source: structuredClone(source), previousStageDigest: previous.stageDigest,
      unknownMappingDigest: previous.previousStageDigest, unknownId: previous.unknownId,
      track: previous.track,
      availability: structuredClone(availability as UnknownResearchUnavailableInput['availability']),
      execution: { mode: 'stage_result_only', writes: [] },
      limitations: [
        'Research prerequisites are explicitly unavailable; no evidence or partial success is fabricated.',
        'Retry only when the declared prerequisite becomes available, using the exact same preparation result.',
        'This result does not create a research file, claim, relationship, thesis update, or Decision Item.',
        'The unchanged stage-4a research entry point remains the rollback-capable persistence path.',
      ],
    });
  }
  isoTimestamp(input.researchedAt, 'unknownResearchInput.researchedAt');
  if (!Array.isArray(input.findings) || input.findings.length < 2 || input.findings.length > 20) {
    throw new Error('unknownResearchInput.findings must contain 2 to 20 source-linked findings');
  }
  const domains = input.findings.map((finding, index) => (
    validateFinding(finding, `unknownResearchInput.findings[${index}]`).hostname.replace(/^www\./, '')
  ));
  const ids = (input.findings as UnknownResearchReadyInput['findings']).map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error('unknownResearchInput.findings contains duplicate IDs');
  const sourceDomains = [...new Set(domains)].sort();
  if (sourceDomains.length < previous.brief.sourceRequirements.minimumIndependentSources) {
    throw new Error('unknownResearchInput requires at least 2 independent source domains');
  }
  validateAssessment(input.assessment, 'unknownResearchInput.assessment');

  return finish({
    contractVersion: '1.0.0',
    stage: 'unknown_research',
    status: 'ready',
    source: structuredClone(source),
    previousStageDigest: previous.stageDigest,
    unknownMappingDigest: previous.previousStageDigest,
    unknownId: previous.unknownId,
    track: previous.track,
    researchedAt: input.researchedAt as string,
    findings: structuredClone(input.findings as UnknownResearchReadyInput['findings']),
    sourceDomains,
    assessment: structuredClone(input.assessment as UnknownResearchReadyInput['assessment']),
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'The result validates supplied research evidence and does not claim an unavailable provider or environment succeeded.',
      'Source URLs and provider analysis do not transfer Notes/Tana capture authority or prove thesis bearing by themselves.',
      'This result does not create a research file, claim, relationship, thesis update, or Decision Item.',
      'The unchanged stage-4a research entry point remains the rollback-capable persistence path.',
    ],
  });
}

function validateTheme(value: unknown, path: string, findingIds: Set<string>): void {
  const theme = objectAt(value, path);
  exactKeys(theme, path, ['title', 'strength', 'findingIds']);
  text(theme.title, `${path}.title`);
  oneOf(theme.strength, `${path}.strength`, ['strong', 'moderate', 'weak']);
  stringArray(theme.findingIds, `${path}.findingIds`);
  if ((theme.findingIds as string[]).some((id) => !findingIds.has(id))) {
    throw new Error(`${path}.findingIds contains an unknown finding`);
  }
}

function validateContradiction(value: unknown, path: string): void {
  const contradiction = objectAt(value, path);
  exactKeys(contradiction, path, ['topic', 'positionA', 'positionB', 'resolution']);
  for (const field of ['topic', 'positionA', 'positionB'] as const) text(contradiction[field], `${path}.${field}`);
  oneOf(contradiction.resolution, `${path}.resolution`, ['resolved', 'unresolved']);
}

function validateUnknownResolution(value: unknown, path: string): void {
  const resolution = objectAt(value, path);
  exactKeys(resolution, path, ['unknownId', 'resolution', 'killCondition', 'convictionCondition', 'rationale']);
  text(resolution.unknownId, `${path}.unknownId`);
  oneOf(resolution.resolution, `${path}.resolution`, ['resolved', 'partial', 'unresolved']);
  oneOf(resolution.killCondition, `${path}.killCondition`, [
    'triggered', 'not_triggered', 'partially_triggered', 'inconclusive',
  ]);
  oneOf(resolution.convictionCondition, `${path}.convictionCondition`, [
    'met', 'not_met', 'partially_met', 'inconclusive',
  ]);
  text(resolution.rationale, `${path}.rationale`);
}

function requiredEvidenceRecommendation(
  synthesis: EvidenceSynthesisInput['synthesis'],
  decisionCriticalUnknownIds: readonly string[],
): EvidenceSynthesisInput['synthesis']['recommendation'] {
  const hasKill = synthesis.posteriorConfidence < 0.5
    || synthesis.coreMechanismSupported === false
    || synthesis.unknownResolutions.some(({ killCondition }) => killCondition === 'triggered');
  if (hasKill) return 'kill';
  const unresolvedCritical = synthesis.unknownResolutions.some(
    ({ unknownId, resolution }) => decisionCriticalUnknownIds.includes(unknownId) && resolution !== 'resolved',
  );
  if (unresolvedCritical || synthesis.posteriorConfidence < 0.65) return 'hold';
  if (synthesis.modifiedThesis !== null) return 'modify';
  return 'advance';
}

export function buildEvidenceSynthesisResult(value: unknown): EvidenceSynthesisResult {
  const input = objectAt(value, 'evidenceSynthesisInput');
  exactKeys(input, 'evidenceSynthesisInput', [
    'source', 'previousStage', 'researchResults', 'priorConfidence', 'synthesis',
  ]);
  const previous = validateResearchPipelineIntakeResult(input.previousStage);
  if (previous.stage !== 'unknown_mapping' || previous.status !== 'ready'
    || previous.gate.decision !== 'advance' || previous.gate.decidedBy !== 'user') {
    throw new Error('evidenceSynthesisInput.previousStage requires a ready user-accepted unknown mapping');
  }
  const source = validateResearchPipelineSource(input.source, 'evidenceSynthesisInput.source');
  if (!sameSource(source, previous.source)) throw new Error('evidenceSynthesisInput source provenance is stale');
  confidence(input.priorConfidence, 'evidenceSynthesisInput.priorConfidence');
  if (!Array.isArray(input.researchResults) || input.researchResults.length === 0
    || input.researchResults.length > MAX_COLLECTION) {
    throw new Error('evidenceSynthesisInput.researchResults must be a bounded non-empty array');
  }
  const researchResults = input.researchResults.map((candidate, index) => {
    const result = validateResearchPipelineResearchResult(candidate);
    if (result.stage !== 'unknown_research' || result.status !== 'ready') {
      throw new Error(`evidenceSynthesisInput.researchResults[${index}] must be ready unknown research`);
    }
    if (!sameSource(source, result.source) || result.unknownMappingDigest !== previous.stageDigest) {
      throw new Error(`evidenceSynthesisInput.researchResults[${index}] provenance or unknown map is stale`);
    }
    return result;
  });
  const researchResultDigests = researchResults.map(({ stageDigest }) => stageDigest).sort();
  if (new Set(researchResultDigests).size !== researchResultDigests.length) {
    throw new Error('evidenceSynthesisInput.researchResults contains duplicate stage results');
  }
  const researchKeys = researchResults.map(({ unknownId, track }) => `${unknownId}:${track}`);
  if (new Set(researchKeys).size !== researchKeys.length) {
    throw new Error('evidenceSynthesisInput.researchResults must contain at most one result per unknown and track');
  }
  const researchedUnknownIds = [...new Set(researchResults.map(({ unknownId }) => unknownId))].sort();
  const expectedUnknownIds = previous.unknowns.map(({ id }) => id).sort();
  if (digestResearchPipelineResearchValue(researchedUnknownIds)
    !== digestResearchPipelineResearchValue(expectedUnknownIds)) {
    throw new Error(
      'evidenceSynthesisInput.researchResults must cover every mapped unknown at least once with no unknown outside the accepted mapping',
    );
  }
  const allFindingIds = researchResults.flatMap(({ findings }) => findings.map(({ id }) => id));
  const findingIds = new Set(allFindingIds);
  if (findingIds.size !== allFindingIds.length) {
    throw new Error('evidenceSynthesisInput.researchResults contains duplicate finding IDs');
  }
  const synthesis = objectAt(input.synthesis, 'evidenceSynthesisInput.synthesis');
  exactKeys(synthesis, 'evidenceSynthesisInput.synthesis', [
    'themes', 'contradictions', 'unknownResolutions', 'evidenceQuality', 'coreMechanismSupported',
    'posteriorConfidence', 'recommendation', 'rationale', 'modifiedThesis',
  ]);
  if (!Array.isArray(synthesis.themes) || synthesis.themes.length === 0 || synthesis.themes.length > 5) {
    throw new Error('evidenceSynthesisInput.synthesis.themes must contain 1 to 5 themes');
  }
  synthesis.themes.forEach((theme, index) => validateTheme(
    theme, `evidenceSynthesisInput.synthesis.themes[${index}]`, findingIds,
  ));
  if (!Array.isArray(synthesis.contradictions) || synthesis.contradictions.length > MAX_COLLECTION) {
    throw new Error('evidenceSynthesisInput.synthesis.contradictions must be bounded');
  }
  synthesis.contradictions.forEach((item, index) => validateContradiction(
    item, `evidenceSynthesisInput.synthesis.contradictions[${index}]`,
  ));
  if (!Array.isArray(synthesis.unknownResolutions)
    || synthesis.unknownResolutions.length !== previous.unknowns.length) {
    throw new Error('evidenceSynthesisInput.synthesis.unknownResolutions must cover every mapped unknown');
  }
  synthesis.unknownResolutions.forEach((item, index) => validateUnknownResolution(
    item, `evidenceSynthesisInput.synthesis.unknownResolutions[${index}]`,
  ));
  const resolutionIds = (synthesis.unknownResolutions as EvidenceSynthesisInput['synthesis']['unknownResolutions'])
    .map(({ unknownId }) => unknownId).sort();
  const expectedIds = expectedUnknownIds;
  if (digestResearchPipelineResearchValue(resolutionIds)
    !== digestResearchPipelineResearchValue(expectedIds)) {
    throw new Error('evidenceSynthesisInput.synthesis.unknownResolutions must cover the exact mapped unknowns');
  }
  oneOf(synthesis.evidenceQuality, 'evidenceSynthesisInput.synthesis.evidenceQuality', ['good', 'adequate', 'poor']);
  if (typeof synthesis.coreMechanismSupported !== 'boolean') {
    throw new Error('evidenceSynthesisInput.synthesis.coreMechanismSupported must be boolean');
  }
  confidence(synthesis.posteriorConfidence, 'evidenceSynthesisInput.synthesis.posteriorConfidence');
  oneOf(synthesis.recommendation, 'evidenceSynthesisInput.synthesis.recommendation', ['advance', 'hold', 'kill', 'modify']);
  text(synthesis.rationale, 'evidenceSynthesisInput.synthesis.rationale');
  if (synthesis.modifiedThesis !== null) text(synthesis.modifiedThesis, 'evidenceSynthesisInput.synthesis.modifiedThesis');
  const decisionCriticalUnknownIds = previous.unknowns
    .filter(({ impact }) => impact === 'high').map(({ id }) => id).sort();
  const requiredRecommendation = requiredEvidenceRecommendation(
    synthesis as unknown as EvidenceSynthesisInput['synthesis'], decisionCriticalUnknownIds,
  );
  if (synthesis.recommendation !== requiredRecommendation) {
    throw new Error(`evidenceSynthesisInput.synthesis.recommendation must be ${requiredRecommendation}`);
  }
  const confidenceChange = Number((Number(synthesis.posteriorConfidence) - Number(input.priorConfidence)).toFixed(6));
  return finish({
    contractVersion: '1.0.0', stage: 'evidence_synthesis', status: 'ready',
    source: structuredClone(source), previousStageDigest: previous.stageDigest,
    researchResultDigests, priorConfidence: input.priorConfidence as number,
    posteriorConfidence: synthesis.posteriorConfidence as number, confidenceChange,
    decisionCriticalUnknownIds,
    synthesis: structuredClone(synthesis as unknown as EvidenceSynthesisInput['synthesis']),
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'The evidence gate is a recommendation-only result and does not record or resolve user judgment.',
      'Contradictions and unresolved unknowns remain explicit; missing research is not represented as completed evidence.',
      'This result does not write stage files, change confidence or thesis status, or create signals or Decision Items.',
      'The unchanged stage-4b synthesis entry point remains the rollback-capable persistence path.',
    ],
  });
}

function validateValueChainItem(value: unknown, path: string): void {
  const item = objectAt(value, path);
  exactKeys(item, path, [
    'layer', 'entity', 'revenueSensitivity', 'marginImpact', 'capitalIntensity', 'timing', 'executionRisk',
  ]);
  oneOf(item.layer, `${path}.layer`, ['upstream', 'direct', 'downstream', 'enabler']);
  text(item.entity, `${path}.entity`);
  oneOf(item.revenueSensitivity, `${path}.revenueSensitivity`, ['high', 'medium', 'low']);
  oneOf(item.marginImpact, `${path}.marginImpact`, ['improve', 'compress', 'neutral']);
  oneOf(item.capitalIntensity, `${path}.capitalIntensity`, ['high', 'medium', 'low']);
  oneOf(item.timing, `${path}.timing`, ['immediate', 'one_to_two_years', 'three_to_five_years']);
  text(item.executionRisk, `${path}.executionRisk`);
}

function validateExpressionCandidate(value: unknown, path: string): void {
  const candidate = objectAt(value, path);
  exactKeys(candidate, path, [
    'id', 'instrument', 'orderOfEffect', 'consensus', 'thesisRightExpressionFailsRisk',
    'entryCriteria', 'profitExitCriteria', 'lossExitCriteria', 'reviewTriggers', 'sizingInputs',
  ]);
  text(candidate.id, `${path}.id`);
  text(candidate.instrument, `${path}.instrument`);
  oneOf(candidate.orderOfEffect, `${path}.orderOfEffect`, ['first', 'second', 'third', 'victim']);
  oneOf(candidate.consensus, `${path}.consensus`, ['crowded', 'moderate', 'underfollowed']);
  text(candidate.thesisRightExpressionFailsRisk, `${path}.thesisRightExpressionFailsRisk`);
  for (const field of ['entryCriteria', 'profitExitCriteria', 'lossExitCriteria', 'reviewTriggers'] as const) {
    stringArray(candidate[field], `${path}.${field}`);
  }
  const sizing = objectAt(candidate.sizingInputs, `${path}.sizingInputs`);
  exactKeys(sizing, `${path}.sizingInputs`, [
    'liquidity', 'volatility', 'portfolioCorrelation', 'maximumAdverseScenario', 'horizonAlignment',
  ]);
  for (const field of [
    'liquidity', 'volatility', 'portfolioCorrelation', 'maximumAdverseScenario', 'horizonAlignment',
  ] as const) text(sizing[field], `${path}.sizingInputs.${field}`);
}

function validateExpressionPayload(value: unknown, path: string): ThesisExpressionInput['expression'] {
  const expression = objectAt(value, path);
  exactKeys(expression, path, [
    'valueChain', 'candidates', 'recommendedAction', 'recommendedExpressionIds', 'rationale',
  ]);
  if (!Array.isArray(expression.valueChain) || expression.valueChain.length === 0
    || expression.valueChain.length > MAX_COLLECTION) {
    throw new Error(`${path}.valueChain must be a bounded non-empty array`);
  }
  expression.valueChain.forEach((item, index) => validateValueChainItem(item, `${path}.valueChain[${index}]`));
  if (!Array.isArray(expression.candidates) || expression.candidates.length > 20) {
    throw new Error(`${path}.candidates must be a bounded array`);
  }
  expression.candidates.forEach((item, index) => validateExpressionCandidate(item, `${path}.candidates[${index}]`));
  const candidateIds = (expression.candidates as ThesisExpressionInput['expression']['candidates']).map(({ id }) => id);
  if (new Set(candidateIds).size !== candidateIds.length) throw new Error(`${path}.candidates contains duplicate IDs`);
  oneOf(expression.recommendedAction, `${path}.recommendedAction`, ['act', 'watch', 'discard']);
  stringArray(expression.recommendedExpressionIds, `${path}.recommendedExpressionIds`, true);
  const recommendedIds = expression.recommendedExpressionIds as string[];
  if (new Set(recommendedIds).size !== recommendedIds.length
    || recommendedIds.some((id) => !candidateIds.includes(id))) {
    throw new Error(`${path}.recommendedExpressionIds must name unique candidate IDs`);
  }
  if (expression.recommendedAction === 'act' && recommendedIds.length === 0) {
    throw new Error(`${path}.recommendedExpressionIds is required when action is act`);
  }
  if (expression.recommendedAction !== 'act' && recommendedIds.length !== 0) {
    throw new Error(`${path}.recommendedExpressionIds must be empty unless action is act`);
  }
  text(expression.rationale, `${path}.rationale`);
  return value as ThesisExpressionInput['expression'];
}

export function buildThesisExpressionResult(value: unknown): ThesisExpressionResult {
  const input = objectAt(value, 'thesisExpressionInput');
  exactKeys(input, 'thesisExpressionInput', ['source', 'previousStage', 'entryDecision', 'expression']);
  const previous = validateResearchPipelineResearchResult(input.previousStage);
  if (previous.stage !== 'evidence_synthesis' || previous.status !== 'ready') {
    throw new Error('thesisExpressionInput.previousStage must be a ready evidence_synthesis result');
  }
  if (!['advance', 'modify'].includes(previous.synthesis.recommendation)) {
    throw new Error('thesisExpressionInput.previousStage must recommend advance or modify');
  }
  const source = validateResearchPipelineSource(input.source, 'thesisExpressionInput.source');
  if (!sameSource(source, previous.source)) throw new Error('thesisExpressionInput source provenance is stale');
  const decision = objectAt(input.entryDecision, 'thesisExpressionInput.entryDecision');
  exactKeys(decision, 'thesisExpressionInput.entryDecision', ['decision', 'decidedBy', 'rationale', 'audit']);
  const expectedDecision = previous.synthesis.recommendation === 'advance' ? 'advance' : 'modify_and_advance';
  if (decision.decision !== expectedDecision) {
    throw new Error(`thesisExpressionInput.entryDecision.decision must be ${expectedDecision}`);
  }
  if (decision.decidedBy !== 'user') throw new Error('thesisExpressionInput.entryDecision.decidedBy must be user');
  text(decision.rationale, 'thesisExpressionInput.entryDecision.rationale');
  validateUserJudgmentAudit(decision.audit, 'thesisExpressionInput.entryDecision.audit');
  const expression = validateExpressionPayload(input.expression, 'thesisExpressionInput.expression');
  return finish({
    contractVersion: '1.0.0', stage: 'thesis_expression', status: 'ready',
    source: structuredClone(source), previousStageDigest: previous.stageDigest,
    entryDecision: structuredClone(decision as unknown as ThesisExpressionInput['entryDecision']),
    expression: structuredClone(expression), execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'Expression candidates and action are analytical recommendations; only the user may decide whether to act, watch, or discard.',
      'Sizing inputs deliberately exclude a position size, quantity, order, or allocation instruction.',
      'This result does not create a thesis, strategy, position, order, trade, status change, signal, or Decision Item.',
      'The unchanged stage-5 expression entry point remains the rollback-capable persistence path.',
    ],
  });
}

function validateFinalGate(value: unknown, path: string): 'ready' | 'judgment_required' {
  const gate = objectAt(value, path);
  exactKeys(gate, path, ['recommendation', 'decision', 'decidedBy', 'rationale', 'audit']);
  oneOf(gate.recommendation, `${path}.recommendation`, ['act', 'watch', 'discard']);
  text(gate.rationale, `${path}.rationale`);
  if (gate.decision === null) {
    if (gate.decidedBy !== null) throw new Error(`${path}.decidedBy must be null while judgment is unresolved`);
    if (gate.audit !== null) throw new Error(`${path}.audit must be null while judgment is unresolved`);
    return 'judgment_required';
  }
  oneOf(gate.decision, `${path}.decision`, ['act', 'watch', 'discard']);
  if (gate.decidedBy !== 'user') throw new Error(`${path}.decidedBy must be user for a resolved gate`);
  validateUserJudgmentAudit(gate.audit, `${path}.audit`);
  return 'ready';
}

export function buildGateDecisionResult(value: unknown): GateDecisionResult {
  const input = objectAt(value, 'gateDecisionInput');
  exactKeys(input, 'gateDecisionInput', ['source', 'previousStage', 'gate']);
  const previous = validateResearchPipelineResearchResult(input.previousStage);
  if (previous.stage !== 'thesis_expression' || previous.status !== 'ready') {
    throw new Error('gateDecisionInput.previousStage must be a ready thesis_expression result');
  }
  const source = validateResearchPipelineSource(input.source, 'gateDecisionInput.source');
  if (!sameSource(source, previous.source)) throw new Error('gateDecisionInput source provenance is stale');
  const status = validateFinalGate(input.gate, 'gateDecisionInput.gate');
  const gate = input.gate as GateDecisionInput['gate'];
  if (gate.recommendation !== previous.expression.recommendedAction) {
    throw new Error('gateDecisionInput.gate.recommendation must match the expression recommendation');
  }
  return finish({
    contractVersion: '1.0.0', stage: 'gate_decision', status,
    source: structuredClone(source), previousStageDigest: previous.stageDigest,
    gate: structuredClone(gate), execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'The provider recommendation is not a decision; only an explicit audited user choice makes this result ready.',
      'The user may override act, watch, or discard when the rationale and audit remain explicit.',
      'This result does not write pipeline state, change thesis status, resolve a Decision Item, or place or stage a trade.',
      'The unchanged advance-or-kill entry point remains the rollback-capable persistence path.',
    ],
  });
}

function validateThesisCandidate(value: unknown, path: string): void {
  const thesis = objectAt(value, path);
  exactKeys(thesis, path, [
    'kind', 'title', 'direction', 'thesisType', 'underlyingTicker', 'initialLifecycle',
  ]);
  oneOf(thesis.kind, `${path}.kind`, ['macro', 'asset']);
  text(thesis.title, `${path}.title`);
  oneOf(thesis.direction, `${path}.direction`, ['bullish', 'bearish', 'neutral']);
  if (thesis.kind === 'macro') {
    oneOf(thesis.thesisType, `${path}.thesisType`, ['secular', 'cyclical', 'structural']);
    if (thesis.underlyingTicker !== null) throw new Error(`${path}.underlyingTicker must be null for a macro thesis`);
  } else {
    if (thesis.thesisType !== null) throw new Error(`${path}.thesisType must be null for an asset thesis`);
    text(thesis.underlyingTicker, `${path}.underlyingTicker`);
  }
  if (thesis.initialLifecycle !== 'developing') {
    throw new Error(`${path}.initialLifecycle must be developing; monitoring is expression-cascade derived`);
  }
}

function validateGraduationHandoff(
  value: unknown,
  path: string,
  source: ResearchPipelineSource,
  finalDecision: 'act' | 'watch' | 'discard',
  expectedExistingMainClaimId?: string | null,
): GraduationInput['handoff'] {
  const handoff = objectAt(value, path);
  exactKeys(handoff, path, [
    'disposition', 'thesisCandidate', 'provenanceClaims', 'articulation', 'dependencyStates',
  ]);
  oneOf(handoff.disposition, `${path}.disposition`, ['prepare_thesis_handoff', 'no_graduation']);
  if (finalDecision === 'discard') {
    if (handoff.disposition !== 'no_graduation' || handoff.thesisCandidate !== null) {
      throw new Error(`${path} must use no_graduation with no thesis candidate after discard`);
    }
  } else {
    if (handoff.disposition !== 'prepare_thesis_handoff' || handoff.thesisCandidate === null) {
      throw new Error(`${path} must prepare a thesis handoff after act or watch`);
    }
    validateThesisCandidate(handoff.thesisCandidate, `${path}.thesisCandidate`);
  }
  if (!Array.isArray(handoff.provenanceClaims) || handoff.provenanceClaims.length > MAX_COLLECTION
    || (finalDecision !== 'discard' && handoff.provenanceClaims.length === 0)) {
    throw new Error(`${path}.provenanceClaims must be bounded and non-empty for a thesis handoff`);
  }
  const claimKeys = handoff.provenanceClaims.map((candidate, index) => {
    const claim = objectAt(candidate, `${path}.provenanceClaims[${index}]`);
    exactKeys(claim, `${path}.provenanceClaims[${index}]`, [
      'sourceInsightId', 'sourceClaimId', 'existingMainClaimId',
    ]);
    if (claim.sourceInsightId !== source.insightId) {
      throw new Error(`${path}.provenanceClaims[${index}].sourceInsightId is stale`);
    }
    text(claim.sourceClaimId, `${path}.provenanceClaims[${index}].sourceClaimId`);
    if (claim.sourceClaimId !== source.claimId) {
      throw new Error(`${path}.provenanceClaims[${index}] must preserve the exact source claim`);
    }
    if (expectedExistingMainClaimId !== undefined
      && claim.existingMainClaimId !== expectedExistingMainClaimId) {
      throw new Error(`${path}.provenanceClaims[${index}] does not match the verified claim mapping`);
    }
    if (claim.existingMainClaimId !== null
      && (typeof claim.existingMainClaimId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claim.existingMainClaimId))) {
      throw new Error(`${path}.provenanceClaims[${index}].existingMainClaimId must be null or a UUID`);
    }
    return `${claim.sourceInsightId}:${claim.sourceClaimId}`;
  });
  if (new Set(claimKeys).size !== claimKeys.length) throw new Error(`${path} contains duplicate provenance claims`);
  const articulation = objectAt(handoff.articulation, `${path}.articulation`);
  exactKeys(articulation, `${path}.articulation`, ['required', 'deriveResolutionFromRebuttals']);
  if (articulation.required !== true || articulation.deriveResolutionFromRebuttals !== true) {
    throw new Error(`${path}.articulation must preserve underwriting and rebuttal-derived resolution`);
  }
  if (!Array.isArray(handoff.dependencyStates)
    || handoff.dependencyStates.length !== GRADUATION_DEPENDENCIES.length) {
    throw new Error(`${path}.dependencyStates must cover every governed dependency`);
  }
  const dependencyIds = handoff.dependencyStates.map((candidate, index) => {
    const dependency = objectAt(candidate, `${path}.dependencyStates[${index}]`);
    exactKeys(dependency, `${path}.dependencyStates[${index}]`, ['capabilityId', 'state']);
    oneOf(dependency.capabilityId, `${path}.dependencyStates[${index}].capabilityId`, GRADUATION_DEPENDENCIES);
    oneOf(dependency.state, `${path}.dependencyStates[${index}].state`, ['registry_locked', 'unavailable']);
    if (dependency.state === 'unavailable') {
      throw new Error(`${path} dependency ${String(dependency.capabilityId)} is unavailable`);
    }
    return dependency.capabilityId as string;
  });
  if (new Set(dependencyIds).size !== dependencyIds.length
    || GRADUATION_DEPENDENCIES.some((id) => !dependencyIds.includes(id))) {
    throw new Error(`${path}.dependencyStates must cover each exact dependency once`);
  }
  return value as GraduationInput['handoff'];
}

export function buildGraduationResult(value: unknown): GraduationResult {
  const input = objectAt(value, 'graduationInput');
  exactKeys(input, 'graduationInput', [
    'source', 'previousStage', 'claimsSynthesis', 'acceptance', 'handoff',
  ]);
  const previous = validateResearchPipelineResearchResult(input.previousStage);
  if (previous.stage !== 'gate_decision' || previous.status !== 'ready'
    || previous.gate.decision === null || previous.gate.decidedBy !== 'user') {
    throw new Error('graduationInput.previousStage requires a ready audited user gate decision');
  }
  const source = validateResearchPipelineSource(input.source, 'graduationInput.source');
  if (!sameSource(source, previous.source)) throw new Error('graduationInput source provenance is stale');
  let claimsSynthesisBinding: GraduationResult['claimsSynthesisBinding'] = null;
  let expectedExistingMainClaimId: string | null | undefined;
  if (previous.gate.decision === 'discard') {
    if (input.claimsSynthesis !== null) {
      throw new Error('graduationInput.claimsSynthesis must be null after discard');
    }
  } else {
    const claimsInput = objectAt(input.claimsSynthesis, 'graduationInput.claimsSynthesis');
    exactKeys(claimsInput, 'graduationInput.claimsSynthesis', ['context', 'result']);
    const context = claimsInput.context as ClaimsSynthesisContext;
    const claimsResult = validateClaimsSynthesisResult(context, claimsInput.result);
    if (context.source.insightId !== source.insightId
      || context.source.contentSha256 !== source.contentSha256
      || !context.sourceEvidence.some(({ sourceClaimId }) => sourceClaimId === source.claimId)) {
      throw new Error('graduationInput.claimsSynthesis source provenance is stale');
    }
    const existing = claimsResult.existingMainClaims.find(
      ({ sourceClaimId }) => sourceClaimId === source.claimId,
    );
    const synthesized = claimsResult.synthesizedInvestmentClaims.find(
      ({ sourceClaimId }) => sourceClaimId === source.claimId,
    );
    if ((existing ? 1 : 0) + (synthesized ? 1 : 0) !== 1) {
      throw new Error('graduationInput.claimsSynthesis must resolve the exact source claim once');
    }
    expectedExistingMainClaimId = existing?.mainClaimId ?? null;
    claimsSynthesisBinding = {
      sourceClaimId: source.claimId,
      existingMainClaimId: expectedExistingMainClaimId,
      contextDigest: digestClaimsSynthesisContext(context),
      resultDigest: digestResearchPipelineResearchValue(claimsResult),
    };
  }
  const handoff = validateGraduationHandoff(
    input.handoff, 'graduationInput.handoff', source, previous.gate.decision,
    expectedExistingMainClaimId,
  );
  const acceptanceBoundaryDigest = digestResearchPipelineResearchValue({
    source, previousStageDigest: previous.stageDigest, claimsSynthesisBinding, handoff,
  });
  const acceptance = objectAt(input.acceptance, 'graduationInput.acceptance');
  exactKeys(acceptance, 'graduationInput.acceptance', [
    'decision', 'decidedBy', 'rationale', 'audit',
  ]);
  text(acceptance.rationale, 'graduationInput.acceptance.rationale');
  let status: GraduationResult['status'];
  if (acceptance.decision === null) {
    if (acceptance.decidedBy !== null || acceptance.audit !== null) {
      throw new Error('graduationInput.acceptance pending judgment cannot include an actor or audit');
    }
    status = 'judgment_required';
  } else {
    oneOf(acceptance.decision, 'graduationInput.acceptance.decision', ['accept', 'decline']);
    if (acceptance.decidedBy !== 'user') {
      throw new Error('graduationInput.acceptance.decidedBy must be user');
    }
    const audit = objectAt(acceptance.audit, 'graduationInput.acceptance.audit');
    exactKeys(audit, 'graduationInput.acceptance.audit', [
      'decisionId', 'actorId', 'recordedAt', 'boundaryDigest',
    ]);
    validateUserJudgmentAudit({
      decisionId: audit.decisionId, actorId: audit.actorId, recordedAt: audit.recordedAt,
    }, 'graduationInput.acceptance.audit');
    if (audit.boundaryDigest !== acceptanceBoundaryDigest) {
      throw new Error('graduationInput.acceptance.audit.boundaryDigest is stale');
    }
    status = acceptance.decision === 'accept' ? 'ready' : 'refused';
  }
  return finish({
    contractVersion: '1.0.0', stage: 'graduation', status,
    source: structuredClone(source), previousStageDigest: previous.stageDigest,
    finalDecision: previous.gate.decision, claimsSynthesisBinding,
    acceptanceBoundaryDigest,
    acceptance: structuredClone(acceptance as unknown as GraduationInput['acceptance']),
    handoff: structuredClone(handoff),
    execution: { mode: 'stage_result_only', writes: [] },
    limitations: [
      'Graduation is a provenance-bound handoff plan only; legacy persistence remains separately user-invoked and rollback-capable.',
      'Exact provenance-bearing claims must be reused through their governed publication and relation capabilities.',
      'Underwriting derives resolution from rebuttals; it does not configure signals or promote lifecycle status.',
      'This result has no thesis, status, Decision Item, strategy, position, order, trade, database, scheduler, or credential authority.',
    ],
  });
}

function validateCommon(result: Record<string, unknown>): void {
  if (result.contractVersion !== '1.0.0') throw new Error('result.contractVersion must be 1.0.0');
  validateResearchPipelineSource(result.source, 'result.source');
  const execution = objectAt(result.execution, 'result.execution');
  exactKeys(execution, 'result.execution', ['mode', 'writes']);
  if (execution.mode !== 'stage_result_only') throw new Error('result.execution.mode must be stage_result_only');
  if (!Array.isArray(execution.writes) || execution.writes.length !== 0) {
    throw new Error('result.execution writes must be empty');
  }
  stringArray(result.limitations, 'result.limitations');
  if ((result.limitations as string[]).length > 8) throw new Error('result.limitations must be bounded');
  const { stageDigest: _ignored, ...digestInput } = result;
  void _ignored;
  if (typeof result.stageDigest !== 'string' || !DIGEST_PATTERN.test(result.stageDigest)
    || result.stageDigest !== digestResearchPipelineResearchValue(digestInput)) {
    throw new Error('result.stageDigest does not match the canonical stage result');
  }
}

export function validateResearchPipelineResearchResult(value: unknown): ResearchPipelineResearchResult {
  const result = objectAt(value, 'result');
  if (result.stage === 'research_preparation') {
    exactKeys(result, 'result', [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'thesisFormalizationDigest',
      'previousStageDigest', 'unknownId', 'track', 'delivery', 'brief', 'execution', 'limitations',
    ]);
    if (result.status !== 'ready') throw new Error('research_preparation result.status must be ready');
    if (![result.thesisFormalizationDigest, result.previousStageDigest].every(
      (item) => typeof item === 'string' && DIGEST_PATTERN.test(item),
    )) throw new Error('research_preparation result stage bindings must be sha256 digests');
    text(result.unknownId, 'result.unknownId');
    oneOf(result.track, 'result.track', ['falsification', 'validation', 'analogues']);
    if (result.delivery !== 'portable_research_brief') throw new Error('result.delivery is unsupported');
    const brief = objectAt(result.brief, 'result.brief');
    exactKeys(brief, 'result.brief', [
      'thesis', 'question', 'decisionImpact', 'killCondition', 'convictionIncreaseCondition',
      'researchQueries', 'recommendedSources', 'ambiguities', 'sourceRequirements',
    ]);
    for (const field of ['thesis', 'question', 'killCondition', 'convictionIncreaseCondition'] as const) {
      text(brief[field], `result.brief.${field}`);
    }
    oneOf(brief.decisionImpact, 'result.brief.decisionImpact', ['high', 'medium', 'low']);
    stringArray(brief.researchQueries, 'result.brief.researchQueries');
    stringArray(brief.recommendedSources, 'result.brief.recommendedSources');
    stringArray(brief.ambiguities, 'result.brief.ambiguities', true);
    const requirements = objectAt(brief.sourceRequirements, 'result.brief.sourceRequirements');
    exactKeys(requirements, 'result.brief.sourceRequirements', [
      'inlineUrlsRequired', 'minimumIndependentSources', 'primarySourcesPreferred',
    ]);
    if (requirements.inlineUrlsRequired !== true || requirements.minimumIndependentSources !== 2
      || requirements.primarySourcesPreferred !== true) {
      throw new Error('result.brief.sourceRequirements must preserve the portable evidence contract');
    }
  } else if (result.stage === 'unknown_research') {
    const unavailable = result.status === 'unavailable';
    exactKeys(result, 'result', unavailable ? [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'previousStageDigest',
      'unknownMappingDigest', 'unknownId', 'track', 'availability', 'execution', 'limitations',
    ] : [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'previousStageDigest',
      'unknownMappingDigest', 'unknownId', 'track', 'researchedAt', 'findings', 'sourceDomains', 'assessment',
      'execution', 'limitations',
    ]);
    if (result.status !== 'ready' && result.status !== 'unavailable') {
      throw new Error('unknown_research result.status must be ready or unavailable');
    }
    if (![result.previousStageDigest, result.unknownMappingDigest].every(
      (item) => typeof item === 'string' && DIGEST_PATTERN.test(item),
    )) throw new Error('unknown_research result stage bindings must be sha256 digests');
    text(result.unknownId, 'result.unknownId');
    oneOf(result.track, 'result.track', ['falsification', 'validation', 'analogues']);
    if (unavailable) {
      const availability = objectAt(result.availability, 'result.availability');
      exactKeys(availability, 'result.availability', ['status', 'reason', 'unavailablePrerequisites']);
      if (availability.status !== 'unavailable') throw new Error('result.availability.status must be unavailable');
      text(availability.reason, 'result.availability.reason');
      stringArray(availability.unavailablePrerequisites, 'result.availability.unavailablePrerequisites');
      validateCommon(result);
      return value as UnknownResearchUnavailableResult;
    }
    isoTimestamp(result.researchedAt, 'result.researchedAt');
    if (!Array.isArray(result.findings) || result.findings.length < 2 || result.findings.length > 20) {
      throw new Error('result.findings must contain 2 to 20 findings');
    }
    const domains = result.findings.map((finding, index) => (
      validateFinding(finding, `result.findings[${index}]`).hostname.replace(/^www\./, '')
    ));
    const findingIds = (result.findings as UnknownResearchReadyInput['findings']).map(({ id }) => id);
    if (new Set(findingIds).size !== findingIds.length) throw new Error('result.findings contains duplicate IDs');
    const expectedDomains = [...new Set(domains)].sort();
    if (expectedDomains.length < 2
      || digestResearchPipelineResearchValue(result.sourceDomains)
        !== digestResearchPipelineResearchValue(expectedDomains)) {
      throw new Error('result.sourceDomains must contain at least 2 exact independent source domains');
    }
    validateAssessment(result.assessment, 'result.assessment');
  } else if (result.stage === 'evidence_synthesis') {
    exactKeys(result, 'result', [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'previousStageDigest',
      'researchResultDigests', 'priorConfidence', 'posteriorConfidence', 'confidenceChange',
      'decisionCriticalUnknownIds', 'synthesis', 'execution', 'limitations',
    ]);
    if (result.status !== 'ready') throw new Error('evidence_synthesis result.status must be ready');
    if (typeof result.previousStageDigest !== 'string' || !DIGEST_PATTERN.test(result.previousStageDigest)) {
      throw new Error('evidence_synthesis result.previousStageDigest must be a sha256 digest');
    }
    stringArray(result.researchResultDigests, 'result.researchResultDigests');
    if (!(result.researchResultDigests as string[]).every((item) => DIGEST_PATTERN.test(item))
      || new Set(result.researchResultDigests as string[]).size !== (result.researchResultDigests as string[]).length) {
      throw new Error('result.researchResultDigests must contain unique sha256 digests');
    }
    confidence(result.priorConfidence, 'result.priorConfidence');
    confidence(result.posteriorConfidence, 'result.posteriorConfidence');
    if (result.confidenceChange !== Number((Number(result.posteriorConfidence) - Number(result.priorConfidence)).toFixed(6))) {
      throw new Error('result.confidenceChange must match prior and posterior confidence');
    }
    stringArray(result.decisionCriticalUnknownIds, 'result.decisionCriticalUnknownIds');
    if (new Set(result.decisionCriticalUnknownIds as string[]).size
      !== (result.decisionCriticalUnknownIds as string[]).length) {
      throw new Error('result.decisionCriticalUnknownIds must be unique');
    }
    const synthesis = objectAt(result.synthesis, 'result.synthesis');
    exactKeys(synthesis, 'result.synthesis', [
      'themes', 'contradictions', 'unknownResolutions', 'evidenceQuality', 'coreMechanismSupported',
      'posteriorConfidence', 'recommendation', 'rationale', 'modifiedThesis',
    ]);
    if (!Array.isArray(synthesis.themes) || synthesis.themes.length === 0 || synthesis.themes.length > 5) {
      throw new Error('result.synthesis.themes must contain 1 to 5 themes');
    }
    synthesis.themes.forEach((theme, index) => {
      const item = objectAt(theme, `result.synthesis.themes[${index}]`);
      exactKeys(item, `result.synthesis.themes[${index}]`, ['title', 'strength', 'findingIds']);
      text(item.title, `result.synthesis.themes[${index}].title`);
      oneOf(item.strength, `result.synthesis.themes[${index}].strength`, ['strong', 'moderate', 'weak']);
      stringArray(item.findingIds, `result.synthesis.themes[${index}].findingIds`);
    });
    if (!Array.isArray(synthesis.contradictions) || synthesis.contradictions.length > MAX_COLLECTION) {
      throw new Error('result.synthesis.contradictions must be bounded');
    }
    synthesis.contradictions.forEach((item, index) => validateContradiction(
      item, `result.synthesis.contradictions[${index}]`,
    ));
    if (!Array.isArray(synthesis.unknownResolutions) || synthesis.unknownResolutions.length === 0
      || synthesis.unknownResolutions.length > MAX_COLLECTION) {
      throw new Error('result.synthesis.unknownResolutions must be bounded and non-empty');
    }
    synthesis.unknownResolutions.forEach((item, index) => validateUnknownResolution(
      item, `result.synthesis.unknownResolutions[${index}]`,
    ));
    const resolutionIds = (synthesis.unknownResolutions as EvidenceSynthesisInput['synthesis']['unknownResolutions'])
      .map(({ unknownId }) => unknownId);
    if (new Set(resolutionIds).size !== resolutionIds.length) {
      throw new Error('result.synthesis.unknownResolutions must contain unique unknown IDs');
    }
    if ((result.decisionCriticalUnknownIds as string[]).some((id) => !resolutionIds.includes(id))) {
      throw new Error('result.decisionCriticalUnknownIds must refer to synthesized unknowns');
    }
    oneOf(synthesis.evidenceQuality, 'result.synthesis.evidenceQuality', ['good', 'adequate', 'poor']);
    if (typeof synthesis.coreMechanismSupported !== 'boolean') {
      throw new Error('result.synthesis.coreMechanismSupported must be boolean');
    }
    confidence(synthesis.posteriorConfidence, 'result.synthesis.posteriorConfidence');
    if (synthesis.posteriorConfidence !== result.posteriorConfidence) {
      throw new Error('result.synthesis.posteriorConfidence must match result.posteriorConfidence');
    }
    oneOf(synthesis.recommendation, 'result.synthesis.recommendation', ['advance', 'hold', 'kill', 'modify']);
    text(synthesis.rationale, 'result.synthesis.rationale');
    if (synthesis.modifiedThesis !== null) text(synthesis.modifiedThesis, 'result.synthesis.modifiedThesis');
    const required = requiredEvidenceRecommendation(
      synthesis as unknown as EvidenceSynthesisInput['synthesis'],
      result.decisionCriticalUnknownIds as string[],
    );
    if (synthesis.recommendation !== required) {
      throw new Error(`result.synthesis.recommendation must be ${required}`);
    }
  } else if (result.stage === 'thesis_expression') {
    exactKeys(result, 'result', [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'previousStageDigest',
      'entryDecision', 'expression', 'execution', 'limitations',
    ]);
    if (result.status !== 'ready') throw new Error('thesis_expression result.status must be ready');
    if (typeof result.previousStageDigest !== 'string' || !DIGEST_PATTERN.test(result.previousStageDigest)) {
      throw new Error('thesis_expression result.previousStageDigest must be a sha256 digest');
    }
    const decision = objectAt(result.entryDecision, 'result.entryDecision');
    exactKeys(decision, 'result.entryDecision', ['decision', 'decidedBy', 'rationale', 'audit']);
    oneOf(decision.decision, 'result.entryDecision.decision', ['advance', 'modify_and_advance']);
    if (decision.decidedBy !== 'user') throw new Error('result.entryDecision.decidedBy must be user');
    text(decision.rationale, 'result.entryDecision.rationale');
    validateUserJudgmentAudit(decision.audit, 'result.entryDecision.audit');
    validateExpressionPayload(result.expression, 'result.expression');
  } else if (result.stage === 'gate_decision') {
    exactKeys(result, 'result', [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'previousStageDigest',
      'gate', 'execution', 'limitations',
    ]);
    if (typeof result.previousStageDigest !== 'string' || !DIGEST_PATTERN.test(result.previousStageDigest)) {
      throw new Error('gate_decision result.previousStageDigest must be a sha256 digest');
    }
    const status = validateFinalGate(result.gate, 'result.gate');
    if (result.status !== status) throw new Error('gate_decision result.status does not match its user judgment');
  } else if (result.stage === 'graduation') {
    exactKeys(result, 'result', [
      'contractVersion', 'stage', 'status', 'stageDigest', 'source', 'previousStageDigest',
      'finalDecision', 'claimsSynthesisBinding', 'acceptanceBoundaryDigest', 'acceptance',
      'handoff', 'execution', 'limitations',
    ]);
    oneOf(result.status, 'result.status', ['ready', 'judgment_required', 'refused']);
    if (typeof result.previousStageDigest !== 'string' || !DIGEST_PATTERN.test(result.previousStageDigest)) {
      throw new Error('graduation result.previousStageDigest must be a sha256 digest');
    }
    oneOf(result.finalDecision, 'result.finalDecision', ['act', 'watch', 'discard']);
    let expectedExistingMainClaimId: string | null | undefined;
    if (result.finalDecision === 'discard') {
      if (result.claimsSynthesisBinding !== null) {
        throw new Error('result.claimsSynthesisBinding must be null after discard');
      }
    } else {
      const binding = objectAt(result.claimsSynthesisBinding, 'result.claimsSynthesisBinding');
      exactKeys(binding, 'result.claimsSynthesisBinding', [
        'sourceClaimId', 'existingMainClaimId', 'contextDigest', 'resultDigest',
      ]);
      text(binding.sourceClaimId, 'result.claimsSynthesisBinding.sourceClaimId');
      if ((result.source as ResearchPipelineSource).claimId !== binding.sourceClaimId) {
        throw new Error('result.claimsSynthesisBinding must preserve the exact source claim');
      }
      if (![binding.contextDigest, binding.resultDigest].every(
        (item) => typeof item === 'string' && DIGEST_PATTERN.test(item),
      )) throw new Error('result.claimsSynthesisBinding digests must be sha256 values');
      if (binding.existingMainClaimId !== null
        && (typeof binding.existingMainClaimId !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(binding.existingMainClaimId))) {
        throw new Error('result.claimsSynthesisBinding.existingMainClaimId must be null or a UUID');
      }
      expectedExistingMainClaimId = binding.existingMainClaimId as string | null;
    }
    validateGraduationHandoff(
      result.handoff, 'result.handoff', result.source as ResearchPipelineSource,
      result.finalDecision as 'act' | 'watch' | 'discard',
      expectedExistingMainClaimId,
    );
    const expectedBoundaryDigest = digestResearchPipelineResearchValue({
      source: result.source,
      previousStageDigest: result.previousStageDigest,
      claimsSynthesisBinding: result.claimsSynthesisBinding,
      handoff: result.handoff,
    });
    if (result.acceptanceBoundaryDigest !== expectedBoundaryDigest) {
      throw new Error('result.acceptanceBoundaryDigest is stale');
    }
    const acceptance = objectAt(result.acceptance, 'result.acceptance');
    exactKeys(acceptance, 'result.acceptance', ['decision', 'decidedBy', 'rationale', 'audit']);
    text(acceptance.rationale, 'result.acceptance.rationale');
    let expectedStatus: GraduationResult['status'];
    if (acceptance.decision === null) {
      if (acceptance.decidedBy !== null || acceptance.audit !== null) {
        throw new Error('result.acceptance pending judgment cannot include an actor or audit');
      }
      expectedStatus = 'judgment_required';
    } else {
      oneOf(acceptance.decision, 'result.acceptance.decision', ['accept', 'decline']);
      if (acceptance.decidedBy !== 'user') throw new Error('result.acceptance.decidedBy must be user');
      const audit = objectAt(acceptance.audit, 'result.acceptance.audit');
      exactKeys(audit, 'result.acceptance.audit', ['decisionId', 'actorId', 'recordedAt', 'boundaryDigest']);
      validateUserJudgmentAudit({
        decisionId: audit.decisionId, actorId: audit.actorId, recordedAt: audit.recordedAt,
      }, 'result.acceptance.audit');
      if (audit.boundaryDigest !== expectedBoundaryDigest) {
        throw new Error('result.acceptance.audit.boundaryDigest is stale');
      }
      expectedStatus = acceptance.decision === 'accept' ? 'ready' : 'refused';
    }
    if (result.status !== expectedStatus) throw new Error('graduation result.status does not match acceptance');
  } else {
    throw new Error('result.stage is unsupported');
  }
  validateCommon(result);
  return value as ResearchPipelineResearchResult;
}
