// Drizzle ORM schema definitions
// Matches the database schema defined in docs/db_schema_v1.md
// Tables created via Supabase MCP migration: create_initial_schema_v1

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  date,
  boolean,
  bigint,
  jsonb,
  integer,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// Accounts
// ============================================================================

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  brokerName: text('broker_name').notNull(),
  brokerAccountId: text('broker_account_id').notNull().unique(),
  baseCurrency: text('base_currency'),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// Underlyings
// ============================================================================

export const underlyings = pgTable('underlyings', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticker: text('ticker').notNull().unique(),
  name: text('name'),
  assetClass: text('asset_class'),
  baseCurrency: text('base_currency'),
  spot: numeric('spot'),
  iv30: numeric('iv30'),
  atr20: numeric('atr20'),
  rv20: numeric('rv20'),
  nextEarningsDate: date('next_earnings_date'),
  nextExDivDate: date('next_ex_div_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// Underlyings IV History
// ============================================================================

export const underlyingsIvHistory = pgTable(
  'underlyings_iv_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id')
      .notNull()
      .references(() => underlyings.id, { onDelete: 'cascade' }),
    asOfDate: date('as_of_date').notNull(),
    spot: numeric('spot'),
    iv30: numeric('iv30'),
    atr20: numeric('atr20'),
    rv20: numeric('rv20'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueUnderlyingDate: unique().on(table.underlyingId, table.asOfDate),
  })
);

// ============================================================================
// Strategy Templates
// ============================================================================

export const strategyTemplates = pgTable('strategy_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  strategyKey: text('strategy_key').notNull().unique(),
  label: text('label').notNull(),
  underlyingId: uuid('underlying_id')
    .notNull()
    .references(() => underlyings.id, { onDelete: 'restrict' }),
  minDte: integer('min_dte'),
  maxDte: integer('max_dte'),
  defaultTimeHorizon: text('default_time_horizon'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// Strategies
// ============================================================================

export const strategies = pgTable(
  'strategies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    strategyTemplateId: uuid('strategy_template_id')
      .notNull()
      .references(() => strategyTemplates.id, { onDelete: 'restrict' }),
    strategyKey: text('strategy_key').notNull(),
    accountId: uuid('account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    status: text('status').notNull().default('open'),
    // Entry context
    entrySpot: numeric('entry_spot'),
    entryIv30: numeric('entry_iv30'),
    netPremium: numeric('net_premium'),
    entryNotional: numeric('entry_notional'),
    timeHorizon: text('time_horizon'),
    thesis: text('thesis'),
    entryContext: text('entry_context'),
    profitRules: text('profit_rules'),
    defenseRules: text('defense_rules'),
    timeRules: text('time_rules'),
    exitCriteria: text('exit_criteria'),
    // Aggregated metrics
    totalAbsNotional: numeric('total_abs_notional'),
    totalUnrealizedPnl: numeric('total_unrealized_pnl'),
    // Auto-derivation metadata
    isAuto: boolean('is_auto').notNull().default(false),
    autoSource: text('auto_source'),
    autoDerivedLabel: text('auto_derived_label'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    // Playbook linkage
    strategyType: text('strategy_type'), // Links to playbook_items.strategy_type
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    accountStrategyIdx: index('idx_strategies_account').on(table.accountId),
    strategyKeyIdx: index('idx_strategies_key').on(table.strategyKey),
  })
);

// ============================================================================
// Trades
// ============================================================================

export const trades = pgTable(
  'trades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    strategyId: uuid('strategy_id').references(() => strategies.id, {
      onDelete: 'set null',
    }),
    brokerTransactionId: text('broker_transaction_id').unique(),
    brokerExecId: text('broker_exec_id'),
    assetClass: text('asset_class'),
    symbol: text('symbol').notNull(),
    conid: bigint('conid', { mode: 'number' }),
    currency: text('currency'),
    fxRateToBase: numeric('fx_rate_to_base'),
    tradeDate: timestamp('trade_date', { withTimezone: true }).notNull(),
    side: text('side').notNull(), // 'BUY' | 'SELL'
    quantity: numeric('quantity').notNull(),
    price: numeric('price').notNull(),
    grossAmount: numeric('gross_amount'),
    netAmount: numeric('net_amount'),
    fees: numeric('fees'),
    orderType: text('order_type'),
    exchange: text('exchange'),
    rawRow: jsonb('raw_row'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    accountTradeDateIdx: index('idx_trades_account_trade_date').on(
      table.accountId,
      table.tradeDate
    ),
    strategyTradeDateIdx: index('idx_trades_strategy_trade_date').on(
      table.strategyId,
      table.tradeDate
    ),
  })
);

// ============================================================================
// Positions
// ============================================================================

export const positions = pgTable('positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  strategyId: uuid('strategy_id').references(() => strategies.id, {
    onDelete: 'set null',
  }),
  underlyingId: uuid('underlying_id').references(() => underlyings.id, {
    onDelete: 'set null',
  }),
  assetClass: text('asset_class'),
  symbol: text('symbol').notNull(),
  conid: bigint('conid', { mode: 'number' }),
  expiry: date('expiry'),
  strike: numeric('strike'),
  optionRight: text('option_right'), // 'C' | 'P'
  multiplier: numeric('multiplier'),
  side: text('side'), // 'LONG' | 'SHORT'
  quantity: numeric('quantity').notNull(),
  avgPrice: numeric('avg_price'),
  openDate: timestamp('open_date', { withTimezone: true }),
  closeDate: timestamp('close_date', { withTimezone: true }),
  positionType: text('position_type'),
  isOpen: boolean('is_open').notNull().default(true),
  // Mark-to-market fields
  spot: numeric('spot'),
  intrinsic: numeric('intrinsic'),
  extrinsic: numeric('extrinsic'),
  absNotional: numeric('abs_notional'),
  unrealizedPnl: numeric('unrealized_pnl'),
  snapshotDate: date('snapshot_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// MTM Snapshots
// ============================================================================

export const mtmSnapshots = pgTable(
  'mtm_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotDate: date('snapshot_date').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id').references(() => positions.id, {
      onDelete: 'set null',
    }),
    symbol: text('symbol').notNull(),
    assetClass: text('asset_class'),
    currency: text('currency'),
    quantity: numeric('quantity'),
    markPrice: numeric('mark_price'),
    marketValue: numeric('market_value'),
    unrealizedPnl: numeric('unrealized_pnl'),
    realizedPnl: numeric('realized_pnl'),
    transactionMtmPnl: numeric('transaction_mtm_pnl'),
    priorOpenMtmPnl: numeric('prior_open_mtm_pnl'),
    commissions: numeric('commissions'),
    total: numeric('total'),
    rawRow: jsonb('raw_row'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    accountSnapshotIdx: index('idx_mtm_account_snapshot_date').on(
      table.accountId,
      table.snapshotDate
    ),
    positionSnapshotIdx: index('idx_mtm_position_snapshot_date').on(
      table.positionId,
      table.snapshotDate
    ),
  })
);

// ============================================================================
// NAV Snapshots
// ============================================================================

export const navSnapshots = pgTable(
  'nav_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    reportDate: date('report_date').notNull(),
    currency: text('currency').notNull(),
    total: numeric('total').notNull(),
    totalLong: numeric('total_long'),
    totalShort: numeric('total_short'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAccountDate: unique().on(table.accountId, table.reportDate),
  })
);

// ============================================================================
// Triage Records
// ============================================================================

export const triageRecords = pgTable(
  'triage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotDate: date('snapshot_date').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    contextLevel: text('context_level').notNull(), // 'position' | 'strategy' | 'underlying' | 'account'
    positionId: uuid('position_id').references(() => positions.id, {
      onDelete: 'set null',
    }),
    strategyId: uuid('strategy_id').references(() => strategies.id, {
      onDelete: 'set null',
    }),
    underlyingId: uuid('underlying_id').references(() => underlyings.id, {
      onDelete: 'set null',
    }),
    symbol: text('symbol').notNull(),
    assetClass: text('asset_class'),
    dte: integer('dte'),
    dteBucket: text('dte_bucket'),
    flagDteShort: boolean('flag_dte_short'),
    flagDteLong: boolean('flag_dte_long'),
    isItm: boolean('is_itm'),
    sigmaToStrike: numeric('sigma_to_strike'),
    flagSigma05: boolean('flag_sigma_0_5'),
    flagSigma10: boolean('flag_sigma_1_0'),
    flagAssignment: boolean('flag_assignment'),
    unrealizedPnl: numeric('unrealized_pnl'),
    absNotional: numeric('abs_notional'),
    pctNavAbsNotional: numeric('pct_nav_abs_notional'),
    severity: text('severity'), // 'info' | 'watch' | 'attention' | 'urgent'
    recommendedAction: text('recommended_action'),
    notes: text('notes'),
    ruleSet: text('rule_set'), // e.g. 'options_v1'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    snapshotActionIdx: index('idx_triage_snapshot_action').on(
      table.snapshotDate,
      table.recommendedAction
    ),
    strategySnapshotIdx: index('idx_triage_strategy_snapshot').on(
      table.strategyId,
      table.snapshotDate
    ),
    positionSnapshotIdx: index('idx_triage_position_snapshot').on(
      table.positionId,
      table.snapshotDate
    ),
  })
);

// ============================================================================
// Playbook Items
// ============================================================================

export const playbookItems = pgTable(
  'playbook_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(), // StateCode like "LC1", "RR1", "STK0"
    label: text('label').notNull(), // Description from WeeklyOptionsReview
    description: text('description'), // More detailed explanation
    category: text('category').notNull(), // 'entry' | 'profit' | 'defense' | 'time' | 'risk' | 'meta'
    strategyType: text('strategy_type').notNull(), // StrategyType like "LEAPS long call", "LEAPS risk reversal"
    criteria: text('criteria'), // Criteria column from WeeklyOptionsReview
    appliesToContext: text('applies_to_context'), // 'strategy' | 'position' | 'portfolio' | 'underlying'
    strategyTemplateId: uuid('strategy_template_id').references(() => strategyTemplates.id, {
      onDelete: 'set null',
    }),
    checklistItems: jsonb('checklist_items'), // JSON array with PrimaryAction, SecondaryAction, RiskNotes
    linkedTriageRuleSet: text('linked_triage_rule_set'), // e.g. 'options_v1'
    defaultSeverity: text('default_severity'), // 'info' | 'watch' | 'attention' | 'urgent'
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    codeIdx: index('idx_playbook_code').on(table.code),
    strategyTypeIdx: index('idx_playbook_strategy_type').on(table.strategyType),
    categoryIdx: index('idx_playbook_category').on(table.category),
  })
);

// ============================================================================
// Blotter Actions
// ============================================================================

export const blotterActions = pgTable(
  'blotter_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blotterId: text('blotter_id').notNull().unique(),
    actionDate: date('action_date').notNull(),
    snapshotDate: date('snapshot_date'),
    strategyId: uuid('strategy_id').references(() => strategies.id, {
      onDelete: 'set null',
    }),
    strategyKey: text('strategy_key'),
    strategyLabel: text('strategy_label'),
    ticker: text('ticker'),
    strategyTypeAtAction: text('strategy_type_at_action'),
    stateCodeAtAction: text('state_code_at_action'),
    triageFlagAtAction: text('triage_flag_at_action'),
    reasonCode: text('reason_code'),
    actionClass: text('action_class'),
    actionDetail: text('action_detail'),
    legScope: text('leg_scope'),
    executionRef: text('execution_ref'),
    qtyChange: numeric('qty_change'),
    premiumChange: numeric('premium_change'),
    realizedPnl: numeric('realized_pnl'),
    sizeBeforeNotional: numeric('size_before_notional'),
    sizeAfterNotional: numeric('size_after_notional'),
    riskNotesAtAction: text('risk_notes_at_action'),
    notes: text('notes'),
    followUpRequired: boolean('follow_up_required'),
    followUpDate: date('follow_up_date'),
    completed: boolean('completed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    strategyActionDateIdx: index('idx_blotter_strategy_action_date').on(
      table.strategyId,
      table.actionDate
    ),
    followUpIdx: index('idx_blotter_follow_up').on(
      table.followUpRequired,
      table.followUpDate
    ),
  })
);

// ============================================================================
// Portfolio Snapshots
// ============================================================================

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    level: text('level').notNull(), // 'account' | 'underlying'
    underlyingId: uuid('underlying_id').references(() => underlyings.id, {
      onDelete: 'set null',
    }),
    totalAbsNotional: numeric('total_abs_notional'),
    totalUnrealizedPnl: numeric('total_unrealized_pnl'),
    navAtSnapshot: numeric('nav_at_snapshot'),
    pctNavAbsNotional: numeric('pct_nav_abs_notional'),
    absStockNotional: numeric('abs_stock_notional'),
    absOptionNotional: numeric('abs_option_notional'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    accountSnapshotLevelIdx: index('idx_portfolio_account_snapshot_level').on(
      table.accountId,
      table.snapshotDate,
      table.level
    ),
    underlyingSnapshotIdx: index('idx_portfolio_underlying_snapshot').on(
      table.underlyingId,
      table.snapshotDate
    ),
  })
);

// ============================================================================
// Strategy Metrics Snapshots
// ============================================================================

export const strategyMetricsSnapshots = pgTable(
  'strategy_metrics_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    strategyId: uuid('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalAbsNotional: numeric('total_abs_notional'),
    totalUnrealizedPnl: numeric('total_unrealized_pnl'),
    navAtSnapshot: numeric('nav_at_snapshot'),
    pctNavAbsNotional: numeric('pct_nav_abs_notional'),
    numOpenPositions: integer('num_open_positions'),
    minDte: integer('min_dte'),
    maxDte: integer('max_dte'),
    realizedPnlToDate: numeric('realized_pnl_to_date'),
    stateCode: text('state_code'), // Computed state code from playbook (e.g., "LC1", "RR2")
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueStrategySnapshot: unique().on(
      table.accountId,
      table.strategyId,
      table.snapshotDate
    ),
    strategySnapshotIdx: index('idx_strategy_metrics_strategy_snapshot').on(
      table.strategyId,
      table.snapshotDate
    ),
  })
);

// ============================================================================
// Type Exports
// ============================================================================

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Underlying = typeof underlyings.$inferSelect;
export type NewUnderlying = typeof underlyings.$inferInsert;

export type UnderlyingIvHistory = typeof underlyingsIvHistory.$inferSelect;
export type NewUnderlyingIvHistory = typeof underlyingsIvHistory.$inferInsert;

export type StrategyTemplate = typeof strategyTemplates.$inferSelect;
export type NewStrategyTemplate = typeof strategyTemplates.$inferInsert;

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;

export type PlaybookItem = typeof playbookItems.$inferSelect;
export type NewPlaybookItem = typeof playbookItems.$inferInsert;
export type NewStrategy = typeof strategies.$inferInsert;

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;

export type MtmSnapshot = typeof mtmSnapshots.$inferSelect;
export type NewMtmSnapshot = typeof mtmSnapshots.$inferInsert;

export type NavSnapshot = typeof navSnapshots.$inferSelect;
export type NewNavSnapshot = typeof navSnapshots.$inferInsert;

export type TriageRecord = typeof triageRecords.$inferSelect;
export type NewTriageRecord = typeof triageRecords.$inferInsert;

export type BlotterAction = typeof blotterActions.$inferSelect;
export type NewBlotterAction = typeof blotterActions.$inferInsert;

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type NewPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;

export type StrategyMetricsSnapshot = typeof strategyMetricsSnapshots.$inferSelect;
export type NewStrategyMetricsSnapshot = typeof strategyMetricsSnapshots.$inferInsert;
