import { pathToFileURL } from 'node:url';
import {
  buildResearchPublication,
  digestResearchPublicationAuditSnapshot,
  digestResearchPublicationAuthorization,
  validatePreparedResearchPublication,
  validateResearchPublicationAuthorization,
  type PreparedResearchPublication,
  type ResearchPublicationAuthorization,
  type ResearchPublicationClaimCandidate,
  type ResearchPublicationRelationshipCandidate,
} from '../../src/lib/intelligence/researchPublication.js';
import {
  digestClaimsSynthesisContext,
  type ClaimsSynthesisContext,
} from '../../src/lib/intelligence/claimsSynthesis.js';

export type ResearchPublicationRecordingErrorCode =
  | 'invalid_input'
  | 'stale_input'
  | 'authority_refused'
  | 'provenance_conflict'
  | 'relationship_conflict';

export class ResearchPublicationRecordingError extends Error {
  constructor(
    public readonly code: ResearchPublicationRecordingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ResearchPublicationRecordingError';
  }
}

export interface PublicationClaimRecord {
  id: string;
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
  status: string;
  sourceInsightId: string | null;
  sourceClaimId: string | null;
}

export type PublicationClaimInsert = Omit<PublicationClaimRecord, 'id'>;

export interface PublicationMappingRecord {
  id: string;
  mainClaimId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  mappingType: 'supports' | 'refutes' | 'foundation';
  confidence: 'high' | 'medium' | 'low';
  mappedBy: string;
  notes: string;
}

export type PublicationMappingInsert = Omit<PublicationMappingRecord, 'id'>;

export interface PublishedResearchResult {
  status: 'published';
  authorizationId: string;
  batchId: string;
  publicationDigest: string;
  source: { insightId: string; contentSha256: string };
  claims: Array<{
    sourceClaimId: string;
    mainClaimRef: string;
    mainClaimId: string;
    disposition: 'created' | 'reused';
  }>;
  relationships: Array<{
    relationshipId: string;
    mappingId: string;
    mainClaimId: string;
    thesisId: string;
    thesisType: 'macro' | 'asset';
    relationship: 'supports' | 'refutes' | 'foundation';
    disposition: 'created' | 'reused';
  }>;
  journalEntryId: string;
  writes: Array<{
    table: 'main_claims' | 'claim_thesis_mappings' | 'journal_entries';
    operation: 'insert';
    count: number;
  }>;
}

type StoredPublishedResearchResult = Omit<PublishedResearchResult, 'journalEntryId'>;

export interface PublicationAuditRecord {
  id: string;
  authorizationId: string;
  authorizationDigest: string;
  publicationDigest: string;
  actionType: 'research_publication_recorded';
  result: StoredPublishedResearchResult;
  snapshotDigest: string;
  snapshot: {
    contractVersion: '1.0.0';
    kind: 'research_publication_audit';
    publicationDigest: string;
    source: PreparedResearchPublication['source'];
    claimsSynthesis: Omit<PreparedResearchPublication['claimsSynthesis'], 'result'>;
    authorization: ResearchPublicationAuthorization;
    acceptedClaims: Array<{
      candidate: ResearchPublicationClaimCandidate;
      publishedClaim: PublicationClaimRecord;
    }>;
    acceptedRelationships: Array<{
      candidate: ResearchPublicationRelationshipCandidate;
      publishedMapping: PublicationMappingRecord;
    }>;
    permittedWriteSurface: PreparedResearchPublication['permittedWriteSurface'];
  };
  recordedAt: Date;
}

export type PublicationAuditInsert = Omit<PublicationAuditRecord, 'id'>;

export interface ResearchPublicationTransaction {
  acquireAuthorizationLock(authorizationId: string): Promise<void>;
  loadCurrentContext(insightId: string): Promise<ClaimsSynthesisContext | null>;
  loadRecordedPublication(authorizationId: string): Promise<PublicationAuditRecord | null>;
  loadClaimById(id: string): Promise<PublicationClaimRecord | null>;
  loadClaimByProvenance(insightId: string, sourceClaimId: string): Promise<PublicationClaimRecord | null>;
  insertMainClaim(row: PublicationClaimInsert): Promise<PublicationClaimRecord>;
  loadClaimThesisMapping(
    mainClaimId: string,
    thesisId: string,
    thesisType: 'macro' | 'asset',
  ): Promise<PublicationMappingRecord | null>;
  insertClaimThesisMapping(row: PublicationMappingInsert): Promise<PublicationMappingRecord>;
  insertJournalEntry(row: PublicationAuditInsert): Promise<PublicationAuditRecord>;
}

export interface ResearchPublicationStore {
  transaction<T>(work: (transaction: ResearchPublicationTransaction) => Promise<T>): Promise<T>;
}

interface PublicationEnvelope {
  prepared: PreparedResearchPublication;
  authorization: Record<string, unknown>;
}

function parseEnvelope(value: unknown): PublicationEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResearchPublicationRecordingError('invalid_input', 'Publication input must be an object');
  }
  const envelope = value as Record<string, unknown>;
  const unsupported = Object.keys(envelope).filter((key) => !['prepared', 'authorization'].includes(key));
  if (unsupported.length) {
    throw new ResearchPublicationRecordingError(
      'authority_refused',
      `Publication input contains unsupported authority: ${unsupported.join(', ')}`,
    );
  }
  let prepared: PreparedResearchPublication;
  try {
    prepared = validatePreparedResearchPublication(envelope.prepared);
  } catch (error) {
    throw new ResearchPublicationRecordingError(
      'invalid_input',
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!envelope.authorization || typeof envelope.authorization !== 'object'
    || Array.isArray(envelope.authorization)) {
    throw new ResearchPublicationRecordingError('invalid_input', 'Publication authorization must be an object');
  }
  return { prepared, authorization: envelope.authorization as Record<string, unknown> };
}

function authorizationId(value: Record<string, unknown>): string {
  if (typeof value.authorizationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value.authorizationId)) {
    throw new ResearchPublicationRecordingError('invalid_input', 'authorizationId must be a UUID');
  }
  return value.authorizationId;
}

function claimInsert(
  prepared: PreparedResearchPublication,
  candidate: ResearchPublicationClaimCandidate,
): PublicationClaimInsert {
  const proposal = candidate.proposedClaim;
  if (!proposal) {
    throw new ResearchPublicationRecordingError(
      'invalid_input',
      `Create candidate ${candidate.mainClaimRef} is missing its proposal`,
    );
  }
  return {
    title: proposal.title,
    category: proposal.category,
    claim: proposal.claim,
    evidence: proposal.evidence,
    reasoning: proposal.reasoning,
    backing: proposal.backing,
    qualifier: proposal.qualifier,
    rebuttal: proposal.rebuttal,
    timeHorizon: proposal.timeHorizon,
    relevantTickers: proposal.relevantTickers,
    status: 'draft',
    sourceInsightId: prepared.source.insightId,
    sourceClaimId: candidate.sourceClaimId,
  };
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sameClaim(left: PublicationClaimRecord, right: PublicationClaimInsert): boolean {
  return left.title === right.title
    && left.category === right.category
    && left.claim === right.claim
    && sameArray(left.evidence, right.evidence)
    && left.reasoning === right.reasoning
    && left.backing === right.backing
    && left.qualifier === right.qualifier
    && sameArray(left.rebuttal, right.rebuttal)
    && left.timeHorizon === right.timeHorizon
    && sameArray(left.relevantTickers, right.relevantTickers)
    && left.status === right.status
    && left.sourceInsightId === right.sourceInsightId
    && left.sourceClaimId === right.sourceClaimId;
}

async function resolveClaim(
  transaction: ResearchPublicationTransaction,
  prepared: PreparedResearchPublication,
  candidate: ResearchPublicationClaimCandidate,
): Promise<{ record: PublicationClaimRecord; disposition: 'created' | 'reused' }> {
  if (candidate.disposition === 'reuse_existing_claim') {
    const existing = await transaction.loadClaimById(candidate.mainClaimRef);
    if (!existing
      || existing.sourceInsightId !== prepared.source.insightId
      || existing.sourceClaimId !== candidate.sourceClaimId) {
      throw new ResearchPublicationRecordingError(
        'provenance_conflict',
        `Existing claim ${candidate.mainClaimRef} no longer has exact Notes provenance`,
      );
    }
    return { record: existing, disposition: 'reused' };
  }

  const insert = claimInsert(prepared, candidate);
  const existing = await transaction.loadClaimByProvenance(
    prepared.source.insightId,
    candidate.sourceClaimId,
  );
  if (existing) {
    if (!sameClaim(existing, insert)) {
      throw new ResearchPublicationRecordingError(
        'provenance_conflict',
        `Provenance ${prepared.source.insightId}/${candidate.sourceClaimId} already identifies a different promoted claim`,
      );
    }
    return { record: existing, disposition: 'reused' };
  }
  return { record: await transaction.insertMainClaim(insert), disposition: 'created' };
}

async function resolveRelationship(
  transaction: ResearchPublicationTransaction,
  candidate: ResearchPublicationRelationshipCandidate,
  mainClaimId: string,
): Promise<{ record: PublicationMappingRecord; disposition: 'created' | 'reused' }> {
  const existing = await transaction.loadClaimThesisMapping(
    mainClaimId,
    candidate.thesisId,
    candidate.thesisType,
  );
  if (existing) {
    if (existing.mappingType !== candidate.relationship
      || existing.confidence !== candidate.confidence
      || existing.notes !== candidate.rationale) {
      throw new ResearchPublicationRecordingError(
        'relationship_conflict',
        `Claim ${mainClaimId} already has a conflicting governed relationship to thesis ${candidate.thesisId}`,
      );
    }
    return { record: existing, disposition: 'reused' };
  }
  return {
    record: await transaction.insertClaimThesisMapping({
      mainClaimId,
      thesisId: candidate.thesisId,
      thesisType: candidate.thesisType,
      mappingType: candidate.relationship,
      confidence: candidate.confidence,
      mappedBy: 'research-publication',
      notes: candidate.rationale,
    }),
    disposition: 'created',
  };
}

function restored(audit: PublicationAuditRecord): PublishedResearchResult {
  return { ...audit.result, journalEntryId: audit.id };
}

function compatibleProvenanceBaseline(
  prepared: PreparedResearchPublication,
  current: ClaimsSynthesisContext,
  acceptedClaimRefs: ReadonlySet<string>,
): ClaimsSynthesisContext | null {
  const createBySource = new Map(
    prepared.claimCandidates
      .filter((candidate) => candidate.disposition === 'create_main_claim')
      .map((candidate) => [candidate.sourceClaimId, candidate]),
  );
  const promotedIds = new Set<string>();
  for (const claim of current.existingMainClaims) {
    const candidate = claim.sourceClaimId ? createBySource.get(claim.sourceClaimId) : undefined;
    if (!candidate) continue;
    const proposal = candidate?.proposedClaim;
    if (!acceptedClaimRefs.has(candidate.mainClaimRef)
      || !proposal
      || claim.provenanceMatch !== 'exact'
      || claim.sourceInsightId !== prepared.source.insightId
      || claim.title !== proposal.title
      || claim.category !== proposal.category
      || claim.claim !== proposal.claim
      || claim.status !== 'draft') {
      return null;
    }
    promotedIds.add(claim.id);
  }
  if (promotedIds.size === 0) return null;
  const baseline = {
    ...current,
    existingMainClaims: current.existingMainClaims.filter(({ id }) => !promotedIds.has(id)),
  };
  return digestClaimsSynthesisContext(baseline) === prepared.claimsSynthesis.contextDigest
    ? baseline
    : null;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function recordResearchPublication(
  input: unknown,
  dependencies: { store: ResearchPublicationStore; now?: Date },
): Promise<PublishedResearchResult> {
  const envelope = parseEnvelope(input);
  const id = authorizationId(envelope.authorization);
  const authorizationDigest = digestResearchPublicationAuthorization(envelope.authorization);
  const now = dependencies.now ?? new Date();

  return dependencies.store.transaction(async (transaction) => {
    await transaction.acquireAuthorizationLock(id);
    const recorded = await transaction.loadRecordedPublication(id);
    if (recorded) {
      if (recorded.authorizationDigest !== authorizationDigest
        || recorded.publicationDigest !== envelope.prepared.publicationDigest
        || digestResearchPublicationAuthorization(recorded.snapshot.authorization) !== authorizationDigest
        || recorded.snapshot.publicationDigest !== envelope.prepared.publicationDigest) {
        throw new ResearchPublicationRecordingError(
          'authority_refused',
          'Authorization ID was already used for different canonical publication content',
        );
      }
      return restored(recorded);
    }

    let authorization: ResearchPublicationAuthorization;
    try {
      authorization = validateResearchPublicationAuthorization(
        envelope.prepared,
        envelope.authorization,
        now,
      );
    } catch (error) {
      throw new ResearchPublicationRecordingError('authority_refused', errorDetail(error));
    }

    const currentContext = await transaction.loadCurrentContext(envelope.prepared.source.insightId);
    if (!currentContext) {
      throw new ResearchPublicationRecordingError('stale_input', 'Current Notes-owned source is unavailable');
    }
    const acceptedClaims = new Set(authorization.acceptedClaimRefs);
    let validationContext = currentContext;
    if (digestClaimsSynthesisContext(currentContext) !== envelope.prepared.claimsSynthesis.contextDigest) {
      const baseline = compatibleProvenanceBaseline(envelope.prepared, currentContext, acceptedClaims);
      if (!baseline) {
        throw new ResearchPublicationRecordingError(
          'stale_input',
          'Repository source, promoted claims, or active thesis targets changed after preparation',
        );
      }
      validationContext = baseline;
    }
    let expected: PreparedResearchPublication;
    try {
      expected = buildResearchPublication(validationContext, envelope.prepared.claimsSynthesis.result);
    } catch (error) {
      throw new ResearchPublicationRecordingError('invalid_input', errorDetail(error));
    }
    if (expected.publicationDigest !== envelope.prepared.publicationDigest) {
      throw new ResearchPublicationRecordingError(
        'invalid_input',
        'Prepared candidates are not the deterministic publication for their claims-synthesis input',
      );
    }

    const acceptedRelationships = new Set(authorization.acceptedRelationshipIds);
    const selectedClaims = envelope.prepared.claimCandidates.filter(({ mainClaimRef }) =>
      acceptedClaims.has(mainClaimRef));
    const claimIds = new Map<string, string>();
    const claims: PublishedResearchResult['claims'] = [];
    let createdClaimCount = 0;
    const acceptedClaimSnapshots: PublicationAuditRecord['snapshot']['acceptedClaims'] = [];
    for (const candidate of selectedClaims) {
      const resolution = await resolveClaim(transaction, envelope.prepared, candidate);
      if (resolution.disposition === 'created') createdClaimCount += 1;
      claimIds.set(candidate.mainClaimRef, resolution.record.id);
      claims.push({
        sourceClaimId: candidate.sourceClaimId,
        mainClaimRef: candidate.mainClaimRef,
        mainClaimId: resolution.record.id,
        disposition: resolution.disposition,
      });
      acceptedClaimSnapshots.push({ candidate, publishedClaim: resolution.record });
    }

    const selectedRelationships = envelope.prepared.relationshipCandidates.filter(({ relationshipId }) =>
      acceptedRelationships.has(relationshipId));
    const relationships: PublishedResearchResult['relationships'] = [];
    const acceptedRelationshipSnapshots: PublicationAuditRecord['snapshot']['acceptedRelationships'] = [];
    let createdRelationshipCount = 0;
    for (const candidate of selectedRelationships) {
      const mainClaimId = claimIds.get(candidate.mainClaimRef);
      if (!mainClaimId) {
        throw new ResearchPublicationRecordingError(
          'invalid_input',
          `Relationship ${candidate.relationshipId} has no selected claim`,
        );
      }
      const resolution = await resolveRelationship(transaction, candidate, mainClaimId);
      if (resolution.disposition === 'created') createdRelationshipCount += 1;
      relationships.push({
        relationshipId: candidate.relationshipId,
        mappingId: resolution.record.id,
        mainClaimId,
        thesisId: candidate.thesisId,
        thesisType: candidate.thesisType,
        relationship: candidate.relationship,
        disposition: resolution.disposition,
      });
      acceptedRelationshipSnapshots.push({ candidate, publishedMapping: resolution.record });
    }

    const result: StoredPublishedResearchResult = {
      status: 'published',
      authorizationId: authorization.authorizationId,
      batchId: authorization.authorizationId,
      publicationDigest: envelope.prepared.publicationDigest,
      source: {
        insightId: envelope.prepared.source.insightId,
        contentSha256: envelope.prepared.source.contentSha256,
      },
      claims,
      relationships,
      writes: [
        { table: 'main_claims', operation: 'insert', count: createdClaimCount },
        { table: 'claim_thesis_mappings', operation: 'insert', count: createdRelationshipCount },
        { table: 'journal_entries', operation: 'insert', count: 1 },
      ],
    };
    const claimsSynthesis = {
      capabilityId: envelope.prepared.claimsSynthesis.capabilityId,
      capabilityVersion: envelope.prepared.claimsSynthesis.capabilityVersion,
      sourceRelease: envelope.prepared.claimsSynthesis.sourceRelease,
      packageDigest: envelope.prepared.claimsSynthesis.packageDigest,
      contextDigest: envelope.prepared.claimsSynthesis.contextDigest,
      resultDigest: envelope.prepared.claimsSynthesis.resultDigest,
    };
    const snapshot: PublicationAuditRecord['snapshot'] = {
      contractVersion: '1.0.0',
      kind: 'research_publication_audit',
      publicationDigest: envelope.prepared.publicationDigest,
      source: envelope.prepared.source,
      claimsSynthesis,
      authorization,
      acceptedClaims: acceptedClaimSnapshots,
      acceptedRelationships: acceptedRelationshipSnapshots,
      permittedWriteSurface: envelope.prepared.permittedWriteSurface,
    };
    const audit = await transaction.insertJournalEntry({
      authorizationId: authorization.authorizationId,
      authorizationDigest,
      publicationDigest: envelope.prepared.publicationDigest,
      actionType: 'research_publication_recorded',
      result,
      snapshotDigest: digestResearchPublicationAuditSnapshot(snapshot),
      snapshot,
      recordedAt: now,
    });
    return restored(audit);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log([
      'Usage:',
      '  <publication-envelope.json npx tsx scripts/ops/publish-research.ts --stdin',
      '',
      'The envelope must contain an exact prepared result and explicit user authorization token.',
      'This is the only governed research-publication mutation boundary.',
    ].join('\n'));
    return;
  }
  if (!process.argv.includes('--stdin')) {
    throw new ResearchPublicationRecordingError('invalid_input', 'pipe an authorized envelope with --stdin');
  }
  const [{ db, closeDb }, { createResearchPublicationDatabaseStore }] = await Promise.all([
    import('../lib/db.js'),
    import('./lib/research-publication-db.js'),
  ]);
  try {
    const result = await recordResearchPublication(JSON.parse(await readStdin()) as unknown, {
      store: createResearchPublicationDatabaseStore(db),
    });
    console.log(JSON.stringify(result));
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof ResearchPublicationRecordingError ? error.code : 'failed';
    console.error(JSON.stringify({ status: 'failed', code, error: errorDetail(error) }));
    process.exit(1);
  });
}
