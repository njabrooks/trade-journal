import { and, eq, sql } from 'drizzle-orm';
import {
  claimThesisMappings,
  journalEntries,
  mainClaims,
} from '../../../src/db/schema.js';
import { prepareClaimsSynthesisContext } from '../../../src/lib/intelligence/claimsSynthesisReadBoundary.js';
import {
  digestResearchPublicationAuthorization,
  validatePreparedResearchPublication,
  validateResearchPublicationAuthorization,
} from '../../../src/lib/intelligence/researchPublication.js';
import { createClaimsSynthesisReadRepository } from '../../lib/claims-synthesis-db.js';
import type {
  PublicationAuditRecord,
  PublicationClaimRecord,
  PublicationMappingRecord,
  ResearchPublicationStore,
  ResearchPublicationTransaction,
} from '../publish-research.js';

type Database = typeof import('../../lib/db.js').db;

const claimSelection = {
  id: mainClaims.id,
  title: mainClaims.title,
  category: mainClaims.category,
  claim: mainClaims.claim,
  evidence: mainClaims.evidence,
  reasoning: mainClaims.reasoning,
  backing: mainClaims.backing,
  qualifier: mainClaims.qualifier,
  rebuttal: mainClaims.rebuttal,
  timeHorizon: mainClaims.timeHorizon,
  relevantTickers: mainClaims.relevantTickers,
  status: mainClaims.status,
  sourceInsightId: mainClaims.sourceInsightId,
  sourceClaimId: mainClaims.sourceClaimId,
};

function claimRecord(row: typeof mainClaims.$inferSelect): PublicationClaimRecord {
  if (row.category !== 'macro' && row.category !== 'asset_specific') {
    throw new Error(`Stored claim ${row.id} has unsupported category ${row.category}`);
  }
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    claim: row.claim,
    evidence: row.evidence ?? [],
    reasoning: row.reasoning,
    backing: row.backing,
    qualifier: row.qualifier,
    rebuttal: row.rebuttal ?? [],
    timeHorizon: row.timeHorizon,
    relevantTickers: row.relevantTickers ?? [],
    status: row.status,
    sourceInsightId: row.sourceInsightId,
    sourceClaimId: row.sourceClaimId,
  };
}

function auditRecord(row: { id: string; timestamp: Date; metadata: unknown }): PublicationAuditRecord {
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    throw new Error(`Research publication audit ${row.id} has malformed metadata`);
  }
  const metadata = row.metadata as Record<string, unknown>;
  if (typeof metadata.authorizationId !== 'string'
    || typeof metadata.authorizationDigest !== 'string'
    || typeof metadata.publicationDigest !== 'string'
    || !metadata.result || typeof metadata.result !== 'object' || Array.isArray(metadata.result)
    || !metadata.envelope || typeof metadata.envelope !== 'object' || Array.isArray(metadata.envelope)) {
    throw new Error(`Research publication audit ${row.id} is incomplete`);
  }
  const envelope = metadata.envelope as Record<string, unknown>;
  const prepared = validatePreparedResearchPublication(envelope.prepared);
  const rawAuthorization = envelope.authorization as Record<string, unknown> | null;
  const authorizedAt = rawAuthorization && typeof rawAuthorization.authorizedAt === 'string'
    ? new Date(rawAuthorization.authorizedAt)
    : new Date(Number.NaN);
  const authorization = validateResearchPublicationAuthorization(
    prepared,
    envelope.authorization,
    authorizedAt,
  );
  if (metadata.authorizationId !== authorization.authorizationId
    || metadata.authorizationDigest !== digestResearchPublicationAuthorization(authorization)
    || metadata.publicationDigest !== prepared.publicationDigest) {
    throw new Error(`Research publication audit ${row.id} does not match its immutable envelope`);
  }
  const result = metadata.result as PublicationAuditRecord['result'];
  if (result.authorizationId !== authorization.authorizationId
    || result.publicationDigest !== prepared.publicationDigest) {
    throw new Error(`Research publication audit ${row.id} result does not match its authorization`);
  }
  return {
    id: row.id,
    authorizationId: metadata.authorizationId,
    authorizationDigest: metadata.authorizationDigest,
    publicationDigest: metadata.publicationDigest,
    actionType: 'research_publication_recorded',
    result,
    envelope: { prepared, authorization },
    recordedAt: row.timestamp,
  };
}

export function createResearchPublicationDatabaseStore(db: Database): ResearchPublicationStore {
  return {
    async transaction(work) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await db.transaction(async (tx) => {
        const database = tx as unknown as Database;
        const transaction: ResearchPublicationTransaction = {
          async acquireAuthorizationLock(authorizationId) {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authorizationId}))`);
          },
          async loadCurrentContext(insightId) {
            const prepared = await prepareClaimsSynthesisContext(
              insightId,
              createClaimsSynthesisReadRepository(database),
            );
            return prepared.status === 'ready' ? prepared.context : null;
          },
          async loadRecordedPublication(authorizationId) {
            const rows = await tx.select({
              id: journalEntries.id,
              timestamp: journalEntries.timestamp,
              metadata: journalEntries.metadata,
            }).from(journalEntries).where(and(
              eq(journalEntries.batchId, authorizationId),
              eq(journalEntries.actionType, 'research_publication_recorded'),
            )).limit(2);
            if (rows.length > 1) {
              throw new Error(`Authorization ${authorizationId} has multiple publication audits`);
            }
            return rows[0] ? auditRecord(rows[0]) : null;
          },
          async loadClaimById(id) {
            const [row] = await tx.select(claimSelection).from(mainClaims)
              .where(eq(mainClaims.id, id)).limit(1);
            return row ? claimRecord(row as typeof mainClaims.$inferSelect) : null;
          },
          async loadClaimByProvenance(insightId, sourceClaimId) {
            const rows = await tx.select(claimSelection).from(mainClaims).where(and(
              eq(mainClaims.sourceInsightId, insightId),
              eq(mainClaims.sourceClaimId, sourceClaimId),
            )).limit(2);
            if (rows.length > 1) {
              throw new Error(`Provenance ${insightId}/${sourceClaimId} is not unique`);
            }
            return rows[0] ? claimRecord(rows[0] as typeof mainClaims.$inferSelect) : null;
          },
          async insertMainClaim(row) {
            const [inserted] = await tx.insert(mainClaims).values({
              title: row.title,
              category: row.category,
              claim: row.claim,
              evidence: row.evidence,
              reasoning: row.reasoning,
              backing: row.backing,
              qualifier: row.qualifier,
              rebuttal: row.rebuttal,
              timeHorizon: row.timeHorizon,
              relevantTickers: row.relevantTickers,
              status: 'draft',
              sourceInsightId: row.sourceInsightId,
              sourceClaimId: row.sourceClaimId,
            }).returning(claimSelection);
            if (!inserted) throw new Error('Main-claim insertion returned no row');
            return claimRecord(inserted as typeof mainClaims.$inferSelect);
          },
          async loadClaimThesisMapping(mainClaimId, thesisId, thesisType) {
            const target = thesisType === 'macro'
              ? claimThesisMappings.macroThesisId
              : claimThesisMappings.assetThesisId;
            const [row] = await tx.select({
              id: claimThesisMappings.id,
              mainClaimId: claimThesisMappings.mainClaimId,
              macroThesisId: claimThesisMappings.macroThesisId,
              assetThesisId: claimThesisMappings.assetThesisId,
              mappingType: claimThesisMappings.mappingType,
              confidence: claimThesisMappings.confidence,
              mappedBy: claimThesisMappings.mappedBy,
              notes: claimThesisMappings.notes,
            }).from(claimThesisMappings).where(and(
              eq(claimThesisMappings.mainClaimId, mainClaimId),
              eq(target, thesisId),
            )).limit(1);
            if (!row) return null;
            if (!['supports', 'refutes', 'foundation'].includes(row.mappingType)
              || !['high', 'medium', 'low'].includes(row.confidence ?? '')) {
              throw new Error(`Stored claim-thesis mapping ${row.id} has unsupported semantics`);
            }
            return {
              id: row.id,
              mainClaimId: row.mainClaimId,
              thesisId,
              thesisType,
              mappingType: row.mappingType as PublicationMappingRecord['mappingType'],
              confidence: row.confidence as PublicationMappingRecord['confidence'],
              mappedBy: 'research-publication',
              notes: row.notes ?? '',
            };
          },
          async insertClaimThesisMapping(row) {
            const [inserted] = await tx.insert(claimThesisMappings).values({
              mainClaimId: row.mainClaimId,
              macroThesisId: row.thesisType === 'macro' ? row.thesisId : null,
              assetThesisId: row.thesisType === 'asset' ? row.thesisId : null,
              mappingType: row.mappingType,
              confidence: row.confidence,
              mappedBy: 'research-publication',
              notes: row.notes,
            }).returning({ id: claimThesisMappings.id });
            if (!inserted) throw new Error('Claim-thesis insertion returned no row');
            return { ...row, id: inserted.id };
          },
          async insertJournalEntry(row) {
            const firstClaim = row.result.claims[0];
            if (!firstClaim) throw new Error('Publication audit requires at least one claim');
            const [inserted] = await tx.insert(journalEntries).values({
              timestamp: row.recordedAt,
              objectType: 'claim',
              objectId: firstClaim.mainClaimId,
              objectTitle: `Research publication ${row.result.source.insightId}`,
              actionType: 'research_publication_recorded',
              actionDescription: `Published ${row.result.claims.length} claim(s) and ${row.result.relationships.length} governed thesis relationship(s)`,
              skillInvoked: 'research-publication',
              newState: row.result,
              rationale: 'Exact user authorization accepted for the named publication digest, claims, and relationships.',
              source: 'user',
              metadata: {
                authorizationId: row.authorizationId,
                authorizationDigest: row.authorizationDigest,
                publicationDigest: row.publicationDigest,
                result: row.result,
                envelope: row.envelope,
              },
              batchId: row.authorizationId,
              firstDetectedAt: row.recordedAt,
              lastSeenAt: row.recordedAt,
              occurrenceCount: 1,
              status: 'active',
            }).returning({ id: journalEntries.id });
            if (!inserted) throw new Error('Research-publication audit insertion returned no row');
            return { ...row, id: inserted.id };
          },
        };
            return work(transaction);
          }, {
            isolationLevel: 'serializable',
            accessMode: 'read write',
          });
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error
            ? String((error as { code: unknown }).code)
            : null;
          if (attempt === 2 || !['40001', '40P01', '23505'].includes(code ?? '')) throw error;
        }
      }
      throw new Error('Research-publication transaction retry exhausted');
    },
  };
}
