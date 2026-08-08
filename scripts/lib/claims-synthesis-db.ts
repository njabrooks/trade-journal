import { eq, gt, inArray } from 'drizzle-orm';
import type { db as productionDb } from './db.js';
import {
  assetTheses,
  macroTheses,
  mainClaims,
  researchArtifacts,
  researchInsights,
  underlyings,
} from '../../src/db/schema.js';
import type {
  ClaimsSynthesisMainClaim,
  ClaimsSynthesisThesisTarget,
} from '../../src/lib/intelligence/claimsSynthesis.js';
import type {
  ClaimsSynthesisReadRepository,
  ClaimsSynthesisSourceRow,
} from '../../src/lib/intelligence/claimsSynthesisReadBoundary.js';

type Database = typeof productionDb;

const claimSelection = {
  id: mainClaims.id,
  title: mainClaims.title,
  category: mainClaims.category,
  claim: mainClaims.claim,
  status: mainClaims.status,
  sourceInsightId: mainClaims.sourceInsightId,
  sourceClaimId: mainClaims.sourceClaimId,
};

type ClaimRow = Awaited<ReturnType<ClaimsSynthesisReadRepository['loadMainClaims']>>[number];

function mapClaim(row: Record<string, unknown>): ClaimRow | null {
  if (row.category !== 'macro' && row.category !== 'asset_specific') return null;
  return {
    id: String(row.id),
    title: String(row.title),
    category: row.category,
    claim: String(row.claim),
    status: String(row.status),
    sourceInsightId: typeof row.sourceInsightId === 'string' ? row.sourceInsightId : null,
    sourceClaimId: typeof row.sourceClaimId === 'string' ? row.sourceClaimId : null,
  } satisfies Omit<ClaimsSynthesisMainClaim, 'provenanceMatch'>;
}

export function createClaimsSynthesisReadRepository(db: Database): ClaimsSynthesisReadRepository {
  return {
    async loadSource(insightId): Promise<ClaimsSynthesisSourceRow | null> {
      const rows = await db
        .select({
          insightId: researchInsights.id,
          artifactId: researchArtifacts.id,
          title: researchArtifacts.title,
          sourceType: researchArtifacts.sourceType,
          sourceUrl: researchArtifacts.sourceUrl,
          rawContent: researchArtifacts.rawContent,
          metadata: researchArtifacts.metadata,
          observedAt: researchInsights.structuredAt,
          claimsStructure: researchInsights.claimsStructure,
        })
        .from(researchInsights)
        .innerJoin(researchArtifacts, eq(researchInsights.researchArtifactId, researchArtifacts.id))
        .where(eq(researchInsights.id, insightId))
        .limit(1);
      return rows[0] ?? null;
    },

    async loadMainClaims() {
      const byId = new Map<string, ClaimRow>();
      let cursor: string | null = null;
      for (;;) {
        const query = db
          .select(claimSelection)
          .from(mainClaims)
          .orderBy(mainClaims.id)
          .limit(250);
        const catalogRows: Array<Record<string, unknown>> = cursor
          ? await query.where(gt(mainClaims.id, cursor))
          : await query;
        for (const raw of catalogRows) {
          const claim = mapClaim(raw as Record<string, unknown>);
          if (claim) byId.set(claim.id, claim);
        }
        if (catalogRows.length < 250) break;
        cursor = String(catalogRows[catalogRows.length - 1].id);
      }
      return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
    },

    async loadActiveTheses(): Promise<ClaimsSynthesisThesisTarget[]> {
      const macroRows = await db
          .select({
            id: macroTheses.id,
            title: macroTheses.title,
            description: macroTheses.description,
            direction: macroTheses.direction,
            status: macroTheses.status,
          })
          .from(macroTheses)
          .where(inArray(macroTheses.status, ['developing', 'monitoring']))
          .orderBy(macroTheses.id);
      const assetRows = await db
          .select({
            id: assetTheses.id,
            title: assetTheses.title,
            description: assetTheses.description,
            direction: assetTheses.direction,
            status: assetTheses.status,
            ticker: underlyings.ticker,
          })
          .from(assetTheses)
          .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
          .where(inArray(assetTheses.status, ['developing', 'monitoring']))
          .orderBy(assetTheses.id);
      return [
        ...macroRows.map((row) => ({ ...row, type: 'macro' as const, ticker: null })),
        ...assetRows.map((row) => ({ ...row, type: 'asset' as const })),
      ].map((row) => ({
        ...row,
        status: row.status as 'developing' | 'monitoring',
      }));
    },
  };
}
