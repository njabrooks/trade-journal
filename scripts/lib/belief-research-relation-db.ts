import { desc, eq, inArray } from 'drizzle-orm';
import type { db as productionDb } from './db.js';
import {
  assetTheses,
  claimThesisMappings,
  macroTheses,
  thesisArticulations,
  underlyings,
} from '../../src/db/schema.js';
import type {
  BeliefResearchRelationThesis,
} from '../../src/lib/intelligence/beliefResearchRelation.js';
import type {
  BeliefResearchRelationReadRepository,
} from '../../src/lib/intelligence/beliefResearchRelationReadBoundary.js';
import { createClaimsSynthesisReadRepository } from './claims-synthesis-db.js';

type Database = typeof productionDb;

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Stored thesis articulation ${field} must be a string array`);
  }
  return value;
}

export function createBeliefResearchRelationReadRepository(
  db: Database,
): BeliefResearchRelationReadRepository {
  const claims = createClaimsSynthesisReadRepository(db);
  return {
    loadSource: claims.loadSource,
    loadMainClaims: claims.loadMainClaims,

    async loadActiveTheses(): Promise<BeliefResearchRelationThesis[]> {
      const macroRows = await db.select({
        id: macroTheses.id, title: macroTheses.title, description: macroTheses.description,
        direction: macroTheses.direction, status: macroTheses.status,
      }).from(macroTheses)
        .where(inArray(macroTheses.status, ['developing', 'monitoring']))
        .orderBy(macroTheses.id);
      const assetRows = await db.select({
        id: assetTheses.id, title: assetTheses.title, description: assetTheses.description,
        direction: assetTheses.direction, status: assetTheses.status, ticker: underlyings.ticker,
      }).from(assetTheses)
        .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
        .where(inArray(assetTheses.status, ['developing', 'monitoring']))
        .orderBy(assetTheses.id);
      const activeIds = [...macroRows, ...assetRows].map(({ id }) => id);
      const articulationRows = activeIds.length === 0 ? [] : await db.select({
        thesisId: thesisArticulations.thesisId,
        thesisType: thesisArticulations.thesisType,
        version: thesisArticulations.version,
        coreArgument: thesisArticulations.coreArgument,
        keyDrivers: thesisArticulations.keyDrivers,
        keyAssumptions: thesisArticulations.keyAssumptions,
        createdAt: thesisArticulations.createdAt,
      }).from(thesisArticulations)
        .where(inArray(thesisArticulations.thesisId, activeIds))
        .orderBy(thesisArticulations.thesisId, desc(thesisArticulations.version));
      const latest = new Map<string, typeof articulationRows[number]>();
      for (const row of articulationRows) {
        const key = `${row.thesisType}:${row.thesisId}`;
        if (!latest.has(key)) latest.set(key, row);
      }
      const mapThesis = (
        row: typeof macroRows[number] | typeof assetRows[number],
        type: 'macro' | 'asset',
        ticker: string | null,
      ): BeliefResearchRelationThesis => {
        if (row.status !== 'developing' && row.status !== 'monitoring') {
          throw new Error(`Active thesis ${row.id} has unsupported status ${row.status}`);
        }
        const articulation = latest.get(`${type}:${row.id}`);
        const fallback = row.description?.trim();
        if (!articulation && !fallback) {
          throw new Error(`Active thesis ${row.id} has neither a governed articulation nor a description`);
        }
        return {
          id: row.id, type, title: row.title, description: row.description,
          direction: row.direction, status: row.status, ticker,
          argument: articulation ? {
            source: 'latest_articulation', coreArgument: articulation.coreArgument,
            keyDrivers: stringList(articulation.keyDrivers, 'keyDrivers'),
            keyAssumptions: stringList(articulation.keyAssumptions, 'keyAssumptions'),
          } : {
            source: 'description', coreArgument: fallback as string,
            keyDrivers: [], keyAssumptions: [],
          },
        };
      };
      return [
        ...macroRows.map((row) => mapThesis(row, 'macro', null)),
        ...assetRows.map((row) => mapThesis(row, 'asset', row.ticker)),
      ];
    },

    async loadExistingRelationships(mainClaimIds) {
      if (mainClaimIds.length === 0) return [];
      const rows = await db.select({
        mainClaimId: claimThesisMappings.mainClaimId,
        macroThesisId: claimThesisMappings.macroThesisId,
        assetThesisId: claimThesisMappings.assetThesisId,
        mappingType: claimThesisMappings.mappingType,
        confidence: claimThesisMappings.confidence,
      }).from(claimThesisMappings)
        .where(inArray(claimThesisMappings.mainClaimId, mainClaimIds))
        .orderBy(claimThesisMappings.mainClaimId, claimThesisMappings.id);
      return rows.map((row) => {
        if (!['supports', 'refutes', 'foundation'].includes(row.mappingType)) {
          throw new Error(`Stored claim-thesis mapping has unsupported type ${row.mappingType}`);
        }
        const thesisType = row.macroThesisId ? 'macro' as const : 'asset' as const;
        const thesisId = row.macroThesisId ?? row.assetThesisId;
        if (!thesisId || (row.macroThesisId && row.assetThesisId)) {
          throw new Error(`Stored mapping for claim ${row.mainClaimId} has ambiguous thesis identity`);
        }
        return {
          claimId: row.mainClaimId, thesisId, thesisType,
          relationship: row.mappingType as 'supports' | 'refutes' | 'foundation',
        };
      });
    },
  };
}
