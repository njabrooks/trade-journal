export type DecisionResolutionAuthorityInput = {
  by?: "user" | "agent";
};

export const MISSING_USER_JUDGMENT_MESSAGE =
  "Refused: decision resolution requires explicit current-user judgment via --by user; missing, agent-authored, headless, autonomous, or scheduled judgment is not authorized.";

export type DecisionResolutionWrite = {
  table: string;
  op: "insert" | "update" | "delete";
  ids: string[];
};

export type DecisionResolutionRequest = {
  id?: unknown;
  action?: unknown;
  notes?: unknown;
  by?: unknown;
  status?: unknown;
  writes?: unknown;
  macroId?: unknown;
  assetId?: unknown;
  strategyId?: unknown;
  thesisId?: unknown;
  underlyingId?: unknown;
  parentId?: unknown;
  dryRun?: unknown;
};

export type CompleteDecisionPacket = {
  schema_version: number;
  decision_type: string;
  related_objects: unknown[];
  why_raised: string;
  recommended_actions: Array<{ action: string }>;
  agent_runbook: string;
  resolution?: unknown;
};

/**
 * Decision Items exist precisely because their resolution cannot be inferred. Keep this
 * guard independent of database access so adapters and tests share one fail-closed rule.
 */
export function assertExplicitUserJudgment(
  input: DecisionResolutionAuthorityInput,
): asserts input is { by: "user" } {
  if (input.by !== "user") {
    throw new Error(MISSING_USER_JUDGMENT_MESSAGE);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isResolutionWrite(value: unknown): value is DecisionResolutionWrite {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const write = value as Record<string, unknown>;
  return (
    isNonEmptyString(write.table) &&
    ["insert", "update", "delete"].includes(String(write.op)) &&
    Array.isArray(write.ids) &&
    write.ids.length > 0 &&
    write.ids.every(isNonEmptyString)
  );
}

/** Validate every caller-controlled value before the first database read or write. */
export function assertValidDecisionResolutionRequest(
  input: DecisionResolutionRequest,
): asserts input is DecisionResolutionRequest & {
  id: string;
  action: string;
  by: "user";
  status?: "resolved" | "dismissed";
  writes?: DecisionResolutionWrite[];
} {
  assertExplicitUserJudgment(input as DecisionResolutionAuthorityInput);
  if (!isNonEmptyString(input.id) || !isNonEmptyString(input.action)) {
    throw new Error(
      "Refused: decision resolution requires non-empty id and action values.",
    );
  }
  if (
    input.status !== undefined &&
    input.status !== "resolved" &&
    input.status !== "dismissed"
  ) {
    throw new Error("Refused: decision status must be resolved or dismissed.");
  }
  if (input.notes !== undefined && typeof input.notes !== "string") {
    throw new Error("Refused: decision resolution notes must be a string.");
  }
  if (input.writes !== undefined) {
    if (
      !Array.isArray(input.writes) ||
      !input.writes.every(isResolutionWrite)
    ) {
      throw new Error("Refused: decision resolution writes are malformed.");
    }
  }
  for (const field of [
    "macroId",
    "assetId",
    "strategyId",
    "thesisId",
    "underlyingId",
    "parentId",
  ] as const) {
    if (input[field] !== undefined && !isNonEmptyString(input[field])) {
      throw new Error(`Refused: ${field} must be a non-empty string.`);
    }
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    throw new Error("Refused: dryRun must be boolean.");
  }
  if (
    (input.action === "dismiss" && input.status === "resolved") ||
    (input.action !== "dismiss" && input.status === "dismissed")
  ) {
    throw new Error("Refused: action and resolution status disagree.");
  }
}

function isCompleteDecisionPacket(
  value: unknown,
): value is CompleteDecisionPacket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const packet = value as Partial<CompleteDecisionPacket>;
  return (
    typeof packet.schema_version === "number" &&
    isNonEmptyString(packet.decision_type) &&
    Array.isArray(packet.related_objects) &&
    isNonEmptyString(packet.why_raised) &&
    Array.isArray(packet.recommended_actions) &&
    packet.recommended_actions.every(
      (action) => !!action && isNonEmptyString(action.action),
    ) &&
    isNonEmptyString(packet.agent_runbook)
  );
}

export type BuiltInDecisionAction =
  | "framing-noop"
  | "framing-unlink"
  | "framing-related"
  | "framing-gated"
  | "strategy-link"
  | "proxy-map"
  | "claim-sever"
  | "macro-create";

const BUILT_IN_DECISION_ACTIONS: Readonly<
  Record<string, BuiltInDecisionAction>
> = {
  "classify_macro_link:stand_alone": "framing-noop",
  "classify_macro_link:none": "framing-noop",
  "classify_macro_link:keep_in_tana": "framing-noop",
  "classify_macro_link:unlink": "framing-unlink",
  "classify_macro_link:set_gated_by": "framing-gated",
  "classify_macro_link:set_related": "framing-related",
  "classify_macro_link:related": "framing-related",
  "classify_macro_link:link": "framing-related",
  "frame_asset_under_macro:stand_alone": "framing-noop",
  "frame_asset_under_macro:none": "framing-noop",
  "frame_asset_under_macro:keep_in_tana": "framing-noop",
  "frame_asset_under_macro:unlink": "framing-unlink",
  "frame_asset_under_macro:set_gated_by": "framing-gated",
  "frame_asset_under_macro:set_related": "framing-related",
  "frame_asset_under_macro:related": "framing-related",
  "frame_asset_under_macro:link": "framing-related",
  "link_strategy_to_thesis:link": "strategy-link",
  "resolve_proxy_underlying:map": "proxy-map",
  "confirm_claim_link:sever": "claim-sever",
  "cluster_claims_to_thesis:create_macro": "macro-create",
};

export function getBuiltInDecisionAction(
  decisionType: string,
  action: string,
): BuiltInDecisionAction | undefined {
  return BUILT_IN_DECISION_ACTIONS[`${decisionType}:${action}`];
}

/** Validate the selected action against the exact complete packet before mutation. */
export function assertBoundedDecisionSelection(
  input: { action: string; writes?: DecisionResolutionWrite[] },
  packet: unknown,
): asserts packet is CompleteDecisionPacket {
  if (!isCompleteDecisionPacket(packet) || packet.resolution != null) {
    throw new Error(
      "Refused: decision resolution requires a complete unresolved Decision Item packet.",
    );
  }
  const allowed = new Set(
    packet.recommended_actions.map(({ action }) => action),
  );
  allowed.add("dismiss");
  if (!allowed.has(input.action)) {
    throw new Error(
      `Refused: unsupported action ${input.action} for this Decision Item.`,
    );
  }
  if (input.action === "dismiss" && input.writes?.length) {
    throw new Error(
      "Refused: dismissed decisions cannot declare graph writes.",
    );
  }
  if (
    input.writes?.length &&
    getBuiltInDecisionAction(packet.decision_type, input.action)
  ) {
    throw new Error(
      "Refused: built-in mechanical actions derive their own exact write audit.",
    );
  }
}
