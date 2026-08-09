import { createHash } from 'node:crypto';

export interface BeliefResearchRelationSourceClaim {
  sourceClaimId: string;
  title: string;
  category: 'macro' | 'asset_specific';
  claim: string;
  evidence: string[];
  reasoning: string | null;
  backing: string | null;
  qualifier: string | null;
  rebuttal: string[];
  timeHorizon: string | null;
  relevantTickers: string[];
}

export interface BeliefResearchRelationSource {
  authority: 'scope:notes';
  artifactId: string;
  insightId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  contentSha256: string;
  observedAt: string | null;
  claims: BeliefResearchRelationSourceClaim[];
}

export interface BeliefResearchRelationMainClaim {
  id: string;
  title: string;
  category: 'macro' | 'asset_specific';
  claim: string;
  status: string;
  sourceInsightId: string | null;
  sourceClaimId: string | null;
}

export interface BeliefResearchRelationThesis {
  id: string;
  type: 'macro' | 'asset';
  title: string;
  description: string | null;
  direction: string | null;
  status: 'developing' | 'monitoring';
  ticker: string | null;
  argument: {
    source: 'latest_articulation' | 'description';
    coreArgument: string;
    keyDrivers: string[];
    keyAssumptions: string[];
  };
}

export interface BeliefResearchRelationRepositorySnapshot {
  existingMainClaims: BeliefResearchRelationMainClaim[];
  theses: BeliefResearchRelationThesis[];
  existingRelationships: Array<{
    claimId: string;
    thesisId: string;
    thesisType: 'macro' | 'asset';
    relationship: 'supports' | 'refutes' | 'foundation';
  }>;
}

export interface BeliefResearchRelationContext {
  contractVersion: '1.0.0';
  source: Omit<BeliefResearchRelationSource, 'claims'>;
  sourceEvidence: BeliefResearchRelationSourceClaim[];
  mainClaimCatalog: BeliefResearchRelationMainClaim[];
  claimResolutions: Array<{
    sourceClaimId: string;
    disposition: 'reuse_exact_provenance' | 'publication_required';
    mainClaimId: string | null;
  }>;
  thesisTargets: Array<BeliefResearchRelationThesis & {
    argument: BeliefResearchRelationThesis['argument'] & { digest: string };
  }>;
  existingRelationships: BeliefResearchRelationRepositorySnapshot['existingRelationships'];
}

export interface BeliefResearchRelationReadyResult {
  contractVersion: '1.0.0';
  contextDigest: string;
  status: 'ready';
  sourceEvidence: Array<{ insightId: string; sourceClaimId: string }>;
  relations: Array<{
    relationId: string;
    sourceClaimId: string;
    mainClaimRef: string;
    claimDisposition: 'reuse_exact_provenance' | 'publication_required';
    thesisId: string;
    thesisType: 'macro' | 'asset';
    relationship: 'supports' | 'refutes' | 'foundation';
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
    bearingProof: {
      kind: 'direct_semantic_bearing';
      claimAnchor: string;
      thesisAnchor: string;
      connection: string;
    };
  }>;
  ambiguities: Array<{
    sourceClaimId: string;
    axis: 'claim_identity' | 'thesis_bearing';
    candidateMainClaimIds: string[];
    candidateThesisIds: string[];
    reason: string;
  }>;
  deferred: Array<{
    sourceClaimId: string;
    reason: 'claim_publication_required';
    detail: string;
  }>;
  unrelated: Array<{ sourceClaimId: string; rationale: string }>;
  execution: { mode: 'recommendation_only'; writes: [] };
  limitations: string[];
}

export type BeliefResearchRelationUnavailableReason =
  | 'database_unavailable'
  | 'source_unavailable'
  | 'environment_unavailable'
  | 'stale_input'
  | 'authority_ambiguous';

export interface BeliefResearchRelationUnavailableResult {
  contractVersion: '1.0.0';
  status: 'unavailable';
  reason: BeliefResearchRelationUnavailableReason;
  detail: string;
  execution: { mode: 'recommendation_only'; writes: [] };
}

export const BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT =
  'I explicitly authorize only the named existing-claim thesis relationships and Decision Items through the governed Trade Journal belief-research relation recorder.';

export interface PreparedBeliefResearchRelationRecording {
  contractVersion: '1.0.0';
  status: 'authorization_required';
  recordingDigest: string;
  contextDigest: string;
  resultDigest: string;
  result: BeliefResearchRelationReadyResult;
  source: BeliefResearchRelationContext['source'];
  relationCandidates: Array<BeliefResearchRelationReadyResult['relations'][number] & {
    mainClaimId: string;
  }>;
  decisionCandidates: Array<{
    decisionId: string;
    sourceClaimId: string;
    objectType: 'claim';
    objectId: string;
    actionType: 'confirm_claim_link';
    axis: 'claim_identity' | 'thesis_bearing';
    candidateMainClaimIds: string[];
    candidateThesisIds: string[];
    candidateTheses: Array<{ id: string; type: 'macro' | 'asset' }>;
    reason: string;
  }>;
  exclusions: Array<{
    sourceClaimId: string;
    reason: 'claim_publication_required' | 'no_existing_claim_anchor';
    detail: string;
  }>;
  authorization: {
    required: true;
    authorizedBy: 'user_only';
    maximumValidityHours: 24;
    statement: typeof BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT;
  };
  permittedWriteSurface: {
    tables: ['claim_thesis_mappings', 'journal_entries'];
    claimThesisMappings: [
      'main_claim_id', 'macro_thesis_id', 'asset_thesis_id', 'mapping_type',
      'confidence', 'mapped_by', 'notes',
    ];
    journalEntries: [
      'timestamp', 'object_type', 'object_id', 'object_title', 'action_type',
      'action_description', 'skill_invoked', 'new_state', 'rationale', 'source',
      'metadata', 'batch_id', 'first_detected_at', 'last_seen_at',
      'occurrence_count', 'status',
    ];
  };
  forbiddenAuthority: [
    'main_claims', 'thesis_status', 'decision_resolution', 'strategies',
    'positions', 'trades', 'ad_hoc_sql', 'supabase_mcp_writes',
    'direct_api_mutation', 'generic_writes',
  ];
  execution: { mode: 'authorization_required'; writes: [] };
}

export interface BeliefResearchRelationRecordingAuthorization {
  contractVersion: '1.0.0';
  type: 'belief_research_relation_authorization';
  authorizationId: string;
  authorizedBy: 'user';
  authorizedAt: string;
  expiresAt: string;
  recordingDigest: string;
  acceptedRelationIds: string[];
  acceptedDecisionIds: string[];
  statement: typeof BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT;
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

export function digestBeliefResearchRelationContext(context: BeliefResearchRelationContext): string {
  return digest(context);
}

export function digestBeliefResearchRelationResult(result: BeliefResearchRelationReadyResult): string {
  return digest(result);
}

export function digestBeliefResearchRelationRecording(
  recording: Omit<PreparedBeliefResearchRelationRecording, 'recordingDigest'>,
): string {
  return digest(recording);
}

export function digestBeliefResearchRelationAuthorization(
  authorization: BeliefResearchRelationRecordingAuthorization,
): string {
  return digest(authorization);
}

export function digestBeliefResearchRelationAuditSnapshot(value: unknown): string {
  return digest(value);
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${path} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return nonEmptyString(value, path);
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    fail(`${path} must be a string array`);
  }
  return [...value];
}

function uuid(value: unknown, path: string): string {
  const result = nonEmptyString(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    fail(`${path} must be a UUID`);
  }
  return result;
}

function validateSource(source: BeliefResearchRelationSource): BeliefResearchRelationSource {
  if (source.authority !== 'scope:notes') fail('Source must carry Notes/Tana authority');
  uuid(source.artifactId, 'source.artifactId');
  uuid(source.insightId, 'source.insightId');
  nonEmptyString(source.title, 'source.title');
  nonEmptyString(source.sourceType, 'source.sourceType');
  nullableString(source.sourceUrl, 'source.sourceUrl');
  nullableString(source.observedAt, 'source.observedAt');
  if (!/^sha256:[0-9a-f]{64}$/i.test(source.contentSha256)) {
    fail('source.contentSha256 must be a SHA-256 digest');
  }
  if (!Array.isArray(source.claims) || source.claims.length === 0) {
    fail('source.claims must contain at least one claim');
  }
  if (source.claims.length > 25) fail('source.claims must contain at most 25 claims');
  const ids = new Set<string>();
  for (const [index, claim] of source.claims.entries()) {
    const path = `source.claims[${index}]`;
    const sourceClaimId = nonEmptyString(claim.sourceClaimId, `${path}.sourceClaimId`);
    if (ids.has(sourceClaimId)) fail('source.claims.sourceClaimId must be unique');
    ids.add(sourceClaimId);
    nonEmptyString(claim.title, `${path}.title`);
    if (claim.category !== 'macro' && claim.category !== 'asset_specific') {
      fail(`${path}.category must be macro or asset_specific`);
    }
    nonEmptyString(claim.claim, `${path}.claim`);
    stringArray(claim.evidence, `${path}.evidence`);
    nullableString(claim.reasoning, `${path}.reasoning`);
    nullableString(claim.backing, `${path}.backing`);
    nullableString(claim.qualifier, `${path}.qualifier`);
    stringArray(claim.rebuttal, `${path}.rebuttal`);
    nullableString(claim.timeHorizon, `${path}.timeHorizon`);
    stringArray(claim.relevantTickers, `${path}.relevantTickers`);
  }
  return source;
}

export function buildBeliefResearchRelationContext(
  source: BeliefResearchRelationSource,
  repository: BeliefResearchRelationRepositorySnapshot,
): BeliefResearchRelationContext {
  validateSource(source);
  const eligibleTheses = repository.theses.filter((thesis) =>
    thesis.status === 'developing' || thesis.status === 'monitoring');
  if (eligibleTheses.length !== repository.theses.length) {
    fail('Repository snapshot contains a thesis outside developing or monitoring eligibility');
  }
  const sourceHeader = { ...source };
  delete (sourceHeader as Partial<BeliefResearchRelationSource>).claims;

  const claimResolutions = source.claims.map((claim) => {
    const exactMatches = repository.existingMainClaims.filter((candidate) =>
      candidate.sourceInsightId === source.insightId
      && candidate.sourceClaimId === claim.sourceClaimId);
    if (exactMatches.length > 1) {
      fail(`Source claim ${claim.sourceClaimId} has ambiguous provenance identity`);
    }
    const exact = exactMatches[0];
    return {
      sourceClaimId: claim.sourceClaimId,
      disposition: exact ? 'reuse_exact_provenance' as const : 'publication_required' as const,
      mainClaimId: exact?.id ?? null,
    };
  });

  return {
    contractVersion: '1.0.0',
    source: sourceHeader as Omit<BeliefResearchRelationSource, 'claims'>,
    sourceEvidence: source.claims.map((claim) => ({ ...claim })),
    mainClaimCatalog: repository.existingMainClaims.map((claim) => ({ ...claim })),
    claimResolutions,
    thesisTargets: eligibleTheses.map((thesis) => ({
      ...thesis,
      id: uuid(thesis.id, 'thesis.id'),
      argument: { ...thesis.argument, digest: digest(thesis.argument) },
    })),
    existingRelationships: repository.existingRelationships.map((relationship) => ({ ...relationship })),
  };
}

function fail(message: string): never {
  throw new Error(message);
}

export function validateBeliefResearchRelationContext(value: unknown): BeliefResearchRelationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Belief research relation context must be an object');
  }
  const context = value as BeliefResearchRelationContext;
  const source = validateSource({ ...context.source, claims: context.sourceEvidence });
  if (!Array.isArray(context.claimResolutions)
    || context.claimResolutions.length !== source.claims.length) {
    fail('Context claim resolutions must cover every source claim');
  }
  if (!Array.isArray(context.mainClaimCatalog)) fail('Context mainClaimCatalog must be an array');
  if (!Array.isArray(context.thesisTargets)) fail('Context thesisTargets must be an array');
  for (const thesis of context.thesisTargets) {
    if (thesis.status !== 'developing' && thesis.status !== 'monitoring') {
      fail('Context thesis target must be developing or monitoring');
    }
    if (thesis.argument.digest !== digest({
      source: thesis.argument.source,
      coreArgument: thesis.argument.coreArgument,
      keyDrivers: thesis.argument.keyDrivers,
      keyAssumptions: thesis.argument.keyAssumptions,
    })) fail(`Thesis ${thesis.id} argument digest is stale`);
  }
  return context;
}

export function validateBeliefResearchRelationResult(
  context: BeliefResearchRelationContext,
  value: BeliefResearchRelationReadyResult,
): BeliefResearchRelationReadyResult {
  validateBeliefResearchRelationContext(context);
  if (value.contractVersion !== '1.0.0' || value.status !== 'ready') {
    fail('Belief research relation result must use the ready 1.0.0 contract');
  }
  if (value.contextDigest !== digestBeliefResearchRelationContext(context)) {
    fail('Belief research relation contextDigest does not match the supplied context');
  }
  if (value.execution.mode !== 'recommendation_only' || value.execution.writes.length !== 0) {
    fail('Belief research relation execution must remain recommendation-only');
  }

  const claims = new Map(context.sourceEvidence.map((claim) => [claim.sourceClaimId, claim]));
  const resolutions = new Map(context.claimResolutions.map((resolution) => [resolution.sourceClaimId, resolution]));
  const theses = new Map(context.thesisTargets.map((thesis) => [thesis.id, thesis]));
  if (!Array.isArray(value.relations) || value.relations.length > context.sourceEvidence.length * 5) {
    fail('Belief research relation result exceeds the five-relations-per-claim bound');
  }
  if (!Array.isArray(value.ambiguities) || !Array.isArray(value.unrelated)) {
    fail('Belief research relation result must include ambiguity and unrelated arrays');
  }
  if (!Array.isArray(value.deferred)) fail('Belief research relation result must include a deferred array');
  const expectedEvidence = context.sourceEvidence.map(({ sourceClaimId }) => ({
    insightId: context.source.insightId, sourceClaimId,
  }));
  if (JSON.stringify(value.sourceEvidence) !== JSON.stringify(expectedEvidence)) {
    fail('Belief research relation source evidence must exactly cover the prepared source claims');
  }
  const ambiguityClaims = new Set(value.ambiguities.map((item) => item.sourceClaimId));
  const deferredClaims = new Set(value.deferred.map((item) => item.sourceClaimId));
  const unrelatedClaims = new Set(value.unrelated.map((item) => item.sourceClaimId));
  const relationClaims = new Set(value.relations.map((item) => item.sourceClaimId));
  for (const claim of context.sourceEvidence) {
    const count = Number(ambiguityClaims.has(claim.sourceClaimId))
      + Number(deferredClaims.has(claim.sourceClaimId))
      + Number(unrelatedClaims.has(claim.sourceClaimId))
      + Number(relationClaims.has(claim.sourceClaimId));
    if (count === 0) fail(`Result coverage is incomplete for source claim ${claim.sourceClaimId}`);
    if (count > 1) fail(`Result ambiguity for ${claim.sourceClaimId} was silently combined with a relation`);
  }
  const logicalRelationships = new Set<string>();
  const relationsPerClaim = new Map<string, number>();
  for (const relation of value.relations) {
    const claim = claims.get(relation.sourceClaimId);
    const resolution = resolutions.get(relation.sourceClaimId);
    const thesis = theses.get(relation.thesisId);
    if (!claim || !resolution) fail(`Relation ${relation.relationId} references an unknown source claim`);
    if (!thesis || thesis.type !== relation.thesisType) {
      fail(`Relation ${relation.relationId} references an ineligible thesis`);
    }
    if (resolution.disposition !== relation.claimDisposition) {
      fail(`Relation ${relation.relationId} does not preserve claim disposition`);
    }
    if (resolution.disposition !== 'reuse_exact_provenance' || !resolution.mainClaimId) {
      fail(`Relation ${relation.relationId} requires an exact promoted claim; complete governed publication first`);
    }
    if (resolution.mainClaimId && relation.mainClaimRef !== resolution.mainClaimId) {
      fail(`Relation ${relation.relationId} must reuse the exact provenance-bearing claim`);
    }
    if (relation.bearingProof.kind !== 'direct_semantic_bearing') {
      fail(`Relation ${relation.relationId} lacks direct semantic-bearing proof`);
    }
    if (relation.bearingProof.claimAnchor !== claim.claim) {
      fail(`Relation ${relation.relationId} claim anchor does not match source evidence`);
    }
    if (relation.bearingProof.thesisAnchor !== thesis.argument.coreArgument) {
      fail(`Relation ${relation.relationId} thesis anchor does not match the governed thesis argument`);
    }
    if (relation.confidence !== 'high') {
      fail(`Relation ${relation.relationId} requires explicit ambiguity rather than silent low-confidence linking`);
    }
    const logicalKey = `${relation.mainClaimRef}:${relation.thesisType}:${relation.thesisId}`;
    if (logicalRelationships.has(logicalKey)) fail('Result contains a duplicate logical relationship');
    logicalRelationships.add(logicalKey);
    const count = (relationsPerClaim.get(relation.sourceClaimId) ?? 0) + 1;
    if (count > 5) fail(`Result must contain at most five relations per source claim`);
    relationsPerClaim.set(relation.sourceClaimId, count);
  }
  const catalogIds = new Set(context.mainClaimCatalog.map(({ id }) => id));
  for (const ambiguity of value.ambiguities) {
    if (!claims.has(ambiguity.sourceClaimId)) fail('Ambiguity references an unknown source claim');
    if (ambiguity.axis !== 'claim_identity' && ambiguity.axis !== 'thesis_bearing') {
      fail('Ambiguity axis is unsupported');
    }
    if (!ambiguity.candidateMainClaimIds.every((id) => catalogIds.has(id))) {
      fail('Ambiguity contains an unknown main-claim candidate');
    }
    if (!ambiguity.candidateThesisIds.every((id) => theses.has(id))) {
      fail('Ambiguity contains an ineligible thesis candidate');
    }
    nonEmptyString(ambiguity.reason, 'ambiguity.reason');
  }
  for (const deferred of value.deferred) {
    const resolution = resolutions.get(deferred.sourceClaimId);
    if (!resolution || resolution.disposition !== 'publication_required'
      || deferred.reason !== 'claim_publication_required') {
      fail('Deferred result must name a source claim that requires governed publication');
    }
    nonEmptyString(deferred.detail, 'deferred.detail');
  }
  for (const unrelated of value.unrelated) {
    if (!claims.has(unrelated.sourceClaimId)) fail('Unrelated result references an unknown source claim');
    nonEmptyString(unrelated.rationale, 'unrelated.rationale');
  }
  return value;
}

export function createUnavailableBeliefResearchRelationResult(
  reason: BeliefResearchRelationUnavailableReason,
  detail: string,
): BeliefResearchRelationUnavailableResult {
  return {
    contractVersion: '1.0.0', status: 'unavailable', reason,
    detail: nonEmptyString(detail, 'unavailable.detail'),
    execution: { mode: 'recommendation_only', writes: [] },
  };
}

export function prepareBeliefResearchRelationRecording(
  context: BeliefResearchRelationContext,
  resultValue: BeliefResearchRelationReadyResult,
): PreparedBeliefResearchRelationRecording {
  const result = validateBeliefResearchRelationResult(context, resultValue);
  const exactClaimIds = new Map(context.claimResolutions
    .filter((item): item is typeof item & { mainClaimId: string } => item.mainClaimId !== null)
    .map((item) => [item.sourceClaimId, item.mainClaimId]));
  const relationCandidates = result.relations.flatMap((relation) => {
    const mainClaimId = exactClaimIds.get(relation.sourceClaimId);
    return mainClaimId ? [{ ...relation, mainClaimId }] : [];
  });
  const exclusions: PreparedBeliefResearchRelationRecording['exclusions'] = result.deferred.map((deferred) => ({
      sourceClaimId: deferred.sourceClaimId,
      reason: 'claim_publication_required' as const,
      detail: deferred.detail,
    }));
  const decisionCandidates = result.ambiguities.flatMap((ambiguity) => {
    const objectId = ambiguity.candidateMainClaimIds[0] ?? exactClaimIds.get(ambiguity.sourceClaimId);
    if (!objectId) {
      exclusions.push({
        sourceClaimId: ambiguity.sourceClaimId,
        reason: 'no_existing_claim_anchor',
        detail: 'A Decision Item requires an existing promoted claim anchor.',
      });
      return [];
    }
    return [{
      decisionId: `decision:${ambiguity.axis}:${context.source.insightId}:${ambiguity.sourceClaimId}`,
      sourceClaimId: ambiguity.sourceClaimId,
      objectType: 'claim' as const,
      objectId,
      actionType: 'confirm_claim_link' as const,
      axis: ambiguity.axis,
      candidateMainClaimIds: [...ambiguity.candidateMainClaimIds],
      candidateThesisIds: [...ambiguity.candidateThesisIds],
      candidateTheses: ambiguity.candidateThesisIds.map((id) => {
        const thesis = context.thesisTargets.find((candidate) => candidate.id === id);
        if (!thesis) fail(`Decision candidate references ineligible thesis ${id}`);
        return { id, type: thesis.type };
      }),
      reason: ambiguity.reason,
    }];
  });
  const withoutDigest: Omit<PreparedBeliefResearchRelationRecording, 'recordingDigest'> = {
    contractVersion: '1.0.0', status: 'authorization_required',
    contextDigest: digestBeliefResearchRelationContext(context),
    resultDigest: digestBeliefResearchRelationResult(result),
    result,
    source: context.source,
    relationCandidates,
    decisionCandidates,
    exclusions,
    authorization: {
      required: true, authorizedBy: 'user_only', maximumValidityHours: 24,
      statement: BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT,
    },
    permittedWriteSurface: {
      tables: ['claim_thesis_mappings', 'journal_entries'],
      claimThesisMappings: [
        'main_claim_id', 'macro_thesis_id', 'asset_thesis_id', 'mapping_type',
        'confidence', 'mapped_by', 'notes',
      ],
      journalEntries: [
        'timestamp', 'object_type', 'object_id', 'object_title', 'action_type',
        'action_description', 'skill_invoked', 'new_state', 'rationale', 'source',
        'metadata', 'batch_id', 'first_detected_at', 'last_seen_at',
        'occurrence_count', 'status',
      ],
    },
    forbiddenAuthority: [
      'main_claims', 'thesis_status', 'decision_resolution', 'strategies',
      'positions', 'trades', 'ad_hoc_sql', 'supabase_mcp_writes',
      'direct_api_mutation', 'generic_writes',
    ],
    execution: { mode: 'authorization_required', writes: [] },
  };
  return { ...withoutDigest, recordingDigest: digestBeliefResearchRelationRecording(withoutDigest) };
}

export function validatePreparedBeliefResearchRelationRecording(
  value: unknown,
): PreparedBeliefResearchRelationRecording {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Prepared belief-research relation recording must be an object');
  }
  const prepared = value as PreparedBeliefResearchRelationRecording;
  const allowed = [
    'contractVersion', 'status', 'recordingDigest', 'contextDigest', 'resultDigest',
    'source', 'result', 'relationCandidates', 'decisionCandidates', 'exclusions', 'authorization',
    'permittedWriteSurface', 'forbiddenAuthority', 'execution',
  ];
  const unsupported = Object.keys(prepared).filter((key) => !allowed.includes(key));
  if (unsupported.length) fail(`Prepared recording contains unsupported authority: ${unsupported.join(', ')}`);
  if (prepared.contractVersion !== '1.0.0' || prepared.status !== 'authorization_required') {
    fail('Prepared recording must use authorization-required version 1.0.0');
  }
  if (prepared.execution?.mode !== 'authorization_required' || prepared.execution.writes.length !== 0) {
    fail('Prepared recording must not contain writes');
  }
  if (prepared.authorization?.authorizedBy !== 'user_only'
    || prepared.authorization.statement !== BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT) {
    fail('Prepared recording authorization boundary is invalid');
  }
  if (prepared.resultDigest !== digestBeliefResearchRelationResult(prepared.result)) {
    fail('Prepared recording result digest does not match exact result bytes');
  }
  if (JSON.stringify(prepared.permittedWriteSurface?.tables)
    !== JSON.stringify(['claim_thesis_mappings', 'journal_entries'])) {
    fail('Prepared recording write surface is invalid');
  }
  const exactMappingColumns = [
    'main_claim_id', 'macro_thesis_id', 'asset_thesis_id', 'mapping_type',
    'confidence', 'mapped_by', 'notes',
  ];
  const exactJournalColumns = [
    'timestamp', 'object_type', 'object_id', 'object_title', 'action_type',
    'action_description', 'skill_invoked', 'new_state', 'rationale', 'source',
    'metadata', 'batch_id', 'first_detected_at', 'last_seen_at',
    'occurrence_count', 'status',
  ];
  const exactForbidden = [
    'main_claims', 'thesis_status', 'decision_resolution', 'strategies',
    'positions', 'trades', 'ad_hoc_sql', 'supabase_mcp_writes',
    'direct_api_mutation', 'generic_writes',
  ];
  if (JSON.stringify(prepared.permittedWriteSurface.claimThesisMappings)
    !== JSON.stringify(exactMappingColumns)
    || JSON.stringify(prepared.permittedWriteSurface.journalEntries)
    !== JSON.stringify(exactJournalColumns)
    || JSON.stringify(prepared.forbiddenAuthority) !== JSON.stringify(exactForbidden)) {
    fail('Prepared recording columns or forbidden authority do not match the exact contract');
  }
  for (const candidate of prepared.relationCandidates ?? []) {
    if (candidate.mainClaimId !== candidate.mainClaimRef
      || candidate.claimDisposition !== 'reuse_exact_provenance') {
      fail(`Relation ${candidate.relationId} attempts to create or substitute a claim`);
    }
    if (candidate.confidence !== 'high' || candidate.bearingProof.kind !== 'direct_semantic_bearing') {
      fail(`Relation ${candidate.relationId} is outside the exact semantic-bearing boundary`);
    }
  }
  for (const candidate of prepared.decisionCandidates ?? []) {
    if (candidate.objectType !== 'claim' || candidate.actionType !== 'confirm_claim_link') {
      fail(`Decision ${candidate.decisionId} is outside the Decision Item surfacing boundary`);
    }
    if (JSON.stringify(candidate.candidateThesisIds)
      !== JSON.stringify(candidate.candidateTheses.map(({ id }) => id))
      || candidate.candidateTheses.some(({ type }) => type !== 'macro' && type !== 'asset')) {
      fail(`Decision ${candidate.decisionId} has inconsistent thesis identity`);
    }
  }
  const { recordingDigest: ignored, ...withoutDigest } = prepared;
  void ignored;
  if (prepared.recordingDigest !== digestBeliefResearchRelationRecording(withoutDigest)) {
    fail('Prepared recording digest does not match exact prepared bytes');
  }
  return prepared;
}

function exactIso(value: unknown, field: string): { value: string; ms: number } {
  const result = nonEmptyString(value, field);
  const ms = Date.parse(result);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== result) fail(`${field} must be a canonical ISO instant`);
  return { value: result, ms };
}

function exactUniqueIds(value: unknown, field: string): string[] {
  const result = stringArray(value, field);
  if (new Set(result).size !== result.length) fail(`${field} must not contain duplicates`);
  return result;
}

export function validateBeliefResearchRelationRecordingAuthorization(
  prepared: PreparedBeliefResearchRelationRecording,
  value: unknown,
  now = new Date(),
): BeliefResearchRelationRecordingAuthorization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Recording authorization must be an object');
  const auth = value as Record<string, unknown>;
  const allowed = [
    'contractVersion', 'type', 'authorizationId', 'authorizedBy', 'authorizedAt',
    'expiresAt', 'recordingDigest', 'acceptedRelationIds', 'acceptedDecisionIds', 'statement',
  ];
  const unsupported = Object.keys(auth).filter((key) => !allowed.includes(key));
  if (unsupported.length) fail(`Recording authorization contains unsupported authority: ${unsupported.join(', ')}`);
  if (auth.contractVersion !== '1.0.0' || auth.type !== 'belief_research_relation_authorization') {
    fail('Recording authorization must use the 1.0.0 contract');
  }
  const authorizationId = uuid(auth.authorizationId, 'authorizationId');
  if (auth.authorizedBy !== 'user') fail('Only the user may authorize belief-research relation writes');
  if (auth.statement !== BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT) {
    fail('Authorization statement must exactly name the bounded write authority');
  }
  if (auth.recordingDigest !== prepared.recordingDigest) fail('Authorization recordingDigest does not match');
  const authorizedAt = exactIso(auth.authorizedAt, 'authorizedAt');
  const expiresAt = exactIso(auth.expiresAt, 'expiresAt');
  if (authorizedAt.ms > now.getTime() || expiresAt.ms <= now.getTime()
    || expiresAt.ms <= authorizedAt.ms
    || expiresAt.ms - authorizedAt.ms > prepared.authorization.maximumValidityHours * 3_600_000) {
    fail('Authorization time window is invalid or exceeds 24 hours');
  }
  const acceptedRelationIds = exactUniqueIds(auth.acceptedRelationIds, 'acceptedRelationIds');
  const acceptedDecisionIds = exactUniqueIds(auth.acceptedDecisionIds, 'acceptedDecisionIds');
  const relationIds = new Set(prepared.relationCandidates.map(({ relationId }) => relationId));
  const decisionIds = new Set(prepared.decisionCandidates.map(({ decisionId }) => decisionId));
  if (acceptedRelationIds.some((id) => !relationIds.has(id))) fail('acceptedRelationIds contains an unknown candidate');
  if (acceptedDecisionIds.some((id) => !decisionIds.has(id))) fail('acceptedDecisionIds contains an unknown candidate');
  if (acceptedRelationIds.length + acceptedDecisionIds.length === 0) fail('Authorization must accept at least one candidate');
  return {
    contractVersion: '1.0.0', type: 'belief_research_relation_authorization',
    authorizationId, authorizedBy: 'user', authorizedAt: authorizedAt.value,
    expiresAt: expiresAt.value, recordingDigest: prepared.recordingDigest,
    acceptedRelationIds, acceptedDecisionIds,
    statement: BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT,
  };
}
