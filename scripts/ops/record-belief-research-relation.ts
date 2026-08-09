import { pathToFileURL } from 'node:url';
import {
  digestBeliefResearchRelationAuditSnapshot,
  digestBeliefResearchRelationAuthorization,
  digestBeliefResearchRelationContext,
  prepareBeliefResearchRelationRecording,
  validateBeliefResearchRelationResult,
  validateBeliefResearchRelationRecordingAuthorization,
  validatePreparedBeliefResearchRelationRecording,
  type BeliefResearchRelationContext,
  type BeliefResearchRelationRecordingAuthorization,
  type PreparedBeliefResearchRelationRecording,
} from '../../src/lib/intelligence/beliefResearchRelation.js';
import { buildDecisionPacket, type DecisionPacket } from '../../src/lib/types/decisions.js';

export type BeliefResearchRelationRecordingErrorCode =
  | 'invalid_input'
  | 'stale_input'
  | 'authority_refused'
  | 'provenance_conflict'
  | 'relationship_conflict'
  | 'decision_conflict';

export class BeliefResearchRelationRecordingError extends Error {
  constructor(
    public readonly code: BeliefResearchRelationRecordingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BeliefResearchRelationRecordingError';
  }
}

export interface BeliefResearchRelationMappingRecord {
  id: string;
  mainClaimId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  mappingType: 'supports' | 'refutes' | 'foundation';
  confidence: 'high' | 'medium' | 'low';
  mappedBy: string;
  notes: string;
}

export type BeliefResearchRelationMappingInsert = Omit<BeliefResearchRelationMappingRecord, 'id'>;

export interface BeliefResearchRelationDecisionRecord {
  id: string;
  decisionId: string;
  actionType: 'decision_required';
  objectType: 'claim' | 'macro_thesis' | 'asset_thesis';
  objectId: string;
  objectTitle: string;
  packet: DecisionPacket;
  metadata: Record<string, unknown>;
  status: 'active';
  recordedAt: Date;
}

export type BeliefResearchRelationDecisionInsert = Omit<BeliefResearchRelationDecisionRecord, 'id'>;

export interface RecordedBeliefResearchRelation {
  status: 'recorded';
  authorizationId: string;
  batchId: string;
  recordingDigest: string;
  source: { insightId: string; contentSha256: string };
  relationships: Array<{
    relationId: string;
    mappingId: string;
    mainClaimId: string;
    thesisId: string;
    thesisType: 'macro' | 'asset';
    relationship: 'supports' | 'refutes' | 'foundation';
    disposition: 'created' | 'reused';
  }>;
  decisions: Array<{
    decisionId: string;
    journalEntryId: string;
    disposition: 'created' | 'reused';
  }>;
  journalEntryId: string;
  writes: Array<{
    table: 'claim_thesis_mappings' | 'journal_entries';
    operation: 'insert';
    count: number;
  }>;
}

type StoredBeliefResearchRelationResult = Omit<RecordedBeliefResearchRelation, 'journalEntryId'>;

export interface BeliefResearchRelationAuditRecord {
  id: string;
  authorizationId: string;
  authorizationDigest: string;
  recordingDigest: string;
  actionType: 'belief_research_relation_recorded';
  result: StoredBeliefResearchRelationResult;
  snapshotDigest: string;
  snapshot: {
    contractVersion: '1.0.0';
    kind: 'belief_research_relation_audit';
    recordingDigest: string;
    contextDigest: string;
    resultDigest: string;
    source: PreparedBeliefResearchRelationRecording['source'];
    sourceEvidence: BeliefResearchRelationContext['sourceEvidence'];
    claimIdentities: BeliefResearchRelationContext['mainClaimCatalog'];
    thesisArguments: BeliefResearchRelationContext['thesisTargets'];
    authorization: BeliefResearchRelationRecordingAuthorization;
    acceptedRelationships: Array<{
      candidate: PreparedBeliefResearchRelationRecording['relationCandidates'][number];
      recordedMapping: BeliefResearchRelationMappingRecord;
    }>;
    surfacedDecisions: Array<{
      candidate: PreparedBeliefResearchRelationRecording['decisionCandidates'][number];
      decisionItem: BeliefResearchRelationDecisionRecord;
    }>;
    exclusions: PreparedBeliefResearchRelationRecording['exclusions'];
    permittedWriteSurface: PreparedBeliefResearchRelationRecording['permittedWriteSurface'];
    forbiddenAuthority: PreparedBeliefResearchRelationRecording['forbiddenAuthority'];
  };
  recordedAt: Date;
}

export type BeliefResearchRelationAuditInsert = Omit<BeliefResearchRelationAuditRecord, 'id'>;

export interface BeliefResearchRelationTransaction {
  acquireAuthorizationLock(authorizationId: string): Promise<void>;
  loadCurrentContext(insightId: string): Promise<BeliefResearchRelationContext | null>;
  loadRecordedOperation(authorizationId: string): Promise<BeliefResearchRelationAuditRecord | null>;
  loadClaimById(id: string): Promise<{
    id: string; sourceInsightId: string | null; sourceClaimId: string | null;
  } | null>;
  loadThesisById(
    id: string,
    type: 'macro' | 'asset',
  ): Promise<{ id: string; type: 'macro' | 'asset'; status: string } | null>;
  loadClaimThesisMapping(
    mainClaimId: string,
    thesisId: string,
    thesisType: 'macro' | 'asset',
  ): Promise<BeliefResearchRelationMappingRecord | null>;
  insertClaimThesisMapping(
    row: BeliefResearchRelationMappingInsert,
  ): Promise<BeliefResearchRelationMappingRecord>;
  loadDecisionItem(decisionId: string): Promise<BeliefResearchRelationDecisionRecord | null>;
  insertDecisionItem(
    row: BeliefResearchRelationDecisionInsert,
  ): Promise<BeliefResearchRelationDecisionRecord>;
  insertAuditEntry(row: BeliefResearchRelationAuditInsert): Promise<BeliefResearchRelationAuditRecord>;
}

export interface BeliefResearchRelationStore {
  transaction<T>(work: (transaction: BeliefResearchRelationTransaction) => Promise<T>): Promise<T>;
}

interface RecordingEnvelope {
  prepared: PreparedBeliefResearchRelationRecording;
  authorization: Record<string, unknown>;
}

function parseEnvelope(value: unknown): RecordingEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BeliefResearchRelationRecordingError('invalid_input', 'Recording input must be an object');
  }
  const envelope = value as Record<string, unknown>;
  const unsupported = Object.keys(envelope).filter((key) => !['prepared', 'authorization'].includes(key));
  if (unsupported.length) {
    throw new BeliefResearchRelationRecordingError(
      'authority_refused', `Recording input contains unsupported authority: ${unsupported.join(', ')}`,
    );
  }
  let prepared: PreparedBeliefResearchRelationRecording;
  try {
    prepared = validatePreparedBeliefResearchRelationRecording(envelope.prepared);
  } catch (error) {
    throw new BeliefResearchRelationRecordingError(
      'invalid_input', error instanceof Error ? error.message : String(error),
    );
  }
  if (!envelope.authorization || typeof envelope.authorization !== 'object'
    || Array.isArray(envelope.authorization)) {
    throw new BeliefResearchRelationRecordingError('invalid_input', 'Recording authorization must be an object');
  }
  return { prepared, authorization: envelope.authorization as Record<string, unknown> };
}

function authorizationId(value: Record<string, unknown>): string {
  if (typeof value.authorizationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.authorizationId)) {
    throw new BeliefResearchRelationRecordingError('invalid_input', 'authorizationId must be a UUID');
  }
  return value.authorizationId;
}

function samePacket(left: DecisionPacket, right: DecisionPacket): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function decisionInsert(
  prepared: PreparedBeliefResearchRelationRecording,
  candidate: PreparedBeliefResearchRelationRecording['decisionCandidates'][number],
  recordedAt: Date,
): BeliefResearchRelationDecisionInsert {
  const packet = buildDecisionPacket({
    decision_type: candidate.decisionType,
    why_raised: candidate.reason,
    related_objects: [
      ...candidate.candidateMainClaimIds.map((id) => ({ type: 'claim' as const, id, role: 'candidate_claim' })),
      ...candidate.candidateTheses.map(({ id, type }) => ({
        type: (type === 'macro' ? 'macro_thesis' : 'asset_thesis') as 'macro_thesis' | 'asset_thesis',
        id, role: 'candidate_thesis',
      })),
    ],
    evidence_context: {
      insightId: prepared.source.insightId,
      sourceClaimId: candidate.sourceClaimId,
      ambiguityAxis: candidate.axis,
      relationId: candidate.relationId,
      candidateMainClaimIds: candidate.candidateMainClaimIds,
      candidateThesisIds: candidate.candidateThesisIds,
      recordingDigest: prepared.recordingDigest,
    },
    recommended_actions: candidate.decisionType === 'review_refuting_claim'
      ? [
          { action: 'review_evidence', label: 'Review the refuting evidence' },
          { action: 'dismissed', label: 'Dismiss after explicit review' },
        ]
      : [
          { action: 'confirm_link', label: 'Confirm a governed claim-thesis link' },
          { action: 'dismissed', label: 'Leave unrelated' },
        ],
  });
  return {
    decisionId: candidate.decisionId,
    actionType: 'decision_required', objectType: candidate.objectType, objectId: candidate.objectId,
    objectTitle: `Research bearing requires judgment: ${candidate.sourceClaimId}`,
    packet,
    metadata: {
      decisionId: candidate.decisionId,
      insightId: prepared.source.insightId,
      sourceClaimId: candidate.sourceClaimId,
      recordingDigest: prepared.recordingDigest,
      decision: packet,
    },
    status: 'active', recordedAt,
  };
}

async function resolveMapping(
  transaction: BeliefResearchRelationTransaction,
  candidate: PreparedBeliefResearchRelationRecording['relationCandidates'][number],
): Promise<{ record: BeliefResearchRelationMappingRecord; disposition: 'created' | 'reused' }> {
  const existing = await transaction.loadClaimThesisMapping(
    candidate.mainClaimId, candidate.thesisId, candidate.thesisType,
  );
  if (existing) {
    if (existing.mappingType !== candidate.relationship
      || existing.confidence !== candidate.confidence
      || existing.notes !== candidate.rationale) {
      throw new BeliefResearchRelationRecordingError(
        'relationship_conflict',
        `Claim ${candidate.mainClaimId} already has a conflicting relationship to thesis ${candidate.thesisId}`,
      );
    }
    return { record: existing, disposition: 'reused' };
  }
  const record = await transaction.insertClaimThesisMapping({
    mainClaimId: candidate.mainClaimId, thesisId: candidate.thesisId,
    thesisType: candidate.thesisType, mappingType: candidate.relationship,
    confidence: candidate.confidence, mappedBy: 'belief-research-relation', notes: candidate.rationale,
  });
  return { record, disposition: 'created' };
}

async function resolveDecision(
  transaction: BeliefResearchRelationTransaction,
  prepared: PreparedBeliefResearchRelationRecording,
  candidate: PreparedBeliefResearchRelationRecording['decisionCandidates'][number],
  recordedAt: Date,
): Promise<{ record: BeliefResearchRelationDecisionRecord; disposition: 'created' | 'reused' }> {
  const insert = decisionInsert(prepared, candidate, recordedAt);
  const existing = await transaction.loadDecisionItem(candidate.decisionId);
  if (existing) {
    if (existing.actionType !== 'decision_required' || existing.status !== 'active'
      || existing.objectType !== insert.objectType || existing.objectId !== insert.objectId
      || !samePacket(existing.packet, insert.packet)) {
      throw new BeliefResearchRelationRecordingError(
        'decision_conflict', `Decision Item ${candidate.decisionId} already exists with different semantics`,
      );
    }
    return { record: existing, disposition: 'reused' };
  }
  return { record: await transaction.insertDecisionItem(insert), disposition: 'created' };
}

export async function recordBeliefResearchRelation(
  input: unknown,
  dependencies: { store: BeliefResearchRelationStore; now?: Date },
): Promise<RecordedBeliefResearchRelation> {
  const envelope = parseEnvelope(input);
  const id = authorizationId(envelope.authorization);
  const incomingAuthorizationDigest = digestBeliefResearchRelationAuthorization(envelope.authorization);
  const now = dependencies.now ?? new Date();
  return dependencies.store.transaction(async (transaction) => {
    await transaction.acquireAuthorizationLock(id);
    const prior = await transaction.loadRecordedOperation(id);
    if (prior) {
      if (prior.recordingDigest !== envelope.prepared.recordingDigest
        || prior.authorizationDigest !== incomingAuthorizationDigest
        || digestBeliefResearchRelationAuthorization(prior.snapshot.authorization)
          !== incomingAuthorizationDigest) {
        throw new BeliefResearchRelationRecordingError(
          'authority_refused', `Authorization ${id} is already bound to different bytes`,
        );
      }
      return { ...prior.result, journalEntryId: prior.id };
    }

    let authorization: BeliefResearchRelationRecordingAuthorization;
    try {
      authorization = validateBeliefResearchRelationRecordingAuthorization(
        envelope.prepared, envelope.authorization, now,
      );
    } catch (error) {
      throw new BeliefResearchRelationRecordingError(
        'invalid_input', error instanceof Error ? error.message : String(error),
      );
    }

    const current = await transaction.loadCurrentContext(envelope.prepared.source.insightId);
    if (!current
      || digestBeliefResearchRelationContext(current) !== envelope.prepared.contextDigest) {
      throw new BeliefResearchRelationRecordingError(
        'stale_input', 'Repository state no longer matches the authorized context digest',
      );
    }
    let rederived: PreparedBeliefResearchRelationRecording;
    try {
      rederived = prepareBeliefResearchRelationRecording(
        current,
        validateBeliefResearchRelationResult(current, envelope.prepared.result),
      );
    } catch (error) {
      throw new BeliefResearchRelationRecordingError(
        'invalid_input', error instanceof Error ? error.message : String(error),
      );
    }
    if (rederived.recordingDigest !== envelope.prepared.recordingDigest) {
      throw new BeliefResearchRelationRecordingError(
        'invalid_input', 'Prepared candidates do not match deterministic derivation from the validated result',
      );
    }

    const acceptedRelations = envelope.prepared.relationCandidates.filter(({ relationId }) =>
      authorization.acceptedRelationIds.includes(relationId));
    const acceptedDecisions = envelope.prepared.decisionCandidates.filter(({ decisionId }) =>
      authorization.acceptedDecisionIds.includes(decisionId));
    for (const candidate of acceptedRelations) {
      const claim = await transaction.loadClaimById(candidate.mainClaimId);
      if (!claim || claim.sourceInsightId !== current.source.insightId
        || claim.sourceClaimId !== candidate.sourceClaimId) {
        throw new BeliefResearchRelationRecordingError(
          'provenance_conflict', `Claim ${candidate.mainClaimId} no longer has exact Notes provenance`,
        );
      }
      const thesis = await transaction.loadThesisById(candidate.thesisId, candidate.thesisType);
      if (!thesis || (thesis.status !== 'developing' && thesis.status !== 'monitoring')) {
        throw new BeliefResearchRelationRecordingError(
          'stale_input', `Thesis ${candidate.thesisId} is no longer an eligible active thesis`,
        );
      }
    }
    for (const candidate of acceptedDecisions) {
      for (const claimId of candidate.candidateMainClaimIds) {
        const claim = await transaction.loadClaimById(claimId);
        if (!claim) {
          throw new BeliefResearchRelationRecordingError(
            'stale_input', `Decision Item claim candidate ${claimId} is unavailable`,
          );
        }
      }
      if (candidate.objectType === 'claim') {
        const claim = await transaction.loadClaimById(candidate.objectId);
        if (!claim) {
          throw new BeliefResearchRelationRecordingError(
            'stale_input', `Decision Item claim anchor ${candidate.objectId} is unavailable`,
          );
        }
      }
      for (const thesisCandidate of candidate.candidateTheses) {
        const thesis = await transaction.loadThesisById(thesisCandidate.id, thesisCandidate.type);
        if (!thesis || (thesis.status !== 'developing' && thesis.status !== 'monitoring')) {
          throw new BeliefResearchRelationRecordingError(
            'stale_input', `Decision Item thesis candidate ${thesisCandidate.id} is no longer eligible`,
          );
        }
      }
    }

    const relationshipRecords = [];
    for (const candidate of acceptedRelations) {
      relationshipRecords.push({ candidate, ...(await resolveMapping(transaction, candidate)) });
    }
    const decisionRecords = [];
    for (const candidate of acceptedDecisions) {
      decisionRecords.push({
        candidate,
        ...(await resolveDecision(transaction, envelope.prepared, candidate, now)),
      });
    }

    const mappingWrites = relationshipRecords.filter(({ disposition }) => disposition === 'created').length;
    const decisionWrites = decisionRecords.filter(({ disposition }) => disposition === 'created').length;
    const storedResult: StoredBeliefResearchRelationResult = {
      status: 'recorded', authorizationId: authorization.authorizationId,
      batchId: authorization.authorizationId, recordingDigest: envelope.prepared.recordingDigest,
      source: {
        insightId: envelope.prepared.source.insightId,
        contentSha256: envelope.prepared.source.contentSha256,
      },
      relationships: relationshipRecords.map(({ candidate, record, disposition }) => ({
        relationId: candidate.relationId, mappingId: record.id, mainClaimId: record.mainClaimId,
        thesisId: record.thesisId, thesisType: record.thesisType,
        relationship: record.mappingType, disposition,
      })),
      decisions: decisionRecords.map(({ candidate, record, disposition }) => ({
        decisionId: candidate.decisionId, journalEntryId: record.id, disposition,
      })),
      writes: [
        { table: 'claim_thesis_mappings', operation: 'insert', count: mappingWrites },
        { table: 'journal_entries', operation: 'insert', count: decisionWrites + 1 },
      ],
    };
    const snapshot: BeliefResearchRelationAuditRecord['snapshot'] = {
      contractVersion: '1.0.0', kind: 'belief_research_relation_audit',
      recordingDigest: envelope.prepared.recordingDigest,
      contextDigest: envelope.prepared.contextDigest,
      resultDigest: envelope.prepared.resultDigest,
      source: envelope.prepared.source,
      sourceEvidence: current.sourceEvidence,
      claimIdentities: current.mainClaimCatalog.filter(({ id: claimId }) =>
        acceptedRelations.some(({ mainClaimId }) => mainClaimId === claimId)
        || acceptedDecisions.some(({ candidateMainClaimIds, objectId }) =>
          objectId === claimId || candidateMainClaimIds.includes(claimId))),
      thesisArguments: current.thesisTargets.filter(({ id: thesisId }) =>
        acceptedRelations.some(({ thesisId: relationThesisId }) => relationThesisId === thesisId)
        || acceptedDecisions.some(({ candidateThesisIds }) => candidateThesisIds.includes(thesisId))),
      authorization,
      acceptedRelationships: relationshipRecords.map(({ candidate, record }) => ({
        candidate, recordedMapping: record,
      })),
      surfacedDecisions: decisionRecords.map(({ candidate, record }) => ({
        candidate, decisionItem: record,
      })),
      exclusions: envelope.prepared.exclusions,
      permittedWriteSurface: envelope.prepared.permittedWriteSurface,
      forbiddenAuthority: envelope.prepared.forbiddenAuthority,
    };
    const audit = await transaction.insertAuditEntry({
      authorizationId: authorization.authorizationId,
      authorizationDigest: digestBeliefResearchRelationAuthorization(authorization),
      recordingDigest: envelope.prepared.recordingDigest,
      actionType: 'belief_research_relation_recorded', result: storedResult,
      snapshotDigest: digestBeliefResearchRelationAuditSnapshot(snapshot), snapshot, recordedAt: now,
    });
    return { ...storedResult, journalEntryId: audit.id };
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
      '  <authorized-envelope.json npx tsx scripts/ops/record-belief-research-relation.ts --stdin',
      '',
      'The envelope must contain the exact prepared recording and explicit user authorization.',
      'This is the only governed belief-research relation mutation boundary.',
      'It can insert only claim_thesis_mappings and unresolved/audit journal_entries.',
    ].join('\n'));
    return;
  }
  if (!process.argv.includes('--stdin') || process.argv.some((arg) =>
    arg.startsWith('--') && arg !== '--stdin')) {
    throw new BeliefResearchRelationRecordingError(
      'authority_refused', 'pipe one authorized envelope with --stdin; no other mutation mode exists',
    );
  }
  const [{ db, closeDb }, { createBeliefResearchRelationDatabaseStore }] = await Promise.all([
    import('../lib/db.js'), import('./lib/belief-research-relation-db.js'),
  ]);
  try {
    const result = await recordBeliefResearchRelation(JSON.parse(await readStdin()) as unknown, {
      store: createBeliefResearchRelationDatabaseStore(db),
    });
    console.log(JSON.stringify(result));
  } finally { await closeDb(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof BeliefResearchRelationRecordingError ? error.code : 'failed';
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'failed', code, error: message }));
    process.exit(1);
  });
}
