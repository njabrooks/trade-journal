import { createHash } from 'node:crypto';
import {
  buildClaimsSynthesisContext,
  createUnavailableClaimsSynthesisResult,
  digestClaimsSynthesisContext,
  validateClaimsSynthesisContext,
  validateClaimsSynthesisSource,
  type ClaimsSynthesisContext,
  type ClaimsSynthesisMainClaim,
  type ClaimsSynthesisThesisTarget,
  type ClaimsSynthesisUnavailableResult,
} from './claimsSynthesis.js';

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

export interface ClaimsSynthesisSourceRow {
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

export interface ClaimsSynthesisReadRepository {
  loadSource(insightId: string): Promise<ClaimsSynthesisSourceRow | null>;
  loadMainClaims(
    source: ClaimsSynthesisSourceRow,
  ): Promise<Array<Omit<ClaimsSynthesisMainClaim, 'provenanceMatch'>>>;
  loadActiveTheses(): Promise<ClaimsSynthesisThesisTarget[]>;
}

export type PreparedClaimsSynthesis =
  | {
    contractVersion: '1.0.0';
    status: 'ready';
    contextDigest: string;
    context: ClaimsSynthesisContext;
  }
  | ClaimsSynthesisUnavailableResult;

export function validatePreparedClaimsSynthesisContext(value: unknown): ClaimsSynthesisContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Prepared claims-synthesis context must be an object');
  }
  const prepared = value as Record<string, unknown>;
  const unexpected = Object.keys(prepared).filter((key) => ![
    'contractVersion', 'status', 'contextDigest', 'context',
  ].includes(key));
  if (unexpected.length) {
    throw new Error(`Prepared claims-synthesis context contains unsupported fields: ${unexpected.join(', ')}`);
  }
  if (prepared.contractVersion !== '1.0.0' || prepared.status !== 'ready') {
    throw new Error('Prepared claims-synthesis context must have ready version 1.0.0 status');
  }
  if (!prepared.context || typeof prepared.context !== 'object' || Array.isArray(prepared.context)) {
    throw new Error('Prepared claims-synthesis context is missing its context object');
  }
  const context = validateClaimsSynthesisContext(prepared.context);
  if (prepared.contextDigest !== digestClaimsSynthesisContext(context)) {
    throw new Error('Prepared context digest does not match the exact context bytes');
  }
  return context;
}

function isNotesOwned(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return record.origin === 'tana-pipeline'
    || (typeof record.tana_content_node_id === 'string' && record.tana_content_node_id.length > 0);
}

function sourceInput(row: ClaimsSynthesisSourceRow): unknown {
  if (!isNotesOwned(row.metadata)) {
    throw new Error('Research artifact does not carry Notes/Tana authority provenance');
  }
  const structure = row.claimsStructure as { main_claims?: RawSourceClaim[] } | null;
  if (!structure || !Array.isArray(structure.main_claims) || structure.main_claims.length === 0) {
    throw new Error('Research insight has no complete provenance-bearing main claims');
  }

  return {
    authority: 'scope:notes',
    artifactId: row.artifactId,
    insightId: row.insightId,
    title: row.title,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    contentSha256: `sha256:${createHash('sha256').update(row.rawContent).digest('hex')}`,
    observedAt: row.observedAt instanceof Date ? row.observedAt.toISOString() : row.observedAt,
    claims: structure.main_claims.map((claim) => ({
      sourceClaimId: claim.id,
      title: claim.title,
      category: claim.category,
      claim: claim.claim,
      evidence: claim.evidence,
      reasoning: claim.reasoning,
      backing: claim.backing,
      qualifier: claim.qualifier,
      rebuttal: claim.rebuttal,
      timeHorizon: claim.time_horizon,
      relevantTickers: claim.relevant_tickers,
    })),
  };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function prepareClaimsSynthesisContext(
  insightId: string,
  repository: ClaimsSynthesisReadRepository,
): Promise<PreparedClaimsSynthesis> {
  let source: ClaimsSynthesisSourceRow | null;
  try {
    source = await repository.loadSource(insightId);
  } catch (error) {
    return createUnavailableClaimsSynthesisResult('database_unavailable', errorDetail(error));
  }
  if (!source) {
    return createUnavailableClaimsSynthesisResult(
      'source_unavailable',
      `No Notes-owned research insight found for ${insightId}`,
    );
  }

  let input: unknown;
  try {
    input = validateClaimsSynthesisSource(sourceInput(source));
  } catch (error) {
    return createUnavailableClaimsSynthesisResult('source_unavailable', errorDetail(error));
  }

  try {
    const existingMainClaims = await repository.loadMainClaims(source);
    const theses = await repository.loadActiveTheses();
    const context = buildClaimsSynthesisContext(input, { existingMainClaims, theses });
    return {
      contractVersion: '1.0.0',
      status: 'ready',
      contextDigest: digestClaimsSynthesisContext(context),
      context,
    };
  } catch (error) {
    return createUnavailableClaimsSynthesisResult('database_unavailable', errorDetail(error));
  }
}
