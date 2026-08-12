export const THESIS_FOREGROUND_VERBS = [
  "query",
  "what-changed",
  "observe",
  "assess-evidence",
  "re-underwrite",
] as const;

export type ThesisForegroundVerb = (typeof THESIS_FOREGROUND_VERBS)[number];
export type ThesisType = "macro" | "asset";

export type ForegroundRequest = {
  invocation: "interactive" | "headless" | "scheduled";
  userPresent: boolean;
  verb?: string;
  thesisId?: string;
  thesisType?: string;
  recordingRequested?: boolean;
  reunderwritingRequested?: boolean;
  inputsComplete?: boolean;
  judgmentComplete?: boolean;
  observationAsOf?: string;
  evidenceProvided?: boolean;
};

export type ForegroundPlan =
  | { outcome: "refused"; reason: string; reads: []; writes: [] }
  | {
      outcome: "ready";
      verb: ThesisForegroundVerb;
      thesisId: string;
      thesisType: ThesisType;
      dependency: string | null;
      readOnly: boolean;
      writes: "none" | "dependency-only";
    };

/**
 * Deterministic preflight for the interactive thesis foreground. It is deliberately
 * dependency-free so every refusal is decided before repository or database access.
 */
export function planThesisForeground(
  request: ForegroundRequest,
): ForegroundPlan {
  if (request.invocation !== "interactive" || !request.userPresent) {
    return {
      outcome: "refused",
      reason: "interactive_thesis_judgment_required",
      reads: [],
      writes: [],
    };
  }
  if (
    !request.verb ||
    !THESIS_FOREGROUND_VERBS.includes(request.verb as ThesisForegroundVerb)
  ) {
    return {
      outcome: "refused",
      reason: "explicit_foreground_verb_required",
      reads: [],
      writes: [],
    };
  }
  if (
    !request.thesisId ||
    (request.thesisType !== "macro" && request.thesisType !== "asset")
  ) {
    return {
      outcome: "refused",
      reason: "exact_thesis_required",
      reads: [],
      writes: [],
    };
  }
  const verb = request.verb as ThesisForegroundVerb;
  const delegates =
    verb === "observe" ||
    verb === "assess-evidence" ||
    verb === "re-underwrite";
  if (delegates && request.inputsComplete !== true) {
    return {
      outcome: "refused",
      reason: "complete_inputs_required",
      reads: [],
      writes: [],
    };
  }
  if (delegates && request.judgmentComplete !== true) {
    return {
      outcome: "refused",
      reason: "current_user_judgment_required",
      reads: [],
      writes: [],
    };
  }

  if (verb === "observe" && !request.observationAsOf) {
    return {
      outcome: "refused",
      reason: "explicit_observation_as_of_required",
      reads: [],
      writes: [],
    };
  }
  if (verb === "assess-evidence" && request.evidenceProvided !== true) {
    return {
      outcome: "refused",
      reason: "assessment_evidence_required",
      reads: [],
      writes: [],
    };
  }
  if (verb === "assess-evidence" && request.recordingRequested !== true) {
    return {
      outcome: "ready",
      verb,
      thesisId: request.thesisId,
      thesisType: request.thesisType,
      dependency: "capability:scope:trade-journal/belief-evidence-assessment",
      readOnly: true,
      writes: "none",
    };
  }
  if (verb === "re-underwrite" && request.reunderwritingRequested !== true) {
    return {
      outcome: "refused",
      reason: "explicit_reunderwriting_request_required",
      reads: [],
      writes: [],
    };
  }

  const dependency =
    verb === "observe"
      ? "capability:scope:trade-journal/thesis-observation"
      : verb === "assess-evidence"
        ? "capability:scope:trade-journal/belief-evidence-assessment"
        : verb === "re-underwrite"
          ? "capability:scope:trade-journal/thesis-underwriting"
          : null;
  const readOnly = verb === "query" || verb === "what-changed";
  return {
    outcome: "ready",
    verb,
    thesisId: request.thesisId,
    thesisType: request.thesisType,
    dependency,
    readOnly,
    writes: readOnly ? "none" : "dependency-only",
  };
}

export type DeltaClaim = {
  id: string;
  createdAt: Date | string;
  mappedAt: Date | string;
  sourceInsightId: string | null;
  sourceClaimId: string | null;
  sourceArtifactId: string | null;
  [key: string]: unknown;
};

export type DeltaEvidence = {
  id: string;
  recordedAt: Date | string;
  [key: string]: unknown;
};

export function buildThesisDelta<
  TClaim extends DeltaClaim,
  TEvidence extends DeltaEvidence,
>(input: {
  expectedArticulationId: string | null;
  articulation: {
    id: string;
    version: number;
    createdAt: Date | string;
  } | null;
  claims: TClaim[];
  evidence: TEvidence[];
}) {
  if (input.expectedArticulationId !== (input.articulation?.id ?? null)) {
    return {
      outcome: "stale" as const,
      reason: "articulation_changed",
      writes: [] as never[],
    };
  }

  const baselineAt = input.articulation
    ? new Date(input.articulation.createdAt)
    : null;
  const provenanceBearing = input.claims.filter(
    (claim) =>
      claim.sourceArtifactId || (claim.sourceInsightId && claim.sourceClaimId),
  );
  const claims = provenanceBearing
    .filter(
      (claim) =>
        !baselineAt ||
        new Date(claim.createdAt) > baselineAt ||
        new Date(claim.mappedAt) > baselineAt,
    )
    .map((claim) => ({
      ...claim,
      deltaKind: baselineAt
        ? new Date(claim.createdAt) > baselineAt
          ? "newly-created"
          : "newly-linked"
        : "unbaselined",
    }));
  const evidence = input.evidence.filter(
    (item) => !baselineAt || new Date(item.recordedAt) > baselineAt,
  );

  return {
    outcome: "ready" as const,
    baseline: input.articulation
      ? {
          articulationId: input.articulation.id,
          version: input.articulation.version,
          createdAt: input.articulation.createdAt,
        }
      : null,
    claims,
    evidence,
    excludedClaimsWithoutProvenance:
      input.claims.length - provenanceBearing.length,
    writes: [] as never[],
  };
}
