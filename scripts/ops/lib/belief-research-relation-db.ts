import { and, eq, sql } from 'drizzle-orm';
import {
  assetTheses,
  claimThesisMappings,
  journalEntries,
  macroTheses,
  mainClaims,
} from '../../../src/db/schema.js';
import {
  digestBeliefResearchRelationAuditSnapshot,
  digestBeliefResearchRelationAuthorization,
} from '../../../src/lib/intelligence/beliefResearchRelation.js';
import { prepareBeliefResearchRelationContext } from '../../../src/lib/intelligence/beliefResearchRelationReadBoundary.js';
import { getDecisionPacket } from '../../../src/lib/types/decisions.js';
import { createBeliefResearchRelationReadRepository } from '../../lib/belief-research-relation-db.js';
import type {
  BeliefResearchRelationAuditRecord,
  BeliefResearchRelationDecisionRecord,
  BeliefResearchRelationMappingRecord,
  BeliefResearchRelationStore,
  BeliefResearchRelationTransaction,
} from '../record-belief-research-relation.js';

type Database = typeof import('../../lib/db.js').db;

function mappingRecord(
  row: {
    id: string; mainClaimId: string; macroThesisId: string | null; assetThesisId: string | null;
    mappingType: string; confidence: string | null; mappedBy: string; notes: string | null;
  },
): BeliefResearchRelationMappingRecord {
  if (!['supports', 'refutes', 'foundation'].includes(row.mappingType)
    || !['high', 'medium', 'low'].includes(row.confidence ?? '')) {
    throw new Error(`Stored claim-thesis mapping ${row.id} has unsupported semantics`);
  }
  const thesisType = row.macroThesisId ? 'macro' as const : 'asset' as const;
  const thesisId = row.macroThesisId ?? row.assetThesisId;
  if (!thesisId || (row.macroThesisId && row.assetThesisId)) {
    throw new Error(`Stored claim-thesis mapping ${row.id} has ambiguous thesis identity`);
  }
  return {
    id: row.id, mainClaimId: row.mainClaimId, thesisId, thesisType,
    mappingType: row.mappingType as BeliefResearchRelationMappingRecord['mappingType'],
    confidence: row.confidence as BeliefResearchRelationMappingRecord['confidence'],
    mappedBy: row.mappedBy, notes: row.notes ?? '',
  };
}

function decisionRecord(row: {
  id: string; objectId: string; objectTitle: string | null; metadata: unknown;
  status: string | null; timestamp: Date;
}): BeliefResearchRelationDecisionRecord {
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    throw new Error(`Decision Item ${row.id} has malformed metadata`);
  }
  const metadata = row.metadata as Record<string, unknown>;
  const packet = getDecisionPacket(metadata);
  if (!packet || packet.resolution !== null || typeof metadata.decisionId !== 'string'
    || row.status !== 'active') {
    throw new Error(`Decision Item ${row.id} is not an unresolved governed packet`);
  }
  return {
    id: row.id, decisionId: metadata.decisionId, actionType: 'decision_required',
    objectType: 'claim', objectId: row.objectId, objectTitle: row.objectTitle ?? '',
    packet, metadata, status: 'active', recordedAt: row.timestamp,
  };
}

function auditRecord(row: { id: string; timestamp: Date; metadata: unknown }): BeliefResearchRelationAuditRecord {
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    throw new Error(`Belief-research relation audit ${row.id} has malformed metadata`);
  }
  const metadata = row.metadata as Record<string, unknown>;
  if (typeof metadata.authorizationId !== 'string'
    || typeof metadata.authorizationDigest !== 'string'
    || typeof metadata.recordingDigest !== 'string'
    || typeof metadata.snapshotDigest !== 'string'
    || !metadata.result || typeof metadata.result !== 'object' || Array.isArray(metadata.result)
    || !metadata.snapshot || typeof metadata.snapshot !== 'object' || Array.isArray(metadata.snapshot)) {
    throw new Error(`Belief-research relation audit ${row.id} is incomplete`);
  }
  const snapshot = metadata.snapshot as BeliefResearchRelationAuditRecord['snapshot'];
  if (metadata.authorizationId !== snapshot.authorization.authorizationId
    || metadata.authorizationDigest !== digestBeliefResearchRelationAuthorization(snapshot.authorization)
    || metadata.recordingDigest !== snapshot.recordingDigest
    || metadata.snapshotDigest !== digestBeliefResearchRelationAuditSnapshot(snapshot)) {
    throw new Error(`Belief-research relation audit ${row.id} does not match its immutable snapshot`);
  }
  return {
    id: row.id, authorizationId: metadata.authorizationId,
    authorizationDigest: metadata.authorizationDigest, recordingDigest: metadata.recordingDigest,
    actionType: 'belief_research_relation_recorded',
    result: metadata.result as BeliefResearchRelationAuditRecord['result'],
    snapshotDigest: metadata.snapshotDigest, snapshot, recordedAt: row.timestamp,
  };
}

export function createBeliefResearchRelationDatabaseStore(db: Database): BeliefResearchRelationStore {
  return {
    async transaction(work) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await db.transaction(async (raw) => {
            const database = raw as unknown as Database;
            const transaction: BeliefResearchRelationTransaction = {
              async acquireAuthorizationLock(authorizationId) {
                await raw.execute(sql`select pg_advisory_xact_lock(hashtext(${authorizationId}))`);
              },
              async loadCurrentContext(insightId) {
                const prepared = await prepareBeliefResearchRelationContext(
                  insightId, createBeliefResearchRelationReadRepository(database),
                );
                return prepared.status === 'ready' ? prepared.context : null;
              },
              async loadRecordedOperation(authorizationId) {
                const rows = await raw.select({
                  id: journalEntries.id, timestamp: journalEntries.timestamp, metadata: journalEntries.metadata,
                }).from(journalEntries).where(and(
                  eq(journalEntries.batchId, authorizationId),
                  eq(journalEntries.actionType, 'belief_research_relation_recorded'),
                )).limit(2);
                if (rows.length > 1) throw new Error(`Authorization ${authorizationId} has multiple audits`);
                return rows[0] ? auditRecord(rows[0]) : null;
              },
              async loadClaimById(id) {
                const [row] = await raw.select({
                  id: mainClaims.id, sourceInsightId: mainClaims.sourceInsightId,
                  sourceClaimId: mainClaims.sourceClaimId,
                }).from(mainClaims).where(eq(mainClaims.id, id)).limit(1);
                return row ?? null;
              },
              async loadThesisById(id, type) {
                if (type === 'macro') {
                  const [row] = await raw.select({ id: macroTheses.id, status: macroTheses.status })
                    .from(macroTheses).where(eq(macroTheses.id, id)).limit(1);
                  return row ? { ...row, type } : null;
                }
                const [row] = await raw.select({ id: assetTheses.id, status: assetTheses.status })
                  .from(assetTheses).where(eq(assetTheses.id, id)).limit(1);
                return row ? { ...row, type } : null;
              },
              async loadClaimThesisMapping(mainClaimId, thesisId, thesisType) {
                const target = thesisType === 'macro'
                  ? claimThesisMappings.macroThesisId : claimThesisMappings.assetThesisId;
                const [row] = await raw.select({
                  id: claimThesisMappings.id, mainClaimId: claimThesisMappings.mainClaimId,
                  macroThesisId: claimThesisMappings.macroThesisId,
                  assetThesisId: claimThesisMappings.assetThesisId,
                  mappingType: claimThesisMappings.mappingType, confidence: claimThesisMappings.confidence,
                  mappedBy: claimThesisMappings.mappedBy, notes: claimThesisMappings.notes,
                }).from(claimThesisMappings).where(and(
                  eq(claimThesisMappings.mainClaimId, mainClaimId), eq(target, thesisId),
                )).limit(1);
                return row ? mappingRecord(row) : null;
              },
              async insertClaimThesisMapping(row) {
                const [inserted] = await raw.insert(claimThesisMappings).values({
                  mainClaimId: row.mainClaimId,
                  macroThesisId: row.thesisType === 'macro' ? row.thesisId : null,
                  assetThesisId: row.thesisType === 'asset' ? row.thesisId : null,
                  mappingType: row.mappingType, confidence: row.confidence,
                  mappedBy: 'belief-research-relation', notes: row.notes,
                }).returning({ id: claimThesisMappings.id });
                if (!inserted) throw new Error('Claim-thesis mapping insertion returned no row');
                return { ...row, id: inserted.id };
              },
              async loadDecisionItem(decisionId) {
                const rows = await raw.select({
                  id: journalEntries.id, objectId: journalEntries.objectId,
                  objectTitle: journalEntries.objectTitle, metadata: journalEntries.metadata,
                  status: journalEntries.status, timestamp: journalEntries.timestamp,
                }).from(journalEntries).where(and(
                  eq(journalEntries.actionType, 'decision_required'),
                  sql`${journalEntries.metadata}->>'decisionId' = ${decisionId}`,
                )).limit(2);
                if (rows.length > 1) throw new Error(`Decision identity ${decisionId} is not unique`);
                return rows[0] ? decisionRecord(rows[0]) : null;
              },
              async insertDecisionItem(row) {
                const [inserted] = await raw.insert(journalEntries).values({
                  timestamp: row.recordedAt, objectType: 'claim', objectId: row.objectId,
                  objectTitle: row.objectTitle, actionType: 'decision_required',
                  actionDescription: row.packet.why_raised, skillInvoked: 'belief-research-relation',
                  newState: { decision: row.packet }, rationale: row.packet.why_raised,
                  source: 'user', metadata: row.metadata,
                  firstDetectedAt: row.recordedAt, lastSeenAt: row.recordedAt,
                  occurrenceCount: 1, status: 'active',
                }).returning({ id: journalEntries.id });
                if (!inserted) throw new Error('Decision Item insertion returned no row');
                return { ...row, id: inserted.id };
              },
              async insertAuditEntry(row) {
                const firstClaimId = row.snapshot.acceptedRelationships[0]?.recordedMapping.mainClaimId
                  ?? row.snapshot.surfacedDecisions[0]?.decisionItem.objectId;
                if (!firstClaimId) throw new Error('Belief-research relation audit requires a claim anchor');
                const [inserted] = await raw.insert(journalEntries).values({
                  timestamp: row.recordedAt, objectType: 'claim', objectId: firstClaimId,
                  objectTitle: `Belief-research relation ${row.snapshot.source.insightId}`,
                  actionType: 'belief_research_relation_recorded',
                  actionDescription: `Recorded ${row.result.relationships.length} governed relationship(s) and surfaced ${row.result.decisions.length} Decision Item(s)`,
                  skillInvoked: 'belief-research-relation', newState: row.result,
                  rationale: 'Exact user authorization accepted for existing-claim thesis relationships and unresolved Decision Items.',
                  source: 'user', batchId: row.authorizationId,
                  metadata: {
                    authorizationId: row.authorizationId,
                    authorizationDigest: row.authorizationDigest,
                    recordingDigest: row.recordingDigest,
                    result: row.result, snapshotDigest: row.snapshotDigest, snapshot: row.snapshot,
                  },
                  firstDetectedAt: row.recordedAt, lastSeenAt: row.recordedAt,
                  occurrenceCount: 1, status: 'active',
                }).returning({ id: journalEntries.id });
                if (!inserted) throw new Error('Belief-research relation audit insertion returned no row');
                return { ...row, id: inserted.id };
              },
            };
            return work(transaction);
          }, { isolationLevel: 'serializable', accessMode: 'read write' });
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error
            ? String((error as { code: unknown }).code) : null;
          if (attempt === 2 || !['40001', '40P01', '23505'].includes(code ?? '')) throw error;
        }
      }
      throw new Error('Belief-research relation transaction retry exhausted');
    },
  };
}
