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
  "CONFIRM_STRATEGY",  // Strategy needs confirmation: label, type, direction
  "LINK_STRATEGY_TO_THESIS",  // Confirmed strategy without thesis linkage (soft reminder)
  "PROVIDE_STRATEGY_METADATA",
  "REVIEW_SIZE",
  "REVIEW_COMPLEXITY",
  "QUANTITY_CHANGE",
  // Note: STATE_CODE_CHANGE removed - replaced by strategy signals
] as const;

