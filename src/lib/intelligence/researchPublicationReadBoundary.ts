import {
  prepareClaimsSynthesisContext,
  type ClaimsSynthesisReadRepository,
} from './claimsSynthesisReadBoundary.js';
import {
  buildResearchPublication,
  type PreparedResearchPublication,
} from './researchPublication.js';

export type ResearchPublicationReadRepository = ClaimsSynthesisReadRepository;

export type ResearchPublicationUnavailableReason =
  | 'database_unavailable'
  | 'source_unavailable'
  | 'environment_unavailable'
  | 'malformed_input'
  | 'stale_input';

export interface ResearchPublicationUnavailable {
  contractVersion: '1.0.0';
  status: 'unavailable';
  reason: ResearchPublicationUnavailableReason;
  detail: string;
  execution: { mode: 'refused'; writes: [] };
}

export type PreparedResearchPublicationResult =
  | PreparedResearchPublication
  | ResearchPublicationUnavailable;

function unavailable(
  reason: ResearchPublicationUnavailableReason,
  detail: string,
): ResearchPublicationUnavailable {
  return {
    contractVersion: '1.0.0',
    status: 'unavailable',
    reason,
    detail,
    execution: { mode: 'refused', writes: [] },
  };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function prepareResearchPublication(
  insightId: string,
  claimsSynthesisResult: unknown,
  repository: ResearchPublicationReadRepository,
): Promise<PreparedResearchPublicationResult> {
  const prepared = await prepareClaimsSynthesisContext(insightId, repository);
  if (prepared.status === 'unavailable') {
    return unavailable(prepared.reason, prepared.detail);
  }

  try {
    return buildResearchPublication(prepared.context, claimsSynthesisResult);
  } catch (error) {
    const detail = errorDetail(error);
    return unavailable(
      detail.includes('contextDigest') || detail.includes('does not match the supplied context')
        ? 'stale_input'
        : 'malformed_input',
      detail,
    );
  }
}
