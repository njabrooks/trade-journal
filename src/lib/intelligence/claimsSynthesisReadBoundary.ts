import { createHash } from 'node:crypto';
import {
  buildClaimsSynthesisContext,
  createUnavailableClaimsSynthesisResult,
  digestClaimsSynthesisContext,
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
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
      evidence: stringArray(claim.evidence),
      reasoning: nullableString(claim.reasoning),
      backing: nullableString(claim.backing),
      qualifier: nullableString(claim.qualifier),
      rebuttal: stringArray(claim.rebuttal),
      timeHorizon: nullableString(claim.time_horizon),
      relevantTickers: stringArray(claim.relevant_tickers).map((ticker) => ticker.toUpperCase()),
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
    input = sourceInput(source);
  } catch (error) {
    return createUnavailableClaimsSynthesisResult('source_unavailable', errorDetail(error));
  }

  try {
    const [existingMainClaims, theses] = await Promise.all([
      repository.loadMainClaims(source),
      repository.loadActiveTheses(),
    ]);
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
