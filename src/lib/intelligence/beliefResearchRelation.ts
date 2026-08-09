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
    relationId: string | null;
    objectType: 'claim' | 'macro_thesis' | 'asset_thesis';
    objectId: string;
    decisionType: 'confirm_claim_link' | 'review_refuting_claim';
    axis: 'claim_identity' | 'thesis_bearing' | 'tentative_relation' | 'refuting_evidence';
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
  authorization: unknown,
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

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function allowedKeys(value: Record<string, unknown>, path: string, allowed: string[]): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) fail(`${path} contains unsupported fields: ${unsupported.join(', ')}`);
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  return value;
}

function uniqueStrings(value: unknown, path: string): string[] {
  const result = stringArray(value, path).map((item, index) => nonEmptyString(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${path} must contain unique values`);
  return result;
}

function uuid(value: unknown, path: string): string {
  const result = nonEmptyString(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    fail(`${path} must be a UUID`);
  }
  return result;
}

function validateSource(source: BeliefResearchRelationSource): BeliefResearchRelationSource {
  const root = objectAt(source, 'source');
  allowedKeys(root, 'source', [
    'authority', 'artifactId', 'insightId', 'title', 'sourceType', 'sourceUrl',
    'contentSha256', 'observedAt', 'claims',
  ]);
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
    const claimRoot = objectAt(claim, path);
    allowedKeys(claimRoot, path, [
      'sourceClaimId', 'title', 'category', 'claim', 'evidence', 'reasoning',
      'backing', 'qualifier', 'rebuttal', 'timeHorizon', 'relevantTickers',
    ]);
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

  const context: BeliefResearchRelationContext = {
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
  return validateBeliefResearchRelationContext(context);
}

function fail(message: string): never {
  throw new Error(message);
}

export function validateBeliefResearchRelationContext(value: unknown): BeliefResearchRelationContext {
  const root = objectAt(value, 'context');
  allowedKeys(root, 'context', [
    'contractVersion', 'source', 'sourceEvidence', 'mainClaimCatalog',
    'claimResolutions', 'thesisTargets', 'existingRelationships',
  ]);
  if (root.contractVersion !== '1.0.0') fail('Context contractVersion must be 1.0.0');
  const context = value as BeliefResearchRelationContext;
  const sourceHeader = objectAt(context.source, 'context.source');
  allowedKeys(sourceHeader, 'context.source', [
    'authority', 'artifactId', 'insightId', 'title', 'sourceType', 'sourceUrl',
    'contentSha256', 'observedAt',
  ]);
  const source = validateSource({ ...context.source, claims: context.sourceEvidence });
  const catalogValues = arrayAt(context.mainClaimCatalog, 'context.mainClaimCatalog');
  const catalogIds = new Set<string>();
  const provenanceKeys = new Set<string>();
  for (const [index, item] of catalogValues.entries()) {
    const path = `context.mainClaimCatalog[${index}]`;
    const claim = objectAt(item, path);
    allowedKeys(claim, path, [
      'id', 'title', 'category', 'claim', 'status', 'sourceInsightId', 'sourceClaimId',
    ]);
    const id = uuid(claim.id, `${path}.id`);
    if (catalogIds.has(id)) fail('Context mainClaimCatalog IDs must be unique');
    catalogIds.add(id);
    nonEmptyString(claim.title, `${path}.title`);
    if (claim.category !== 'macro' && claim.category !== 'asset_specific') {
      fail(`${path}.category must be macro or asset_specific`);
    }
    nonEmptyString(claim.claim, `${path}.claim`);
    nonEmptyString(claim.status, `${path}.status`);
    const insightId = claim.sourceInsightId === null ? null : uuid(claim.sourceInsightId, `${path}.sourceInsightId`);
    const sourceClaimId = nullableString(claim.sourceClaimId, `${path}.sourceClaimId`);
    if ((insightId === null) !== (sourceClaimId === null)) fail(`${path} provenance must be complete or absent`);
    if (insightId && sourceClaimId) {
      const key = `${insightId}:${sourceClaimId}`;
      if (provenanceKeys.has(key)) fail('Context mainClaimCatalog provenance identities must be unique');
      provenanceKeys.add(key);
    }
  }
  const resolutionValues = arrayAt(context.claimResolutions, 'context.claimResolutions');
  if (resolutionValues.length !== source.claims.length) {
    fail('Context claim resolutions must cover every source claim');
  }
  const sourceClaimIds = source.claims.map(({ sourceClaimId }) => sourceClaimId);
  const resolutionIds: string[] = [];
  for (const [index, item] of resolutionValues.entries()) {
    const path = `context.claimResolutions[${index}]`;
    const resolution = objectAt(item, path);
    allowedKeys(resolution, path, ['sourceClaimId', 'disposition', 'mainClaimId']);
    const sourceClaimId = nonEmptyString(resolution.sourceClaimId, `${path}.sourceClaimId`);
    resolutionIds.push(sourceClaimId);
    if (resolution.disposition !== 'reuse_exact_provenance'
      && resolution.disposition !== 'publication_required') {
      fail(`${path}.disposition is unsupported`);
    }
    if (resolution.disposition === 'reuse_exact_provenance') {
      const mainClaimId = uuid(resolution.mainClaimId, `${path}.mainClaimId`);
      const claim = context.mainClaimCatalog.find(({ id }) => id === mainClaimId);
      if (!claim || claim.sourceInsightId !== context.source.insightId
        || claim.sourceClaimId !== sourceClaimId) {
        fail(`${path} does not resolve the exact source claim provenance`);
      }
    } else {
      if (resolution.mainClaimId !== null) fail(`${path}.mainClaimId must be null when publication is required`);
      if (context.mainClaimCatalog.some((claim) => claim.sourceInsightId === context.source.insightId
        && claim.sourceClaimId === sourceClaimId)) {
        fail(`${path} cannot require publication when exact provenance already exists`);
      }
    }
  }
  if (new Set(resolutionIds).size !== resolutionIds.length
    || JSON.stringify(resolutionIds) !== JSON.stringify(sourceClaimIds)) {
    fail('Context claim resolutions must uniquely and exactly cover source claims in source order');
  }
  const thesisValues = arrayAt(context.thesisTargets, 'context.thesisTargets');
  const thesisKeys = new Set<string>();
  for (const [index, item] of thesisValues.entries()) {
    const path = `context.thesisTargets[${index}]`;
    const thesis = objectAt(item, path) as unknown as BeliefResearchRelationContext['thesisTargets'][number];
    allowedKeys(objectAt(item, path), path, [
      'id', 'type', 'title', 'description', 'direction', 'status', 'ticker', 'argument',
    ]);
    uuid(thesis.id, `${path}.id`);
    if (thesis.type !== 'macro' && thesis.type !== 'asset') fail(`${path}.type must be macro or asset`);
    const thesisKey = `${thesis.type}:${thesis.id}`;
    if (thesisKeys.has(thesisKey)) fail('Context thesis target identities must be unique');
    thesisKeys.add(thesisKey);
    nonEmptyString(thesis.title, `${path}.title`);
    nullableString(thesis.description, `${path}.description`);
    nullableString(thesis.direction, `${path}.direction`);
    nullableString(thesis.ticker, `${path}.ticker`);
    if (thesis.status !== 'developing' && thesis.status !== 'monitoring') {
      fail('Context thesis target must be developing or monitoring');
    }
    const argument = objectAt(thesis.argument, `${path}.argument`);
    allowedKeys(argument, `${path}.argument`, [
      'source', 'coreArgument', 'keyDrivers', 'keyAssumptions', 'digest',
    ]);
    if (thesis.argument.source !== 'latest_articulation' && thesis.argument.source !== 'description') {
      fail(`${path}.argument.source is unsupported`);
    }
    nonEmptyString(thesis.argument.coreArgument, `${path}.argument.coreArgument`);
    stringArray(thesis.argument.keyDrivers, `${path}.argument.keyDrivers`);
    stringArray(thesis.argument.keyAssumptions, `${path}.argument.keyAssumptions`);
    if (thesis.argument.digest !== digest({
      source: thesis.argument.source,
      coreArgument: thesis.argument.coreArgument,
      keyDrivers: thesis.argument.keyDrivers,
      keyAssumptions: thesis.argument.keyAssumptions,
    })) fail(`Thesis ${thesis.id} argument digest is stale`);
  }
  const relationshipValues = arrayAt(context.existingRelationships, 'context.existingRelationships');
  const relationshipKeys = new Set<string>();
  for (const [index, item] of relationshipValues.entries()) {
    const path = `context.existingRelationships[${index}]`;
    const relationship = objectAt(item, path);
    allowedKeys(relationship, path, ['claimId', 'thesisId', 'thesisType', 'relationship']);
    const claimId = uuid(relationship.claimId, `${path}.claimId`);
    const thesisId = uuid(relationship.thesisId, `${path}.thesisId`);
    if (!catalogIds.has(claimId)) fail(`${path}.claimId is absent from the claim catalog`);
    if (relationship.thesisType !== 'macro' && relationship.thesisType !== 'asset') {
      fail(`${path}.thesisType must be macro or asset`);
    }
    if (!thesisKeys.has(`${relationship.thesisType}:${thesisId}`)) {
      fail(`${path} references an ineligible thesis`);
    }
    if (!['supports', 'refutes', 'foundation'].includes(String(relationship.relationship))) {
      fail(`${path}.relationship is unsupported`);
    }
    const key = `${claimId}:${relationship.thesisType}:${thesisId}`;
    if (relationshipKeys.has(key)) fail('Context existing relationships must be unique');
    relationshipKeys.add(key);
  }
  return context;
}

export function validateBeliefResearchRelationResult(
  context: BeliefResearchRelationContext,
  input: unknown,
): BeliefResearchRelationReadyResult {
  validateBeliefResearchRelationContext(context);
  const root = objectAt(input, 'result');
  allowedKeys(root, 'result', [
    'contractVersion', 'contextDigest', 'status', 'sourceEvidence', 'relations',
    'ambiguities', 'deferred', 'unrelated', 'execution', 'limitations',
  ]);
  const evidenceValues = arrayAt(root.sourceEvidence, 'result.sourceEvidence');
  for (const [index, item] of evidenceValues.entries()) {
    const evidence = objectAt(item, `result.sourceEvidence[${index}]`);
    allowedKeys(evidence, `result.sourceEvidence[${index}]`, ['insightId', 'sourceClaimId']);
    uuid(evidence.insightId, `result.sourceEvidence[${index}].insightId`);
    nonEmptyString(evidence.sourceClaimId, `result.sourceEvidence[${index}].sourceClaimId`);
  }
  const relationValues = arrayAt(root.relations, 'result.relations');
  for (const [index, item] of relationValues.entries()) {
    const path = `result.relations[${index}]`;
    const relation = objectAt(item, path);
    allowedKeys(relation, path, [
      'relationId', 'sourceClaimId', 'mainClaimRef', 'claimDisposition', 'thesisId',
      'thesisType', 'relationship', 'confidence', 'rationale', 'bearingProof',
    ]);
    nonEmptyString(relation.relationId, `${path}.relationId`);
    nonEmptyString(relation.sourceClaimId, `${path}.sourceClaimId`);
    uuid(relation.mainClaimRef, `${path}.mainClaimRef`);
    if (relation.claimDisposition !== 'reuse_exact_provenance'
      && relation.claimDisposition !== 'publication_required') {
      fail(`${path}.claimDisposition must be reuse_exact_provenance or publication_required`);
    }
    uuid(relation.thesisId, `${path}.thesisId`);
    if (relation.thesisType !== 'macro' && relation.thesisType !== 'asset') {
      fail(`${path}.thesisType must be macro or asset`);
    }
    if (!['supports', 'refutes', 'foundation'].includes(String(relation.relationship))) {
      fail(`${path}.relationship must be supports, refutes, or foundation`);
    }
    if (!['high', 'medium', 'low'].includes(String(relation.confidence))) {
      fail(`${path}.confidence must be high, medium, or low`);
    }
    nonEmptyString(relation.rationale, `${path}.rationale`);
    const proof = objectAt(relation.bearingProof, `${path}.bearingProof`);
    allowedKeys(proof, `${path}.bearingProof`, [
      'kind', 'claimAnchor', 'thesisAnchor', 'connection',
    ]);
    if (proof.kind !== 'direct_semantic_bearing') {
      fail(`${path}.bearingProof.kind must be direct_semantic_bearing`);
    }
    nonEmptyString(proof.claimAnchor, `${path}.bearingProof.claimAnchor`);
    nonEmptyString(proof.thesisAnchor, `${path}.bearingProof.thesisAnchor`);
    nonEmptyString(proof.connection, `${path}.bearingProof.connection`);
  }
  const ambiguityValues = arrayAt(root.ambiguities, 'result.ambiguities');
  for (const [index, item] of ambiguityValues.entries()) {
    const path = `result.ambiguities[${index}]`;
    const ambiguity = objectAt(item, path);
    allowedKeys(ambiguity, path, [
      'sourceClaimId', 'axis', 'candidateMainClaimIds', 'candidateThesisIds', 'reason',
    ]);
    nonEmptyString(ambiguity.sourceClaimId, `${path}.sourceClaimId`);
    if (ambiguity.axis !== 'claim_identity' && ambiguity.axis !== 'thesis_bearing') {
      fail(`${path}.axis must be claim_identity or thesis_bearing`);
    }
    for (const [candidateIndex, id] of uniqueStrings(
      ambiguity.candidateMainClaimIds, `${path}.candidateMainClaimIds`,
    ).entries()) uuid(id, `${path}.candidateMainClaimIds[${candidateIndex}]`);
    for (const [candidateIndex, id] of uniqueStrings(
      ambiguity.candidateThesisIds, `${path}.candidateThesisIds`,
    ).entries()) uuid(id, `${path}.candidateThesisIds[${candidateIndex}]`);
    nonEmptyString(ambiguity.reason, `${path}.reason`);
  }
  const deferredValues = arrayAt(root.deferred, 'result.deferred');
  for (const [index, item] of deferredValues.entries()) {
    const path = `result.deferred[${index}]`;
    const deferred = objectAt(item, path);
    allowedKeys(deferred, path, ['sourceClaimId', 'reason', 'detail']);
    nonEmptyString(deferred.sourceClaimId, `${path}.sourceClaimId`);
    if (deferred.reason !== 'claim_publication_required') {
      fail(`${path}.reason must be claim_publication_required`);
    }
    nonEmptyString(deferred.detail, `${path}.detail`);
  }
  const unrelatedValues = arrayAt(root.unrelated, 'result.unrelated');
  for (const [index, item] of unrelatedValues.entries()) {
    const path = `result.unrelated[${index}]`;
    const unrelated = objectAt(item, path);
    allowedKeys(unrelated, path, ['sourceClaimId', 'rationale']);
    nonEmptyString(unrelated.sourceClaimId, `${path}.sourceClaimId`);
    nonEmptyString(unrelated.rationale, `${path}.rationale`);
  }
  const execution = objectAt(root.execution, 'result.execution');
  allowedKeys(execution, 'result.execution', ['mode', 'writes']);
  if (execution.mode !== 'recommendation_only'
    || arrayAt(execution.writes, 'result.execution.writes').length !== 0) {
    fail('Belief research relation execution must remain recommendation-only');
  }
  uniqueStrings(root.limitations, 'result.limitations');
  const value = input as BeliefResearchRelationReadyResult;
  if (value.contractVersion !== '1.0.0' || value.status !== 'ready') {
    fail('Belief research relation result must use the ready 1.0.0 contract');
  }
  if (value.contextDigest !== digestBeliefResearchRelationContext(context)) {
    fail('Belief research relation contextDigest does not match the supplied context');
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
    const ambiguityCount = value.ambiguities.filter(({ sourceClaimId }) =>
      sourceClaimId === claim.sourceClaimId).length;
    const deferredCount = value.deferred.filter(({ sourceClaimId }) =>
      sourceClaimId === claim.sourceClaimId).length;
    const unrelatedCount = value.unrelated.filter(({ sourceClaimId }) =>
      sourceClaimId === claim.sourceClaimId).length;
    if (ambiguityCount > 1 || deferredCount > 1 || unrelatedCount > 1) {
      fail(`Result contains duplicate classification for source claim ${claim.sourceClaimId}`);
    }
    const count = Number(ambiguityClaims.has(claim.sourceClaimId))
      + Number(deferredClaims.has(claim.sourceClaimId))
      + Number(unrelatedClaims.has(claim.sourceClaimId))
      + Number(relationClaims.has(claim.sourceClaimId));
    if (count === 0) fail(`Result coverage is incomplete for source claim ${claim.sourceClaimId}`);
    if (count > 1) fail(`Result ambiguity for ${claim.sourceClaimId} was silently combined with a relation`);
  }
  const logicalRelationships = new Set<string>();
  const relationIds = new Set<string>();
  const relationsPerClaim = new Map<string, number>();
  for (const relation of value.relations) {
    if (relationIds.has(relation.relationId)) fail('Result relationId values must be globally unique');
    relationIds.add(relation.relationId);
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
  const ambiguityDecisions = result.ambiguities.flatMap((ambiguity) => {
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
      relationId: null,
      objectType: 'claim' as const,
      objectId,
      decisionType: 'confirm_claim_link' as const,
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
  const relationDecisions: PreparedBeliefResearchRelationRecording['decisionCandidates'] = relationCandidates
    .filter((relation) => relation.relationship === 'refutes'
      || ((relation.relationship === 'supports' || relation.relationship === 'foundation')
        && relation.confidence !== 'high'))
    .map((relation) => {
      const thesis = context.thesisTargets.find((candidate) =>
        candidate.id === relation.thesisId && candidate.type === relation.thesisType);
      if (!thesis) fail(`Relation ${relation.relationId} references an ineligible thesis`);
      const refuting = relation.relationship === 'refutes';
      return {
        decisionId: `decision:${refuting ? 'review_refuting_claim' : 'confirm_claim_link'}:${relation.relationId}`,
        sourceClaimId: relation.sourceClaimId,
        relationId: relation.relationId,
        objectType: thesis.type === 'macro' ? 'macro_thesis' as const : 'asset_thesis' as const,
        objectId: thesis.id,
        decisionType: refuting ? 'review_refuting_claim' as const : 'confirm_claim_link' as const,
        axis: refuting ? 'refuting_evidence' as const : 'tentative_relation' as const,
        candidateMainClaimIds: [relation.mainClaimId],
        candidateThesisIds: [thesis.id],
        candidateTheses: [{ id: thesis.id, type: thesis.type }],
        reason: refuting
          ? `Refuting evidence was linked to ${thesis.title} and requires explicit review: ${relation.rationale}`
          : `A qualified ${relation.relationship} relationship requires explicit confirmation: ${relation.rationale}`,
      };
    });
  const decisionCandidates = [...ambiguityDecisions, ...relationDecisions];
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
  const execution = objectAt(prepared.execution, 'prepared.execution');
  allowedKeys(execution, 'prepared.execution', ['mode', 'writes']);
  const authorizationBoundary = objectAt(prepared.authorization, 'prepared.authorization');
  allowedKeys(authorizationBoundary, 'prepared.authorization', [
    'required', 'authorizedBy', 'maximumValidityHours', 'statement',
  ]);
  if (prepared.authorization?.authorizedBy !== 'user_only'
    || prepared.authorization.required !== true
    || prepared.authorization.maximumValidityHours !== 24
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
  const writeSurface = objectAt(prepared.permittedWriteSurface, 'prepared.permittedWriteSurface');
  allowedKeys(writeSurface, 'prepared.permittedWriteSurface', [
    'tables', 'claimThesisMappings', 'journalEntries',
  ]);
  if (JSON.stringify(prepared.permittedWriteSurface.claimThesisMappings)
    !== JSON.stringify(exactMappingColumns)
    || JSON.stringify(prepared.permittedWriteSurface.journalEntries)
    !== JSON.stringify(exactJournalColumns)
    || JSON.stringify(prepared.forbiddenAuthority) !== JSON.stringify(exactForbidden)) {
    fail('Prepared recording columns or forbidden authority do not match the exact contract');
  }
  const relationValues = arrayAt(prepared.relationCandidates, 'prepared.relationCandidates');
  const relationIds = new Set<string>();
  for (const [index, item] of relationValues.entries()) {
    const path = `prepared.relationCandidates[${index}]`;
    const candidate = objectAt(item, path) as unknown as PreparedBeliefResearchRelationRecording['relationCandidates'][number];
    allowedKeys(objectAt(item, path), path, [
      'relationId', 'sourceClaimId', 'mainClaimRef', 'claimDisposition', 'thesisId',
      'thesisType', 'relationship', 'confidence', 'rationale', 'bearingProof', 'mainClaimId',
    ]);
    nonEmptyString(candidate.relationId, `${path}.relationId`);
    if (relationIds.has(candidate.relationId)) fail('Prepared relation candidate IDs must be unique');
    relationIds.add(candidate.relationId);
    uuid(candidate.mainClaimId, `${path}.mainClaimId`);
    uuid(candidate.mainClaimRef, `${path}.mainClaimRef`);
    uuid(candidate.thesisId, `${path}.thesisId`);
    if (candidate.mainClaimId !== candidate.mainClaimRef
      || candidate.claimDisposition !== 'reuse_exact_provenance') {
      fail(`Relation ${candidate.relationId} attempts to create or substitute a claim`);
    }
    if (candidate.bearingProof.kind !== 'direct_semantic_bearing') {
      fail(`Relation ${candidate.relationId} is outside the exact semantic-bearing boundary`);
    }
  }
  const decisionValues = arrayAt(prepared.decisionCandidates, 'prepared.decisionCandidates');
  const decisionIds = new Set<string>();
  for (const [index, item] of decisionValues.entries()) {
    const path = `prepared.decisionCandidates[${index}]`;
    const candidate = objectAt(item, path) as unknown as PreparedBeliefResearchRelationRecording['decisionCandidates'][number];
    allowedKeys(objectAt(item, path), path, [
      'decisionId', 'sourceClaimId', 'relationId', 'objectType', 'objectId',
      'decisionType', 'axis', 'candidateMainClaimIds', 'candidateThesisIds',
      'candidateTheses', 'reason',
    ]);
    nonEmptyString(candidate.decisionId, `${path}.decisionId`);
    if (decisionIds.has(candidate.decisionId)) fail('Prepared Decision Item IDs must be unique');
    decisionIds.add(candidate.decisionId);
    nonEmptyString(candidate.sourceClaimId, `${path}.sourceClaimId`);
    if (candidate.relationId !== null) nonEmptyString(candidate.relationId, `${path}.relationId`);
    uuid(candidate.objectId, `${path}.objectId`);
    const mainClaimIds = uniqueStrings(candidate.candidateMainClaimIds, `${path}.candidateMainClaimIds`);
    mainClaimIds.forEach((id, candidateIndex) => uuid(id, `${path}.candidateMainClaimIds[${candidateIndex}]`));
    const thesisIds = uniqueStrings(candidate.candidateThesisIds, `${path}.candidateThesisIds`);
    thesisIds.forEach((id, candidateIndex) => uuid(id, `${path}.candidateThesisIds[${candidateIndex}]`));
    const candidateTheses = arrayAt(candidate.candidateTheses, `${path}.candidateTheses`);
    for (const [candidateIndex, thesisValue] of candidateTheses.entries()) {
      const thesisPath = `${path}.candidateTheses[${candidateIndex}]`;
      const thesis = objectAt(thesisValue, thesisPath);
      allowedKeys(thesis, thesisPath, ['id', 'type']);
      uuid(thesis.id, `${thesisPath}.id`);
      if (thesis.type !== 'macro' && thesis.type !== 'asset') fail(`${thesisPath}.type is unsupported`);
    }
    nonEmptyString(candidate.reason, `${path}.reason`);
    const ambiguityDecision = candidate.relationId === null
      && candidate.objectType === 'claim'
      && candidate.decisionType === 'confirm_claim_link'
      && (candidate.axis === 'claim_identity' || candidate.axis === 'thesis_bearing');
    const relationDecision = candidate.relationId !== null
      && (candidate.objectType === 'macro_thesis' || candidate.objectType === 'asset_thesis')
      && ((candidate.decisionType === 'review_refuting_claim' && candidate.axis === 'refuting_evidence')
        || (candidate.decisionType === 'confirm_claim_link' && candidate.axis === 'tentative_relation'));
    if (!ambiguityDecision && !relationDecision) {
      fail(`Decision ${candidate.decisionId} is outside the Decision Item surfacing boundary`);
    }
    if (JSON.stringify(candidate.candidateThesisIds)
      !== JSON.stringify(candidate.candidateTheses.map(({ id }) => id))
      || candidate.candidateTheses.some(({ type }) => type !== 'macro' && type !== 'asset')) {
      fail(`Decision ${candidate.decisionId} has inconsistent thesis identity`);
    }
    if (candidate.relationId !== null && !relationIds.has(candidate.relationId)) {
      fail(`Decision ${candidate.decisionId} references an unknown relation candidate`);
    }
    if (relationDecision) {
      const relation = prepared.relationCandidates.find(({ relationId }) => relationId === candidate.relationId);
      const expectedObjectType = relation?.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
      if (!relation || candidate.objectType !== expectedObjectType || candidate.objectId !== relation.thesisId
        || JSON.stringify(candidate.candidateMainClaimIds) !== JSON.stringify([relation.mainClaimId])
        || JSON.stringify(candidate.candidateThesisIds) !== JSON.stringify([relation.thesisId])) {
        fail(`Decision ${candidate.decisionId} does not preserve exact relationship identity`);
      }
    }
  }
  const exclusionValues = arrayAt(prepared.exclusions, 'prepared.exclusions');
  for (const [index, item] of exclusionValues.entries()) {
    const path = `prepared.exclusions[${index}]`;
    const exclusion = objectAt(item, path);
    allowedKeys(exclusion, path, ['sourceClaimId', 'reason', 'detail']);
    nonEmptyString(exclusion.sourceClaimId, `${path}.sourceClaimId`);
    if (exclusion.reason !== 'claim_publication_required' && exclusion.reason !== 'no_existing_claim_anchor') {
      fail(`${path}.reason is unsupported`);
    }
    nonEmptyString(exclusion.detail, `${path}.detail`);
  }
  for (const relation of prepared.relationCandidates) {
    const matching = prepared.decisionCandidates.filter(({ relationId }) => relationId === relation.relationId);
    const requiresRefutingReview = relation.relationship === 'refutes';
    const requiresTentativeReview = (relation.relationship === 'supports' || relation.relationship === 'foundation')
      && relation.confidence !== 'high';
    if (requiresRefutingReview
      && (matching.length !== 1 || matching[0].decisionType !== 'review_refuting_claim')) {
      fail(`Refuting relation ${relation.relationId} requires exactly one review_refuting_claim Decision Item`);
    }
    if (requiresTentativeReview
      && (matching.length !== 1 || matching[0].decisionType !== 'confirm_claim_link')) {
      fail(`Tentative relation ${relation.relationId} requires exactly one confirm_claim_link Decision Item`);
    }
    if (!requiresRefutingReview && !requiresTentativeReview && matching.length !== 0) {
      fail(`High-confidence supporting relation ${relation.relationId} cannot manufacture a Decision Item`);
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
  for (const relationId of acceptedRelationIds) {
    const requiredDecision = prepared.decisionCandidates.find((candidate) => candidate.relationId === relationId);
    if (requiredDecision && !acceptedDecisionIds.includes(requiredDecision.decisionId)) {
      fail(`Accepted relation ${relationId} must also accept its required Decision Item`);
    }
  }
  for (const decisionId of acceptedDecisionIds) {
    const candidate = prepared.decisionCandidates.find((item) => item.decisionId === decisionId);
    if (candidate?.relationId && !acceptedRelationIds.includes(candidate.relationId)) {
      fail(`Relation Decision Item ${decisionId} requires its exact relationship to be accepted`);
    }
  }
  if (acceptedRelationIds.length + acceptedDecisionIds.length === 0) fail('Authorization must accept at least one candidate');
  return {
    contractVersion: '1.0.0', type: 'belief_research_relation_authorization',
    authorizationId, authorizedBy: 'user', authorizedAt: authorizedAt.value,
    expiresAt: expiresAt.value, recordingDigest: prepared.recordingDigest,
    acceptedRelationIds, acceptedDecisionIds,
    statement: BELIEF_RESEARCH_RELATION_AUTHORIZATION_STATEMENT,
  };
}
