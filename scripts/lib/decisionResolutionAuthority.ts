export type DecisionResolutionAuthorityInput = {
  by?: "user" | "agent";
};

export const MISSING_USER_JUDGMENT_MESSAGE =
  "Refused: decision resolution requires explicit current-user judgment via --by user; missing, agent-authored, headless, autonomous, or scheduled judgment is not authorized.";

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
