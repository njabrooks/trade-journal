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
  "REVIEW_DTE",
  "WATCH_CLOSELY",
  "MONITOR",
  "CLOSE_OR_ROLL",
  "CONFIRM_STRATEGIES",
  "PROVIDE_STRATEGY_METADATA",
  "REVIEW_SIZE",
  "REVIEW_COMPLEXITY",
  "STATE_CODE_CHANGE",
  "QUANTITY_CHANGE",
] as const;

