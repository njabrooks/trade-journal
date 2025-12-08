// All available severity levels
export const ALL_SEVERITIES = [
  "urgent",
  "attention",
  "monitor",
  "info",
  "pending",
  "complete",
] as const;

// All available context levels
export const ALL_CONTEXTS = [
  "strategy",
  "position",
  "underlying",
  "account",
] as const;

// All available trigger types (recommendedAction values)
export const ALL_TRIGGERS = [
  // Position-level triggers
  "ASSIGNMENT_RISK≤14_DTE",
  "ASSIGNMENT_RISK≤30_DTE",
  "ITM_SHORT",
  "ITM_LONG",
  "SIGMA_0.5_SHORT",
  "SIGMA_0.5_LONG",
  "SIGMA_1.0",
  "REVIEW_DTE",
  // Strategy-level triggers
  "CONFIRM_STRATEGIES",
  "PROVIDE_STRATEGY_METADATA",
  "REVIEW_SIZE",
  "REVIEW_COMPLEXITY",
  "STATE_CODE_CHANGE",
  "QUANTITY_CHANGE",
] as const;

