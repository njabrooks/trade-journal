import { createHash } from 'node:crypto';
import {
  buildBeliefResearchRelationContext,
  createUnavailableBeliefResearchRelationResult,
  digestBeliefResearchRelationContext,
  validateBeliefResearchRelationContext,
  type BeliefResearchRelationContext,
  type BeliefResearchRelationMainClaim,
  type BeliefResearchRelationRepositorySnapshot,
  type BeliefResearchRelationThesis,
  type BeliefResearchRelationUnavailableResult,
} from './beliefResearchRelation.js';

interface RawSourceClaim {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  claim?: unknown;
  evidence?: unknown;
  reasoning?: unknown;
  backing?: unknown;
  qualifier?: unknown;
  rebuttal?: unknown;
  time_horizon?: unknown;
  relevant_tickers?: unknown;
}

export interface BeliefResearchRelationSourceRow {
  insightId: string;
  artifactId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  rawContent: string;
  metadata: unknown;
  observedAt: Date | string | null;
  claimsStructure: unknown;
}

export interface BeliefResearchRelationReadRepository {
  loadSource(insightId: string): Promise<BeliefResearchRelationSourceRow | null>;
  loadMainClaims(source: BeliefResearchRelationSourceRow): Promise<BeliefResearchRelationMainClaim[]>;
  loadActiveTheses(): Promise<BeliefResearchRelationThesis[]>;
  loadExistingRelationships(
    mainClaimIds: string[],
  ): Promise<BeliefResearchRelationRepositorySnapshot['existingRelationships']>;
}

export type PreparedBeliefResearchRelationContext =
  | {
    contractVersion: '1.0.0';
    status: 'ready';
    contextDigest: string;
    context: BeliefResearchRelationContext;
  }
  | BeliefResearchRelationUnavailableResult;

function isNotesOwned(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return record.origin === 'tana-pipeline'
    || (typeof record.tana_content_node_id === 'string' && record.tana_content_node_id.length > 0);
}

function sourceInput(row: BeliefResearchRelationSourceRow): Parameters<typeof buildBeliefResearchRelationContext>[0] {
  if (!isNotesOwned(row.metadata)) {
    throw new Error('Research artifact does not carry Notes/Tana authority provenance');
  }
  const structure = row.claimsStructure as { main_claims?: RawSourceClaim[] } | null;
  if (!structure || !Array.isArray(structure.main_claims) || structure.main_claims.length === 0) {
    throw new Error('Research insight has no complete provenance-bearing main claims');
  }
  return {
    authority: 'scope:notes', artifactId: row.artifactId, insightId: row.insightId,
    title: row.title, sourceType: row.sourceType, sourceUrl: row.sourceUrl,
    contentSha256: `sha256:${createHash('sha256').update(row.rawContent).digest('hex')}`,
    observedAt: row.observedAt instanceof Date ? row.observedAt.toISOString() : row.observedAt,
    claims: structure.main_claims.map((claim) => ({
      sourceClaimId: claim.id as string,
      title: claim.title as string,
      category: claim.category as 'macro' | 'asset_specific',
      claim: claim.claim as string,
      evidence: claim.evidence as string[],
      reasoning: claim.reasoning as string | null,
      backing: claim.backing as string | null,
      qualifier: claim.qualifier as string | null,
      rebuttal: claim.rebuttal as string[],
      timeHorizon: claim.time_horizon as string | null,
      relevantTickers: claim.relevant_tickers as string[],
    })),
  };
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function prepareBeliefResearchRelationContext(
  insightId: string,
  repository: BeliefResearchRelationReadRepository,
): Promise<PreparedBeliefResearchRelationContext> {
  let source: BeliefResearchRelationSourceRow | null;
  try {
    source = await repository.loadSource(insightId);
  } catch (error) {
    return createUnavailableBeliefResearchRelationResult('database_unavailable', detail(error));
  }
  if (!source) {
    return createUnavailableBeliefResearchRelationResult(
      'source_unavailable', `No Notes-owned research insight found for ${insightId}`,
    );
  }

  let normalizedSource: ReturnType<typeof sourceInput>;
  try {
    normalizedSource = sourceInput(source);
    buildBeliefResearchRelationContext(normalizedSource, {
      existingMainClaims: [], theses: [], existingRelationships: [],
    });
  } catch (error) {
    return createUnavailableBeliefResearchRelationResult('source_unavailable', detail(error));
  }

  try {
    const existingMainClaims = await repository.loadMainClaims(source);
    const theses = await repository.loadActiveTheses();
    if (theses.some(({ status }) => status !== 'developing' && status !== 'monitoring')) {
      return createUnavailableBeliefResearchRelationResult(
        'authority_ambiguous', 'Active-thesis read returned a target outside developing or monitoring status',
      );
    }
    const mainClaimIds = existingMainClaims
      .filter(({ sourceInsightId, sourceClaimId }) =>
        sourceInsightId === source.insightId
        && normalizedSource.claims.some((claim) => claim.sourceClaimId === sourceClaimId))
      .map(({ id }) => id);
    const existingRelationships = await repository.loadExistingRelationships(mainClaimIds);
    const context = buildBeliefResearchRelationContext(normalizedSource, {
      existingMainClaims, theses, existingRelationships,
    });
    return {
      contractVersion: '1.0.0', status: 'ready',
      contextDigest: digestBeliefResearchRelationContext(context), context,
    };
  } catch (error) {
    return createUnavailableBeliefResearchRelationResult('database_unavailable', detail(error));
  }
}

export function validatePreparedBeliefResearchRelationContext(value: unknown): BeliefResearchRelationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Prepared belief-research relation context must be an object');
  }
  const prepared = value as Record<string, unknown>;
  const unsupported = Object.keys(prepared).filter((key) => ![
    'contractVersion', 'status', 'contextDigest', 'context',
  ].includes(key));
  if (unsupported.length) {
    throw new Error(`Prepared belief-research relation context contains unsupported fields: ${unsupported.join(', ')}`);
  }
  if (prepared.contractVersion !== '1.0.0' || prepared.status !== 'ready') {
    throw new Error('Prepared belief-research relation context must have ready version 1.0.0 status');
  }
  const context = validateBeliefResearchRelationContext(prepared.context);
  if (prepared.contextDigest !== digestBeliefResearchRelationContext(context)) {
    throw new Error('Prepared belief-research relation context digest does not match exact bytes');
  }
  return context;
}
