import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  assetTheses,
  claimSignalEvidences,
  claimThesisMappings,
  journalEntries,
  macroTheses,
  mainClaims,
  researchArtifacts,
  researchInsights,
  signalDataSnapshots,
  signalEntityLinks,
  signals,
  thesisArticulations,
} from '../../../src/db/schema.js';
import type {
  BeliefEvidenceAssessmentStore,
  BeliefEvidenceAssessmentTransaction,
  SignalType,
} from '../record-belief-evidence-assessment.js';

type Database = typeof import('../../lib/db.js').db;

export function createDatabaseStore(db: Database): BeliefEvidenceAssessmentStore {
  return {
    async transaction(work) {
      return db.transaction(async (tx) => {
        const transaction: BeliefEvidenceAssessmentTransaction = {
          async loadCurrentTarget(thesisId, thesisType) {
            const thesisTable = thesisType === 'macro' ? macroTheses : assetTheses;
            const [thesis] = await tx.select({
              id: thesisTable.id,
              title: thesisTable.title,
              status: thesisTable.status,
              notes: thesisTable.notes,
            }).from(thesisTable).where(eq(thesisTable.id, thesisId)).limit(1);
            if (!thesis) return null;

            const [articulation] = await tx.select().from(thesisArticulations).where(and(
              eq(thesisArticulations.thesisId, thesisId),
              eq(thesisArticulations.thesisType, thesisType),
            )).orderBy(
              desc(thesisArticulations.version),
              desc(thesisArticulations.createdAt),
            ).limit(1);
            if (!articulation) return null;

            const activeSignals = await tx.select({
              id: signals.id,
              statement: signals.statement,
              type: signals.type,
              importance: signals.importance,
              notes: signals.notes,
              linkedClaimIds: signals.linkedClaimIds,
            }).from(signals)
              .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
              .where(and(
                eq(signalEntityLinks.entityType, 'thesis'),
                eq(signalEntityLinks.thesisId, thesisId),
                eq(signalEntityLinks.thesisType, thesisType),
                eq(signals.articulationId, articulation.id),
                eq(signals.status, 'active'),
              )).orderBy(signals.id);
            if (activeSignals.length === 0) return null;

            const directArtifact = alias(researchArtifacts, 'assessment_direct_artifact');
            const linkedClaims = await tx.select({
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
              status: mainClaims.status,
              mappingType: claimThesisMappings.mappingType,
              sourceInsightId: mainClaims.sourceInsightId,
              sourceClaimId: mainClaims.sourceClaimId,
              sourceArtifactId: mainClaims.sourceArtifactId,
              insightSourceType: researchArtifacts.sourceType,
              insightSourceTitle: researchArtifacts.title,
              insightSourceUrl: researchArtifacts.sourceUrl,
              insightPublishedDate: researchArtifacts.publishedDate,
              insightRawContent: researchArtifacts.rawContent,
              directSourceType: directArtifact.sourceType,
              directSourceTitle: directArtifact.title,
              directSourceUrl: directArtifact.sourceUrl,
              directPublishedDate: directArtifact.publishedDate,
              directRawContent: directArtifact.rawContent,
            }).from(claimThesisMappings)
              .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
              .leftJoin(researchInsights, eq(mainClaims.sourceInsightId, researchInsights.id))
              .leftJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
              .leftJoin(directArtifact, eq(mainClaims.sourceArtifactId, directArtifact.id))
              .where(eq(
                thesisType === 'macro'
                  ? claimThesisMappings.macroThesisId
                  : claimThesisMappings.assetThesisId,
                thesisId,
              )).orderBy(desc(mainClaims.createdAt));

            const priorEvidence = await tx.select({
              id: signalDataSnapshots.id,
              signalId: signalDataSnapshots.signalId,
              snapshotDate: signalDataSnapshots.snapshotDate,
              assessment: signalDataSnapshots.assessment,
              evidenceSummary: signalDataSnapshots.evidenceSummary,
              dataSource: signalDataSnapshots.dataSource,
              claimId: signalDataSnapshots.claimId,
            }).from(signalDataSnapshots).where(inArray(
              signalDataSnapshots.signalId,
              activeSignals.map(({ id }) => id),
            )).orderBy(desc(signalDataSnapshots.snapshotDate));

            return {
              thesis: { id: thesis.id, type: thesisType, title: thesis.title, status: thesis.status },
              articulation: {
                id: articulation.id,
                version: articulation.version,
                coreArgument: articulation.coreArgument,
                keyDrivers: articulation.keyDrivers,
                keyAssumptions: articulation.keyAssumptions,
                timeframe: articulation.timeframe,
                notes: thesis.notes,
                claimIdsUsed: Array.isArray(articulation.claimIdsUsed)
                  ? articulation.claimIdsUsed.filter((id): id is string => typeof id === 'string')
                  : [],
              },
              signals: activeSignals.map((signal) => ({
                id: signal.id,
                statement: signal.statement,
                type: signal.type as SignalType,
                importance: signal.importance,
                notes: signal.notes,
                linkedClaimIds: Array.isArray(signal.linkedClaimIds)
                  ? signal.linkedClaimIds.filter((id): id is string => typeof id === 'string')
                  : [],
              })),
              claimsAndObservations: linkedClaims.map((claim) => ({
                id: claim.id,
                title: claim.title,
                category: claim.category,
                claim: claim.claim,
                evidence: claim.evidence,
                reasoning: claim.reasoning,
                backing: claim.backing,
                qualifier: claim.qualifier,
                rebuttal: claim.rebuttal,
                timeHorizon: claim.timeHorizon,
                status: claim.status,
                mappingType: claim.mappingType,
                provenance: {
                  sourceInsightId: claim.sourceInsightId,
                  sourceClaimId: claim.sourceClaimId,
                  sourceArtifactId: claim.sourceArtifactId,
                  sourceType: claim.directSourceType ?? claim.insightSourceType,
                  sourceTitle: claim.directSourceTitle ?? claim.insightSourceTitle,
                  sourceUrl: claim.directSourceUrl ?? claim.insightSourceUrl,
                  publishedDate: claim.directPublishedDate ?? claim.insightPublishedDate,
                  rawContent: claim.directRawContent ?? claim.insightRawContent,
                },
              })),
              priorEvidence,
            };
          },
          async loadPromotedClaim(claimId) {
            const [claim] = await tx.select({
              id: mainClaims.id,
              sourceInsightId: mainClaims.sourceInsightId,
              sourceClaimId: mainClaims.sourceClaimId,
              sourceArtifactId: mainClaims.sourceArtifactId,
            }).from(mainClaims).where(eq(mainClaims.id, claimId)).limit(1);
            return claim ?? null;
          },
          async insertSnapshots(rows) {
            return tx.insert(signalDataSnapshots).values(rows).returning({
              id: signalDataSnapshots.id,
              signalId: signalDataSnapshots.signalId,
            });
          },
          async upsertClaimSignalEvidences(rows) {
            for (const row of rows) {
              await tx.insert(claimSignalEvidences).values(row).onConflictDoUpdate({
                target: [claimSignalEvidences.claimId, claimSignalEvidences.signalId],
                set: {
                  assessment: sql`excluded.assessment`,
                  snapshotId: sql`excluded.snapshot_id`,
                },
              });
            }
          },
          async insertJournalEntries(rows) {
            await tx.insert(journalEntries).values(rows);
          },
        };
        return work(transaction);
      }, { isolationLevel: 'serializable', accessMode: 'read write' });
    },
  };
}
