import { createHash } from 'node:crypto';
import {
  digestClaimsSynthesisContext,
  validateClaimsSynthesisResult,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisReadyResult,
  type ClaimsSynthesisSourceClaim,
} from './claimsSynthesis.js';

export const CLAIMS_SYNTHESIS_SOURCE_RELEASE = 'df1a2e3ed5860a0495f4461d747a06ea26d09aca';
export const CLAIMS_SYNTHESIS_PACKAGE_DIGEST =
  'sha256:33b24164d37a548e5b5683694c375f724f5e8c756d7a366d48ca923c4461d942';
export const RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT =
  'I explicitly authorize only the named research claims and thesis relationships for publication through the governed Trade Journal recorder.';

export interface ResearchPublicationAuthorization {
  contractVersion: '1.0.0';
  type: 'research_publication_authorization';
  authorizationId: string;
  authorizedBy: 'user';
  authorizedAt: string;
  expiresAt: string;
  publicationDigest: string;
  acceptedClaimRefs: string[];
  acceptedRelationshipIds: string[];
  statement: typeof RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT;
}

export interface ResearchPublicationClaimCandidate {
  sourceClaimId: string;
  mainClaimRef: string;
  disposition: 'reuse_existing_claim' | 'create_main_claim';
  existingMainClaimId: string | null;
  proposedClaim: (ClaimsSynthesisSourceClaim & {
    ref: string;
    synthesisRationale: string;
  }) | null;
}

export interface ResearchPublicationRelationshipCandidate {
  relationshipId: string;
  sourceClaimId: string;
  mainClaimRef: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  relationship: 'supports' | 'refutes' | 'foundation';
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface PreparedResearchPublication {
  contractVersion: '1.0.0';
  status: 'authorization_required';
  publicationDigest: string;
  source: ClaimsSynthesisContext['source'];
  claimsSynthesis: {
    capabilityId: 'capability:scope:trade-journal/claims-synthesis';
    capabilityVersion: '1.0.0';
    sourceRelease: string;
    packageDigest: string;
    contextDigest: string;
    resultDigest: string;
    result: ClaimsSynthesisReadyResult;
  };
  sourceEvidence: ClaimsSynthesisReadyResult['sourceEvidence'];
  synthesizedRecommendations: ClaimsSynthesisReadyResult['recommendations'];
  claimCandidates: ResearchPublicationClaimCandidate[];
  relationshipCandidates: ResearchPublicationRelationshipCandidate[];
  exclusions: Array<{
    sourceClaimId: string;
    reason: 'claim_identity_ambiguous' | 'thesis_mapping_ambiguous' | 'no_governed_relationship';
    detail: string;
  }>;
  authorization: {
    required: true;
    authorizedBy: 'user_only';
    maximumValidityHours: 24;
  };
  permittedWriteSurface: {
    tables: ['main_claims', 'claim_thesis_mappings', 'journal_entries'];
    mainClaims: string[];
    claimThesisMappings: string[];
    journalEntries: string[];
  };
  execution: { mode: 'authorization_required'; writes: [] };
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

export function digestResearchPublicationAuditSnapshot(value: unknown): string {
  return digest(value);
}

function authorizationObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Research publication authorization must be an object');
  }
  return value as Record<string, unknown>;
}

function exactStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0
    || !value.every((item) => typeof item === 'string' && item.length > 0)) {
    throw new Error(`${field} must be a non-empty string array`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${field} must not contain duplicates`);
  }
  return [...value];
}

function exactIsoInstant(value: unknown, field: string): { value: string; milliseconds: number } {
  if (typeof value !== 'string') throw new Error(`${field} must be an ISO-8601 instant`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO-8601 instant`);
  }
  return { value, milliseconds };
}

export function validateResearchPublicationAuthorization(
  prepared: PreparedResearchPublication,
  value: unknown,
  now = new Date(),
): ResearchPublicationAuthorization {
  const authorization = authorizationObject(value);
  const allowed = [
    'contractVersion', 'type', 'authorizationId', 'authorizedBy', 'authorizedAt',
    'expiresAt', 'publicationDigest', 'acceptedClaimRefs', 'acceptedRelationshipIds',
    'statement',
  ];
  const unsupported = Object.keys(authorization).filter((key) => !allowed.includes(key));
  if (unsupported.length) {
    throw new Error(`Research publication authorization contains unsupported authority: ${unsupported.join(', ')}`);
  }
  if (authorization.contractVersion !== '1.0.0'
    || authorization.type !== 'research_publication_authorization') {
    throw new Error('Research publication authorization must use the 1.0.0 authorization contract');
  }
  if (typeof authorization.authorizationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(authorization.authorizationId)) {
    throw new Error('authorizationId must be a UUID');
  }
  if (authorization.authorizedBy !== 'user') {
    throw new Error('Only the user may authorize research publication');
  }
  if (authorization.statement !== RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT) {
    throw new Error('Authorization statement must exactly name the bounded publication authority');
  }
  if (authorization.publicationDigest !== prepared.publicationDigest) {
    throw new Error('Authorization publicationDigest does not match the prepared publication');
  }

  const authorizedAt = exactIsoInstant(authorization.authorizedAt, 'authorizedAt');
  const expiresAt = exactIsoInstant(authorization.expiresAt, 'expiresAt');
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) throw new Error('Current validation time is invalid');
  if (authorizedAt.milliseconds > nowMilliseconds) {
    throw new Error('Authorization cannot be issued in the future');
  }
  if (expiresAt.milliseconds <= nowMilliseconds) {
    throw new Error('Research publication authorization has expired');
  }
  const maximumValidity = prepared.authorization.maximumValidityHours * 60 * 60 * 1000;
  if (expiresAt.milliseconds <= authorizedAt.milliseconds
    || expiresAt.milliseconds - authorizedAt.milliseconds > maximumValidity) {
    throw new Error(`Research publication authorization validity must not exceed ${prepared.authorization.maximumValidityHours} hours`);
  }

  const acceptedClaimRefs = exactStringArray(authorization.acceptedClaimRefs, 'acceptedClaimRefs');
  const acceptedRelationshipIds = exactStringArray(
    authorization.acceptedRelationshipIds,
    'acceptedRelationshipIds',
  );
  const candidatesByRef = new Map(prepared.claimCandidates.map((candidate) => [candidate.mainClaimRef, candidate]));
  for (const claimRef of acceptedClaimRefs) {
    if (!candidatesByRef.has(claimRef)) {
      throw new Error(`acceptedClaimRefs contains unknown publication candidate ${claimRef}`);
    }
  }
  const relationshipsById = new Map(
    prepared.relationshipCandidates.map((candidate) => [candidate.relationshipId, candidate]),
  );
  const relationshipClaimRefs = new Set<string>();
  for (const id of acceptedRelationshipIds) {
    const relationship = relationshipsById.get(id);
    if (!relationship) {
      throw new Error(`acceptedRelationshipIds contains unknown publication candidate ${id}`);
    }
    if (!acceptedClaimRefs.includes(relationship.mainClaimRef)) {
      throw new Error(`Relationship ${id} does not reference an accepted claim`);
    }
    relationshipClaimRefs.add(relationship.mainClaimRef);
  }
  if (relationshipClaimRefs.size !== acceptedClaimRefs.length
    || acceptedClaimRefs.some((claimRef) => !relationshipClaimRefs.has(claimRef))) {
    throw new Error('acceptedClaimRefs must contain exactly the claims used by accepted relationships');
  }

  return {
    contractVersion: '1.0.0',
    type: 'research_publication_authorization',
    authorizationId: authorization.authorizationId,
    authorizedBy: 'user',
    authorizedAt: authorizedAt.value,
    expiresAt: expiresAt.value,
    publicationDigest: authorization.publicationDigest as string,
    acceptedClaimRefs,
    acceptedRelationshipIds,
    statement: RESEARCH_PUBLICATION_AUTHORIZATION_STATEMENT,
  };
}

function relationshipId(
  mapping: ClaimsSynthesisReadyResult['thesisMappings'][number],
): string {
  return `relationship:${mapping.sourceClaimId}:${mapping.thesisType}:${mapping.thesisId}`;
}

export function digestResearchPublication(
  value: Omit<PreparedResearchPublication, 'publicationDigest'>,
): string {
  return digest(value);
}

export function digestResearchPublicationAuthorization(value: unknown): string {
  return digest(value);
}

export function validatePreparedResearchPublication(
  value: unknown,
): PreparedResearchPublication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Prepared research publication must be an object');
  }
  const prepared = value as Record<string, unknown>;
  const allowed = [
    'contractVersion', 'status', 'publicationDigest', 'source', 'claimsSynthesis',
    'sourceEvidence', 'synthesizedRecommendations', 'claimCandidates',
    'relationshipCandidates', 'exclusions', 'authorization', 'permittedWriteSurface',
    'execution',
  ];
  const unsupported = Object.keys(prepared).filter((key) => !allowed.includes(key));
  if (unsupported.length) {
    throw new Error(`Prepared research publication contains unsupported fields: ${unsupported.join(', ')}`);
  }
  if (prepared.contractVersion !== '1.0.0' || prepared.status !== 'authorization_required') {
    throw new Error('Prepared research publication must use the authorization-required 1.0.0 contract');
  }
  if (typeof prepared.publicationDigest !== 'string') {
    throw new Error('Prepared research publication is missing publicationDigest');
  }
  const { publicationDigest, ...withoutDigest } = prepared;
  if (publicationDigest !== digestResearchPublication(
    withoutDigest as Omit<PreparedResearchPublication, 'publicationDigest'>,
  )) {
    throw new Error('Prepared research publication digest does not match its canonical JSON content');
  }
  return value as PreparedResearchPublication;
}

export function digestClaimsSynthesisResult(result: ClaimsSynthesisReadyResult): string {
  return digest(result);
}

export function buildResearchPublication(
  context: ClaimsSynthesisContext,
  resultInput: unknown,
): PreparedResearchPublication {
  const result = validateClaimsSynthesisResult(context, resultInput);
  const ambiguitiesBySource = new Map<string, ClaimsSynthesisReadyResult['ambiguities']>();
  for (const ambiguity of result.ambiguities) {
    const ambiguities = ambiguitiesBySource.get(ambiguity.sourceClaimId) ?? [];
    ambiguities.push(ambiguity);
    ambiguitiesBySource.set(ambiguity.sourceClaimId, ambiguities);
  }
  const mappingsBySource = new Map<string, ClaimsSynthesisReadyResult['thesisMappings']>();
  for (const mapping of result.thesisMappings) {
    const mappings = mappingsBySource.get(mapping.sourceClaimId) ?? [];
    mappings.push(mapping);
    mappingsBySource.set(mapping.sourceClaimId, mappings);
  }

  const reusableBySource = new Map(result.existingMainClaims.map((claim) => [claim.sourceClaimId, claim]));
  const synthesizedBySource = new Map(
    result.synthesizedInvestmentClaims.map((claim) => [claim.sourceClaimId, claim]),
  );
  const claimCandidates: ResearchPublicationClaimCandidate[] = [];
  const relationshipCandidates: ResearchPublicationRelationshipCandidate[] = [];
  const exclusions: PreparedResearchPublication['exclusions'] = [];

  for (const evidence of result.sourceEvidence) {
    const ambiguities = ambiguitiesBySource.get(evidence.sourceClaimId) ?? [];
    if (ambiguities.length > 0) {
      exclusions.push(...ambiguities.map((ambiguity) => ({
        sourceClaimId: evidence.sourceClaimId,
        reason: ambiguity.axis === 'claim_identity'
          ? 'claim_identity_ambiguous' as const
          : 'thesis_mapping_ambiguous' as const,
        detail: ambiguity.reason,
      })));
      continue;
    }

    const mappings = mappingsBySource.get(evidence.sourceClaimId) ?? [];
    const reusable = reusableBySource.get(evidence.sourceClaimId);
    const synthesized = synthesizedBySource.get(evidence.sourceClaimId);
    const mainClaimRef = reusable?.mainClaimId ?? synthesized?.ref;
    if (!mainClaimRef || mappings.length === 0) {
      exclusions.push({
        sourceClaimId: evidence.sourceClaimId,
        reason: 'no_governed_relationship',
        detail: 'Publication requires an unambiguous claim resolution with at least one governed thesis relationship.',
      });
      continue;
    }

    claimCandidates.push({
      sourceClaimId: evidence.sourceClaimId,
      mainClaimRef,
      disposition: reusable ? 'reuse_existing_claim' : 'create_main_claim',
      existingMainClaimId: reusable?.mainClaimId ?? null,
      proposedClaim: synthesized ?? null,
    });
    for (const mapping of mappings) {
      relationshipCandidates.push({
        relationshipId: relationshipId(mapping),
        ...mapping,
      });
    }
  }

  if (claimCandidates.length === 0 || relationshipCandidates.length === 0) {
    throw new Error('Research publication has no unambiguous thesis-related claims ready for authorization');
  }

  const withoutDigest: Omit<PreparedResearchPublication, 'publicationDigest'> = {
    contractVersion: '1.0.0',
    status: 'authorization_required',
    source: context.source,
    claimsSynthesis: {
      capabilityId: 'capability:scope:trade-journal/claims-synthesis',
      capabilityVersion: '1.0.0',
      sourceRelease: CLAIMS_SYNTHESIS_SOURCE_RELEASE,
      packageDigest: CLAIMS_SYNTHESIS_PACKAGE_DIGEST,
      contextDigest: digestClaimsSynthesisContext(context),
      resultDigest: digestClaimsSynthesisResult(result),
      result,
    },
    sourceEvidence: result.sourceEvidence,
    synthesizedRecommendations: result.recommendations,
    claimCandidates,
    relationshipCandidates,
    exclusions,
    authorization: {
      required: true,
      authorizedBy: 'user_only',
      maximumValidityHours: 24,
    },
    permittedWriteSurface: {
      tables: ['main_claims', 'claim_thesis_mappings', 'journal_entries'],
      mainClaims: [
        'title', 'category', 'claim', 'evidence', 'reasoning', 'backing', 'qualifier',
        'rebuttal', 'time_horizon', 'relevant_tickers', 'status', 'source_insight_id',
        'source_claim_id',
      ],
      claimThesisMappings: [
        'main_claim_id', 'macro_thesis_id', 'asset_thesis_id', 'mapping_type',
        'confidence', 'mapped_by', 'notes',
      ],
      journalEntries: [
        'object_type', 'object_id', 'object_title', 'action_type', 'action_description',
        'skill_invoked', 'new_state', 'rationale', 'source', 'metadata', 'batch_id',
        'first_detected_at', 'last_seen_at', 'occurrence_count', 'status',
      ],
    },
    execution: { mode: 'authorization_required', writes: [] },
  };

  return {
    ...withoutDigest,
    publicationDigest: digestResearchPublication(withoutDigest),
  };
}
