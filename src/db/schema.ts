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
import { sql } from 'drizzle-orm';
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
  conid: bigint('conid', { mode: 'number' }), // IBKR contract ID for faster API calls
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
// Macro Theses
// ============================================================================

export const macroTheses = pgTable(
  'macro_theses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    thesisType: text('thesis_type').notNull(), // 'secular' | 'cyclical' | 'structural'
    timeHorizon: text('time_horizon'), // 'long_term' | 'medium_term' | 'short_term'
    confidenceLevel: text('confidence_level'), // 'high' | 'medium' | 'low' | 'exploratory'
    status: text('status').notNull().default('active'), // 'active' | 'under_review' | 'retired' | 'superseded'

    // Position structure (NEW)
    sectors: text('sectors').array().default(sql`'{}'`), // e.g., ['AI hyperscalers', 'crypto alts']
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral'
    positionStartDate: date('position_start_date'),
    positionEndDate: date('position_end_date'),

    // Outcome tracking (NEW)
    outcome: text('outcome'), // 'validated' | 'invalidated' | 'partial' | 'ongoing'
    outcomeNotes: text('outcome_notes'),
    actualOutcomeDate: date('actual_outcome_date'),

    // Workflow status (user-controlled intent)
    workflowStatus: text('workflow_status').default('developing'), // 'developing' | 'monitoring' | 'paused' | 'validated' | 'invalidated' | 'abandoned'

    // Track claims count when articulation was last generated (for triage rule #2)
    claimsCountAtLastArticulation: integer('claims_count_at_last_articulation').default(0),

    // DEPRECATED: Use workflowStatus instead. Kept temporarily for migration safety.
    lifecycleStatus: text('lifecycle_status').default('created'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewDueAt: timestamp('next_review_due_at', { withTimezone: true }),
    notes: jsonb('notes'),
  },
  (table) => ({
    statusIdx: index('idx_macro_theses_status').on(table.status),
    typeIdx: index('idx_macro_theses_type').on(table.thesisType),
    nextReviewIdx: index('idx_macro_theses_next_review').on(table.nextReviewDueAt),
    directionIdx: index('idx_macro_theses_direction').on(table.direction),
    positionDatesIdx: index('idx_macro_theses_position_dates').on(table.positionStartDate, table.positionEndDate),
    workflowIdx: index('idx_macro_theses_workflow').on(table.workflowStatus),
  })
);

export type MacroThesis = typeof macroTheses.$inferSelect;
export type NewMacroThesis = typeof macroTheses.$inferInsert;

// ============================================================================
// Asset Theses
// ============================================================================

export const assetTheses = pgTable(
  'asset_theses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Note: primaryMacroThesisId removed - all macro thesis links now use junction table
    underlyingId: uuid('underlying_id').references(() => underlyings.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    narrative: text('narrative'),
    fundamentalContext: text('fundamental_context'),
    positioningContext: text('positioning_context'),
    regimeContext: text('regime_context'),
    timeHorizon: text('time_horizon'),
    confidenceLevel: text('confidence_level'),
    status: text('status').notNull().default('active'),

    // AI-generated summary (Phase 2.8)
    aiSummary: text('ai_summary'),
    aiSummaryDetailLevel: text('ai_summary_detail_level'),
    aiSummaryGeneratedAt: timestamp('ai_summary_generated_at', { withTimezone: true }),
    aiSummaryClaimIds: text('ai_summary_claim_ids').array().default(sql`'{}'`),
    aiSummaryClaimCount: integer('ai_summary_claim_count').default(0),

    // Position structure (NEW)
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral'
    positionStartDate: date('position_start_date'),
    positionEndDate: date('position_end_date'),

    // Price targets (NEW)
    targetPrice: numeric('target_price'),
    entryReferencePrice: numeric('entry_reference_price'),

    // Outcome tracking (NEW)
    outcome: text('outcome'), // 'validated' | 'invalidated' | 'partial' | 'ongoing'
    outcomeNotes: text('outcome_notes'),
    actualOutcomeDate: date('actual_outcome_date'),
    actualPrice: numeric('actual_price'),

    // Workflow status (user-controlled intent)
    workflowStatus: text('workflow_status').default('developing'), // 'developing' | 'monitoring' | 'paused' | 'validated' | 'invalidated' | 'abandoned'

    // Track claims count when articulation was last generated (for triage rule #2)
    claimsCountAtLastArticulation: integer('claims_count_at_last_articulation').default(0),

    // DEPRECATED: Use workflowStatus instead. Kept temporarily for migration safety.
    lifecycleStatus: text('lifecycle_status').default('created'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewDueAt: timestamp('next_review_due_at', { withTimezone: true }),
    notes: jsonb('notes'),
  },
  (table) => ({
    underlyingIdx: index('idx_asset_theses_underlying').on(table.underlyingId),
    statusIdx: index('idx_asset_theses_status').on(table.status),
    nextReviewIdx: index('idx_asset_theses_next_review').on(table.nextReviewDueAt),
    directionIdx: index('idx_asset_theses_direction').on(table.direction),
    positionDatesIdx: index('idx_asset_theses_position_dates').on(table.positionStartDate, table.positionEndDate),
    workflowIdx: index('idx_asset_theses_workflow').on(table.workflowStatus),
  })
);

export type AssetThesis = typeof assetTheses.$inferSelect;
export type NewAssetThesis = typeof assetTheses.$inferInsert;

// ============================================================================
// Asset Thesis Related Macro Theses (Junction Table)
// ============================================================================

export const assetThesisRelatedMacroTheses = pgTable(
  'asset_thesis_related_macro_theses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assetThesisId: uuid('asset_thesis_id')
      .notNull()
      .references(() => assetTheses.id, { onDelete: 'cascade' }),
    macroThesisId: uuid('macro_thesis_id')
      .notNull()
      .references(() => macroTheses.id, { onDelete: 'cascade' }),
    
    // Optional metadata
    relationshipNote: text('relationship_note'), // e.g. "provides sector context", "supports timing"
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    addedBy: text('added_by'), // Future: user tracking
  },
  (table) => ({
    assetIdx: index('idx_at_related_mt_asset').on(table.assetThesisId),
    macroIdx: index('idx_at_related_mt_macro').on(table.macroThesisId),
    uniquePair: unique().on(table.assetThesisId, table.macroThesisId),
  })
);

export type AssetThesisRelatedMacroThesis = typeof assetThesisRelatedMacroTheses.$inferSelect;
export type NewAssetThesisRelatedMacroThesis = typeof assetThesisRelatedMacroTheses.$inferInsert;

// ============================================================================
// Relations Definitions (for Drizzle relational query builder)
// ============================================================================

// Note: Forward references to strategies table (defined below) - Drizzle handles this
export const macroThesesRelations = relations(macroTheses, ({ many }) => ({
  // All macro thesis links now go through junction table
  linkedAssetTheses: many(assetThesisRelatedMacroTheses),
}));

export const assetThesesRelations = relations(assetTheses, ({ many }) => ({
  // Macro theses (many-to-many via junction table)
  linkedMacroTheses: many(assetThesisRelatedMacroTheses),
  // Strategies linked to this asset thesis
  linkedStrategies: many(strategies),
}));

export const assetThesisRelatedMacroThesesRelations = relations(
  assetThesisRelatedMacroTheses,
  ({ one }) => ({
    assetThesis: one(assetTheses, {
      fields: [assetThesisRelatedMacroTheses.assetThesisId],
      references: [assetTheses.id],
    }),
    macroThesis: one(macroTheses, {
      fields: [assetThesisRelatedMacroTheses.macroThesisId],
      references: [macroTheses.id],
    }),
  })
);

// Note: strategiesRelations is defined after the strategies table below

// ============================================================================
// Main Claims (First-Class Claim Entities)
// ============================================================================

export const mainClaims = pgTable(
  'main_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Claim identity
    title: text('title').notNull(),
    category: text('category').notNull(), // 'macro' | 'asset_specific'

    // Toulmin Framework (full structure)
    claim: text('claim').notNull(),
    evidence: text('evidence').array(), // Array of evidence points
    reasoning: text('reasoning'),
    backing: text('backing'),
    qualifier: text('qualifier'), // 'high' | 'medium' | 'low' | 'exploratory'
    rebuttal: text('rebuttal').array(), // Array of rebuttal points

    // Metadata
    timeHorizon: text('time_horizon'), // 'long_term' | 'medium_term' | 'short_term'
    relevantTickers: text('relevant_tickers').array(),

    // Lifecycle
    status: text('status').notNull().default('unconfirmed'), // 'unconfirmed' | 'confirmed' | 'rejected' | 'invalidated' | 'merged'
    confidenceEvolution: jsonb('confidence_evolution'),

    // Source tracking (for auto-promoted audit claims)
    sourceInsightId: uuid('source_insight_id').references(() => researchInsights.id, { onDelete: 'set null' }),
    sourceClaimId: text('source_claim_id'), // The claim ID from the audit JSONB (e.g., "claim-1")

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastEvidenceAddedAt: timestamp('last_evidence_added_at', { withTimezone: true }),
  },
  (table) => ({
    categoryIdx: index('idx_main_claims_category').on(table.category),
    statusIdx: index('idx_main_claims_status').on(table.status),
    tickersIdx: index('idx_main_claims_tickers').on(table.relevantTickers),
    sourceInsightIdx: index('idx_main_claims_source_insight').on(table.sourceInsightId),
  })
);

export type MainClaim = typeof mainClaims.$inferSelect;
export type NewMainClaim = typeof mainClaims.$inferInsert;

// ============================================================================
// Main Claim Evidence (Links Supporting Claims to Main Claims)
// ============================================================================

export const mainClaimEvidence = pgTable(
  'main_claim_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    mainClaimId: uuid('main_claim_id')
      .notNull()
      .references(() => mainClaims.id, { onDelete: 'cascade' }),
    researchInsightId: uuid('research_insight_id')
      .notNull()
      .references(() => researchInsights.id, { onDelete: 'cascade' }),

    // Path to supporting claim in claims_structure JSONB
    supportingClaimId: text('supporting_claim_id').notNull(),

    // Relationship type
    relationshipType: text('relationship_type').notNull(), // 'supports' | 'refutes' | 'qualifies'

    // Metadata
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    addedBy: text('added_by'),
    notes: text('notes'),
  },
  (table) => ({
    mainClaimIdx: index('idx_main_claim_evidence_main_claim').on(table.mainClaimId),
    insightIdx: index('idx_main_claim_evidence_insight').on(table.researchInsightId),
  })
);

export type MainClaimEvidence = typeof mainClaimEvidence.$inferSelect;
export type NewMainClaimEvidence = typeof mainClaimEvidence.$inferInsert;

// ============================================================================
// Claim Thesis Mappings (Many-to-Many: Claims ↔ Theses/Views)
// ============================================================================

export const claimThesisMappings = pgTable(
  'claim_thesis_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    mainClaimId: uuid('main_claim_id')
      .notNull()
      .references(() => mainClaims.id, { onDelete: 'cascade' }),

    // Exactly one of these must be set
    macroThesisId: uuid('macro_thesis_id').references(() => macroTheses.id, {
      onDelete: 'cascade',
    }),
    assetThesisId: uuid('asset_thesis_id').references(() => assetTheses.id, {
      onDelete: 'cascade',
    }),

    // Relationship
    mappingType: text('mapping_type').notNull(), // 'supports' | 'refutes' | 'foundation'
    confidence: text('confidence'), // 'high' | 'medium' | 'low'

    // Metadata
    mappedAt: timestamp('mapped_at', { withTimezone: true }).notNull().defaultNow(),
    mappedBy: text('mapped_by').notNull(),
    notes: text('notes'),
  },
  (table) => ({
    mainClaimIdx: index('idx_claim_thesis_main_claim').on(table.mainClaimId),
    macroThesisIdx: index('idx_claim_thesis_macro').on(table.macroThesisId),
    assetThesisIdx: index('idx_claim_thesis').on(table.assetThesisId),
  })
);

export type ClaimThesisMapping = typeof claimThesisMappings.$inferSelect;
export type NewClaimThesisMapping = typeof claimThesisMappings.$inferInsert;

// ============================================================================
// Underlyings IV History
// ============================================================================

export const underlyingsIvHistory = pgTable(
  'underlyings_iv_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id')
      .references(() => underlyings.id, { onDelete: 'cascade' }), // NULLABLE in actual DB
    ticker: text('ticker').notNull(), // Denormalized for easier querying and historical preservation
    asOfDate: date('as_of_date').notNull(),
    spot: numeric('spot'),
    iv30: numeric('iv30'),
    atr20: numeric('atr20'),
    rv20: numeric('rv20'),
    source: text('source').notNull().default('manual'), // Data source: 'opt_strat', 'ibkr', 'massive', 'yahoo_finance', etc.
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueTickerDateSource: unique().on(table.ticker, table.asOfDate, table.source),
  })
);

// ============================================================================
// Options Chain Snapshots
// ============================================================================

/**
 * Stores full options chain snapshots for historical IV analysis
 * Enables calculation of IV Rank, IV Percentile, and other IV-based metrics
 */
export const optionsChainSnapshots = pgTable(
  'options_chain_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id')
      .references(() => underlyings.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(), // Denormalized for easier querying
    snapshotDate: date('snapshot_date').notNull(),
    underlyingSpot: numeric('underlying_spot'), // Spot price at snapshot time
    source: text('source').notNull().default('massive'), // 'massive', 'ibkr', 'manual', etc.
    
    // Option contract details
    contractType: text('contract_type'), // 'call' | 'put'
    strike: numeric('strike').notNull(),
    expirationDate: date('expiration_date').notNull(),
    dte: integer('dte'), // Days to expiry (calculated at snapshot time)
    
    // Pricing and volatility
    impliedVolatility: numeric('implied_volatility'), // IV for this contract (decimal, e.g. 0.45 for 45%)
    bid: numeric('bid'),
    ask: numeric('ask'),
    last: numeric('last'),
    volume: integer('volume'),
    openInterest: integer('open_interest'),
    
    // Additional metadata
    rawData: jsonb('raw_data'), // Store full raw response for future use
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: one record per contract per snapshot date
    uniqueContractSnapshot: unique().on(
      table.ticker,
      table.snapshotDate,
      table.contractType,
      table.strike,
      table.expirationDate,
      table.source
    ),
    // Indexes for common queries
    idxTickerDate: index('idx_options_chain_ticker_date').on(table.ticker, table.snapshotDate),
    idxUnderlyingDate: index('idx_options_chain_underlying_date').on(table.underlyingId, table.snapshotDate),
    idxExpiration: index('idx_options_chain_expiration').on(table.expirationDate),
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
    // Entry metrics (computed during confirmation)
    entrySpot: numeric('entry_spot'),
    entryIv30: numeric('entry_iv30'),
    netPremium: numeric('net_premium'),
    entryNotional: numeric('entry_notional'),
    timeHorizon: text('time_horizon'),
    // Note: thesis, profitRules, defenseRules, timeRules, exitCriteria, entryContext removed
    // These now come from linked asset_thesis via assetThesisId
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
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral' - strategy directional bias
    // Hierarchy linkage (Phase 1)
    // Note: Strategies inherit macro thesis connections through assetThesisId
    assetThesisId: uuid('asset_thesis_id').references(() => assetTheses.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    accountStrategyIdx: index('idx_strategies_account').on(table.accountId),
    strategyKeyIdx: index('idx_strategies_key').on(table.strategyKey),
    assetThesisIdx: index('idx_strategies_asset_thesis').on(table.assetThesisId),
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
  costBasisMoney: numeric('cost_basis_money'), // CostBasisMoney from Flex (net premium/entry notional)
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
      onDelete: 'cascade',
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
    severity: text('severity'), // 'info' | 'monitor' | 'attention' | 'urgent' | 'pending' | 'complete'
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral' - net direction of position(s)
    recommendedAction: text('recommended_action'),
    notes: text('notes'),
    ruleSet: text('rule_set'), // e.g. 'options_v1'
    unmatchedTradeExecutions: jsonb('unmatched_trade_executions'), // JSONB array of unmatched trade blotter entry details (for QUANTITY_CHANGE)
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
    defaultSeverity: text('default_severity'), // 'info' | 'attention' | 'urgent' (computed severities only, 'monitor' set via override)
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

export const blotterActions: any = pgTable(
  'blotter_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blotterId: text('blotter_id').notNull().unique(),
    actionDate: date('action_date').notNull(),
    snapshotDate: date('snapshot_date'),
    strategyId: uuid('strategy_id').references(() => strategies.id, {
      onDelete: 'set null',
    }),
    positionId: uuid('position_id').references(() => positions.id, {
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
    severityOverride: text('severity_override'), // 'info' | 'monitor' | 'attention' | 'urgent' | 'pending' | 'complete'
    overrideExpiresDate: date('override_expires_date'), // null = permanent override
    monitorDays: integer('monitor_days'), // For MONITOR actions: days before reverting
    tradeReason: text('trade_reason'), // Explanation for the trade action taken (for QUANTITY_CHANGE triggers)
    tradeStage: text('trade_stage'), // 'open' | 'close' | 'hedge' | 'roll' | 'reduce' | 'add' (for QUANTITY_CHANGE triggers)
    source: text('source').default('triage_action'), // 'triage_action' | 'trade_ingestion'
    tradeId: uuid('trade_id').references(() => trades.id, { onDelete: 'set null' }), // For single trade links
    tradeIds: jsonb('trade_ids'), // Array of trade IDs for aggregated entries
    tradeCount: integer('trade_count'), // Number of trades in aggregation
    conid: bigint('conid', { mode: 'number' }), // Contract ID for matching trades to positions
    linkedBlotterActionId: uuid('linked_blotter_action_id').references(() => blotterActions.id, { onDelete: 'set null' }), // Bidirectional link to matching entry (primary/backward compatible)
    linkedTradeBlotterIds: jsonb('linked_trade_blotter_ids'), // Array of linked trade blotter entry IDs (for QUANTITY_CHANGE linking to multiple TRADE_INGESTED entries)
    // Enhanced decision capture (Phase 1)
    decisionType: text('decision_type'), // 'trade' | 'update_thesis' | 'record_observation' | 'no_action'
    decisionRationale: text('decision_rationale'),
    confidenceLevel: text('confidence_level'), // 'high' | 'medium' | 'low'
    convictionScore: integer('conviction_score'), // 1-10 scale
    expectedOutcome: text('expected_outcome'),
    actualOutcome: text('actual_outcome'),
    outcomeEvaluatedAt: timestamp('outcome_evaluated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
    overrideIdx: index('idx_blotter_override').on(
      table.positionId,
      table.strategyId,
      table.triageFlagAtAction,
      table.overrideExpiresDate
    ),
    tradeSourceIdx: index('idx_blotter_trade_source').on(
      table.strategyId,
      table.ticker,
      table.actionDate,
      table.source
    ),
    conidIdx: index('idx_blotter_conid').on(table.conid),
    linkedIdx: index('idx_blotter_linked').on(table.linkedBlotterActionId),
    decisionTypeIdx: index('idx_blotter_decision_type').on(table.decisionType),
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
export type NewOptionsChainSnapshot = typeof optionsChainSnapshots.$inferInsert;

export type StrategyTemplate = typeof strategyTemplates.$inferSelect;
export type NewStrategyTemplate = typeof strategyTemplates.$inferInsert;

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;

// Strategies relations (defined here after strategies table)
export const strategiesRelations = relations(strategies, ({ one }) => ({
  assetThesis: one(assetTheses, {
    fields: [strategies.assetThesisId],
    references: [assetTheses.id],
  }),
}));

export type PlaybookItem = typeof playbookItems.$inferSelect;
export type NewPlaybookItem = typeof playbookItems.$inferInsert;

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

// ============================================================================
// Ingestion Runs (Process Tracking)
// ============================================================================

export const ingestionRuns = pgTable('ingestion_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobType: text('job_type').notNull(), // 'trade_ingestion' | 'position_ingestion' | 'recompute_all' | 'recompute_portfolio' | 'recompute_strategy_metrics' | 'recompute_triage' | 'recompute_blotter' | 'recompute_blotter_trades'
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
  trigger: text('trigger'), // 'manual' | 'auto' | 'scheduled' | 'api'
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }), // Track per-account processes
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  payload: jsonb('payload'), // Input parameters (date ranges, filters, etc.)
  result: jsonb('result'), // Output results (counts, stats, etc.)
  error: text('error'), // Error message if failed
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index('idx_ingestion_runs_status').on(table.status),
  jobTypeIdx: index('idx_ingestion_runs_job_type').on(table.jobType),
  accountIdx: index('idx_ingestion_runs_account').on(table.accountId),
  startedAtIdx: index('idx_ingestion_runs_started_at').on(table.startedAt),
}));

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;

// ============================================================================
// Flex Query Configs
// ============================================================================

export const flexQueryConfigs = pgTable('flex_query_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  queryName: text('query_name').notNull(),
  queryType: text('query_type').notNull(), // 'positions' | 'trades'
  flexToken: text('flex_token'), // Can be null if using env var
  queryId: text('query_id'), // Can be null if using env var
  isActive: boolean('is_active').notNull().default(true),
  scheduleCron: text('schedule_cron'), // Cron expression for scheduling
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunStatus: text('last_run_status'), // 'success' | 'failed' | 'pending'
  lastRunError: text('last_run_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountQueryNameIdx: unique().on(table.accountId, table.queryName),
  isActiveIdx: index('idx_flex_query_configs_is_active').on(table.isActive),
}));

export type FlexQueryConfig = typeof flexQueryConfigs.$inferSelect;
export type NewFlexQueryConfig = typeof flexQueryConfigs.$inferInsert;

// ============================================================================
// Research & Intelligence Layer (Phase 2)
// ============================================================================

// Research Artifacts - Raw research content from various sources
export const researchArtifacts = pgTable(
  'research_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Source metadata
    sourceType: text('source_type').notNull(),
    sourceUrl: text('source_url'),
    title: text('title').notNull(),
    author: text('author'),
    publishedDate: date('published_date'),

    // Content
    rawContent: text('raw_content').notNull(),
    contentFormat: text('content_format').default('text'),

    // File storage (for future uploads)
    fileStoragePath: text('file_storage_path'),
    fileName: text('file_name'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),

    // Processing status
    status: text('status').notNull().default('raw'),
    processingError: text('processing_error'),

    // Metadata
    metadata: jsonb('metadata'),
    tags: text('tags').array(),

    // Tracking
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    ingestedBy: uuid('ingested_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceTypeIdx: index('idx_research_artifacts_source_type').on(table.sourceType),
    statusIdx: index('idx_research_artifacts_status').on(table.status),
    ingestedAtIdx: index('idx_research_artifacts_ingested_at').on(table.ingestedAt),
    publishedDateIdx: index('idx_research_artifacts_published_date').on(table.publishedDate),
    tagsIdx: index('idx_research_artifacts_tags').on(table.tags),
  })
);

export type ResearchArtifact = typeof researchArtifacts.$inferSelect;
export type NewResearchArtifact = typeof researchArtifacts.$inferInsert;

// Research Insights - Structured knowledge extracted from research artifacts
export const researchInsights = pgTable(
  'research_insights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    researchArtifactId: uuid('research_artifact_id')
      .notNull()
      .references(() => researchArtifacts.id, { onDelete: 'cascade' }),

    // AI-generated structured content
    summary: text('summary').notNull(),
    keyThemes: text('key_themes').array(),

    // NEW: Hierarchical Toulmin claim structure (from local Claude workflow)
    claimsStructure: jsonb('claims_structure'),

    // DEPRECATED: Legacy flat claim structure (kept for migration compatibility)
    keyClaims: jsonb('key_claims'),
    supportingEvidence: jsonb('supporting_evidence'),
    counterEvidence: jsonb('counter_evidence'),

    // Extracted metadata
    timeHorizon: text('time_horizon'),
    confidenceLevel: text('confidence_level'),
    relevantTickers: text('relevant_tickers').array(),

    // Processing metadata
    structuredAt: timestamp('structured_at', { withTimezone: true }).notNull().defaultNow(),
    structuredBy: text('structured_by').notNull(),
    aiModel: text('ai_model'),
    aiProcessingCostUsd: numeric('ai_processing_cost_usd', { precision: 10, scale: 6 }),

    // Human review
    humanReviewed: boolean('human_reviewed').default(false),
    humanReviewNotes: text('human_review_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    artifactIdx: index('idx_research_insights_artifact').on(table.researchArtifactId),
    timeHorizonIdx: index('idx_research_insights_time_horizon').on(table.timeHorizon),
    structuredByIdx: index('idx_research_insights_structured_by').on(table.structuredBy),
    tickersIdx: index('idx_research_insights_tickers').on(table.relevantTickers),
    // GIN index for efficient JSONB queries on claims_structure
    claimsStructureIdx: index('idx_research_insights_claims_structure').on(table.claimsStructure),
  })
);

export type ResearchInsight = typeof researchInsights.$inferSelect;
export type NewResearchInsight = typeof researchInsights.$inferInsert;

// REMOVED: researchMappings table (2026-01-16)
// Deprecated - claims now link directly to theses via claim_thesis_mappings
// The insight-level mappings were redundant since claim-to-thesis relationships
// provide more granular and accurate provenance tracking.

// Research Hierarchy Recommendations - AI-generated recommendations for linking or creating hierarchy items
export const researchHierarchyRecommendations = pgTable(
  'research_hierarchy_recommendations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    researchInsightId: uuid('research_insight_id')
      .notNull()
      .references(() => researchInsights.id, { onDelete: 'cascade' }),

    // Recommendation type
    recommendationType: text('recommendation_type').notNull(), // 'new_macro_thesis' | 'new_asset_thesis' | 'link_existing' | 'refute_existing'

    // Proposed new item data (JSONB for flexibility)
    proposedData: jsonb('proposed_data'),

    // Existing item reference
    existingThesisId: uuid('existing_thesis_id').references(() => macroTheses.id, {
      onDelete: 'cascade',
    }),
    existingAssetThesisId: uuid('existing_asset_thesis_id').references(() => assetTheses.id, {
      onDelete: 'cascade',
    }),

    // Evidence relationship (if linking)
    mappingType: text('mapping_type'), // 'supports' | 'refutes' | 'neutral' | 'exploratory'
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }), // 0.00 to 1.00

    // Reasoning
    reasoning: text('reasoning').notNull(),

    // Status
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'rejected' | 'modified'

    // AI metadata
    aiModel: text('ai_model').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // User action
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    modifiedByUser: boolean('modified_by_user').default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    insightIdx: index('idx_recommendations_insight').on(table.researchInsightId),
    statusIdx: index('idx_recommendations_status').on(table.status),
    typeIdx: index('idx_recommendations_type').on(table.recommendationType),
    thesisIdx: index('idx_recommendations_thesis').on(table.existingThesisId),
    viewIdx: index('idx_recommendations_view').on(table.existingAssetThesisId),
  })
);

export type ResearchHierarchyRecommendation =
  typeof researchHierarchyRecommendations.$inferSelect;
export type NewResearchHierarchyRecommendation =
  typeof researchHierarchyRecommendations.$inferInsert;

// Research Processing Runs - Track AI processing jobs
export const researchProcessingRuns = pgTable(
  'research_processing_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    researchArtifactId: uuid('research_artifact_id')
      .notNull()
      .references(() => researchArtifacts.id, { onDelete: 'cascade' }),

    // Processing metadata
    jobType: text('job_type').notNull(),
    status: text('status').notNull().default('pending'),

    // Timing
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Results
    result: jsonb('result'),
    errorMessage: text('error_message'),

    // Cost tracking
    aiModel: text('ai_model'),
    tokensUsed: integer('tokens_used'),
    processingCostUsd: numeric('processing_cost_usd', { precision: 10, scale: 6 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    artifactIdx: index('idx_research_processing_artifact').on(table.researchArtifactId),
    statusIdx: index('idx_research_processing_status').on(table.status),
    startedAtIdx: index('idx_research_processing_started_at').on(table.startedAt),
  })
);

export type ResearchProcessingRun = typeof researchProcessingRuns.$inferSelect;
export type NewResearchProcessingRun = typeof researchProcessingRuns.$inferInsert;

// AI Prompts - Editable prompts for AI research processing
export const aiPrompts = pgTable(
  'ai_prompts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Prompt identification
    promptType: text('prompt_type').notNull(), // 'insight_extraction' | 'hierarchy_analysis' | 'recommendation_generation'
    name: text('name').notNull(), // User-friendly name
    description: text('description'), // What this prompt does

    // Prompt content
    content: text('content').notNull(), // The actual prompt template
    variables: text('variables').array(), // Available template variables

    // Versioning
    version: integer('version').notNull().default(1),
    parentVersionId: uuid('parent_version_id'), // Previous version (self-reference handled in migration)

    // Status
    status: text('status').notNull().default('draft'), // 'active' | 'draft' | 'archived'
    isDefault: boolean('is_default').notNull().default(false), // System default prompt

    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'), // User ID (nullable for system prompts)

    // Usage tracking
    usageCount: integer('usage_count').default(0), // How many times this prompt has been used
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => ({
    typeStatusIdx: index('idx_prompts_type_status').on(table.promptType, table.status),
    defaultIdx: index('idx_prompts_default').on(table.promptType, table.isDefault).where(
      sql`is_default = true`
    ),
    activeIdx: index('idx_prompts_active').on(table.promptType, table.status).where(
      sql`status = 'active'`
    ),
  })
);

export type AIPrompt = typeof aiPrompts.$inferSelect;
export type NewAIPrompt = typeof aiPrompts.$inferInsert;

// ============================================================================
// Phase 3.1: Thesis Synthesis & Monitoring System
// ============================================================================

// Thesis Articulations - Versioned synthesized thesis articulations
export const thesisArticulations = pgTable(
  'thesis_articulations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    thesisId: uuid('thesis_id').notNull(),
    thesisType: text('thesis_type').notNull(), // 'macro' | 'asset'
    version: integer('version').notNull().default(1),

    // Core synthesis
    coreArgument: text('core_argument').notNull(),
    keyDrivers: jsonb('key_drivers').notNull().default([]),
    keyAssumptions: jsonb('key_assumptions').notNull().default([]),

    // Context
    timeframe: jsonb('timeframe').notNull(), // { horizon, expectedResolution }
    confidenceLevel: text('confidence_level').notNull(), // 'low' | 'medium' | 'high' | 'very_high'
    confidenceRationale: text('confidence_rationale'),
    evidenceGaps: jsonb('evidence_gaps').default([]),

    // Provenance
    claimIdsUsed: jsonb('claim_ids_used').notNull().default([]),
    generatedBy: text('generated_by').notNull(), // 'claude' | 'user'
    userEdits: text('user_edits'),

    // Compositional dependencies
    referencedTheses: jsonb('referenced_theses').default([]),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    thesisIdx: index('idx_articulations_thesis').on(table.thesisId, table.thesisType),
    createdIdx: index('idx_articulations_created').on(table.createdAt),
    uniqueVersion: unique().on(table.thesisId, table.thesisType, table.version),
  })
);

export type ThesisArticulation = typeof thesisArticulations.$inferSelect;
export type NewThesisArticulation = typeof thesisArticulations.$inferInsert;

// Signals - Explicit confirmation/warning criteria for theses AND strategies
export const signals = pgTable(
  'signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Entity type: 'thesis' (macro/asset thesis) or 'strategy'
    entityType: text('entity_type').notNull().default('thesis'), // 'thesis' | 'strategy'

    // For thesis signals (entity_type = 'thesis')
    thesisId: uuid('thesis_id'), // Nullable - null when entity_type = 'strategy'
    thesisType: text('thesis_type'), // 'macro' | 'asset' - null when entity_type = 'strategy'
    articulationId: uuid('articulation_id').references(() => thesisArticulations.id, {
      onDelete: 'set null',
    }),

    // For strategy signals (entity_type = 'strategy')
    strategyId: uuid('strategy_id').references(() => strategies.id, {
      onDelete: 'cascade',
    }),

    // Core definition
    type: text('type').notNull(), // 'confirmation' | 'warning'
    statement: text('statement').notNull(),
    notes: text('notes'), // Free-form notes (replaces rationale, judgmentDetails, responseProtocol)

    // Classification
    category: text('category').notNull(), // 'judgment' | 'data_driven'
    importance: text('importance').notNull(), // 'critical' | 'significant' | 'supporting'

    // Data-driven trigger configuration
    // For thesis signals: see ExplicitDetails type in components/signals/SignalConfigForm.tsx
    // For strategy signals: see StrategySignalConfig type in docs/design/260115-strategy-signals.md
    explicitDetails: jsonb('explicit_details'),

    // DEPRECATED fields (kept for backwards compatibility, will be migrated to notes)
    rationale: text('rationale'), // @deprecated - use notes
    timeframe: text('timeframe'), // @deprecated - rarely used
    judgmentDetails: jsonb('judgment_details'), // @deprecated - use notes
    responseProtocol: jsonb('response_protocol'), // @deprecated - use notes

    // Status: recommended (AI proposed) → not_triggered (accepted) → triggered (condition met)
    // Also: superseded (no longer relevant)
    // Note: 'monitoring' was removed in Phase 7 - all accepted signals are implicitly being monitored
    status: text('status').notNull().default('not_triggered'), // 'not_triggered' | 'triggered' | 'superseded' | 'recommended'

    // Dependent thesis reference (for compositional validation - thesis signals only)
    dependentThesisId: uuid('dependent_thesis_id'),
    dependentThesisType: text('dependent_thesis_type'), // 'macro' | 'asset'
    dependentThesisCondition: text('dependent_thesis_condition'), // 'invalidated' | 'confidence_drops' | 'status_changes'
    dependentThesisConditionDetail: text('dependent_thesis_condition_detail'),

    // Provenance
    linkedClaimIds: jsonb('linked_claim_ids').default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    thesisIdx: index('idx_signals_thesis').on(table.thesisId, table.thesisType),
    strategyIdx: index('idx_signals_strategy').on(table.strategyId),
    entityTypeIdx: index('idx_signals_entity_type').on(table.entityType),
    statusIdx: index('idx_signals_status').on(table.status),
    typeIdx: index('idx_signals_type').on(table.type),
    importanceIdx: index('idx_signals_importance').on(table.importance),
  })
);

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;

// Legacy aliases for backwards compatibility during migration
export const validationPoints = signals;
export type ValidationPoint = Signal;
export type NewValidationPoint = NewSignal;

// Signal Status History - Audit trail of status changes (renamed from validation_status_history)
export const signalStatusHistory = pgTable(
  'signal_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),

    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    previousStatus: text('previous_status'),
    newStatus: text('new_status').notNull(),

    // Evidence
    evidence: jsonb('evidence').notNull(), // { source, summary, link?, rawContent? }

    // Assessment
    confidence: text('confidence').notNull(), // 'low' | 'medium' | 'high'
    assessedBy: text('assessed_by').notNull(), // 'claude' | 'user'

    // Action tracking
    userActionRequired: boolean('user_action_required').default(false),
    userActionTaken: text('user_action_taken'),
    userActionTimestamp: timestamp('user_action_timestamp', { withTimezone: true }),
  },
  (table) => ({
    signalIdx: index('idx_signal_status_history_signal').on(table.signalId),
    timestampIdx: index('idx_signal_status_history_timestamp').on(table.timestamp),
  })
);

export type SignalStatusHistory = typeof signalStatusHistory.$inferSelect;
export type NewSignalStatusHistory = typeof signalStatusHistory.$inferInsert;

// Legacy aliases for backwards compatibility during migration
export const validationStatusHistory = signalStatusHistory;
export type ValidationStatusHistory = SignalStatusHistory;
export type NewValidationStatusHistory = NewSignalStatusHistory;

// Signal Data Tracking - Tracks last observed data for on_release trigger detection
export const signalDataTracking = pgTable(
  'signal_data_tracking',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' })
      .unique(), // One tracking record per signal

    // Last observed data point
    lastObservedDate: text('last_observed_date'), // Date string from data source (e.g., '2025-01-01')
    lastObservedValue: numeric('last_observed_value', { precision: 18, scale: 6 }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),

    // Metadata
    dataSource: text('data_source').notNull(), // 'fred' | 'iv_data' | 'price_feed'
    metric: text('metric').notNull(), // Series ID or metric name

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    signalIdx: index('idx_signal_data_tracking_signal').on(table.signalId),
  })
);

export type SignalDataTracking = typeof signalDataTracking.$inferSelect;
export type NewSignalDataTracking = typeof signalDataTracking.$inferInsert;

// Decision Audit Log - Process vs actual actions
export const decisionAuditLog = pgTable(
  'decision_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),

    // Context
    thesisId: uuid('thesis_id'),
    thesisType: text('thesis_type'), // 'macro' | 'asset'
    strategyId: uuid('strategy_id'),
    signalId: uuid('signal_id').references(() => signals.id, {
      onDelete: 'set null',
    }),

    // Trigger
    triggerType: text('trigger_type').notNull(), // 'signal' | 'playbook' | 'user_discretion' | 'other'
    triggerDescription: text('trigger_description').notNull(),

    // Process vs. actual
    statedProcessResponse: text('stated_process_response').notNull(),
    actualActionTaken: text('actual_action_taken').notNull(),
    rationale: text('rationale'),
    divergenceAcknowledged: boolean('divergence_acknowledged').default(false),

    // Outcome (updated later)
    outcome: jsonb('outcome'), // { timestamp, result, retrospectiveNotes? }
  },
  (table) => ({
    thesisIdx: index('idx_decision_audit_thesis').on(table.thesisId, table.thesisType),
    strategyIdx: index('idx_decision_audit_strategy').on(table.strategyId),
    timestampIdx: index('idx_decision_audit_timestamp').on(table.timestamp),
  })
);

export type DecisionAuditLog = typeof decisionAuditLog.$inferSelect;
export type NewDecisionAuditLog = typeof decisionAuditLog.$inferInsert;

// ============================================================================
// @DEPRECATED: Thesis Monitoring Configs
// ============================================================================
// This table is DEPRECATED as of 2026-01-13 (Signals UX Redesign Phase 5).
//
// The new architecture reads threshold configuration directly from:
//   signals.explicit_details (category='data_driven')
//
// See: scripts/daily-signal-monitoring.ts (replaces daily-thesis-monitoring.ts)
//
// This table will be dropped in a future migration once all existing configs
// have been migrated to signal-level explicit_details.
//
// Migration: For each thesisMonitoringConfigs.explicitThresholds entry that has
// a linkedValidationPointId, copy the threshold config to that signal's
// explicit_details field using the ExplicitDetails interface format.
// ============================================================================
export const thesisMonitoringConfigs = pgTable(
  'thesis_monitoring_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    thesisId: uuid('thesis_id').notNull(),
    thesisType: text('thesis_type').notNull(), // 'macro' | 'asset'

    // Identity (for asset theses)
    ticker: text('ticker'),                    // Auto-populated from underlying
    companyName: text('company_name'),         // For news search accuracy

    // Search configuration
    searchConfig: jsonb('search_config').notNull().default({
      derivedKeywords: [],
      additionalKeywords: [],
      exclusions: [],
    }),

    // Data sources to monitor
    sources: jsonb('sources').notNull().default({
      fred: { enabled: false, series: [] },
      priceIv: { enabled: false },
      news: { enabled: false, providers: [] },
      secFilings: { enabled: false, filingTypes: [] },
    }),

    // Frequency
    frequency: text('frequency').notNull().default('weekly'), // 'daily' | 'weekly'
    lastChecked: timestamp('last_checked', { withTimezone: true }),
    nextCheck: timestamp('next_check', { withTimezone: true }),

    // Auto-derived threshold checks from explicit validation points
    explicitThresholds: jsonb('explicit_thresholds').notNull().default([]),

    // Enable/disable toggle
    enabled: boolean('enabled').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    thesisIdx: index('idx_thesis_monitoring_configs_thesis').on(table.thesisId, table.thesisType),
    tickerIdx: index('idx_thesis_monitoring_configs_ticker').on(table.ticker),
    nextCheckIdx: index('idx_thesis_monitoring_configs_next_check').on(table.nextCheck),
    enabledIdx: index('idx_thesis_monitoring_configs_enabled').on(table.enabled),
  })
);

export type ThesisMonitoringConfig = typeof thesisMonitoringConfigs.$inferSelect;
export type NewThesisMonitoringConfig = typeof thesisMonitoringConfigs.$inferInsert;

// ============================================================================
// Thesis Triage Records
// Monitoring inbox for thesis-level alerts (Layer 3: Monitoring & Accountability)
// ============================================================================

export const thesisTriageRecords = pgTable(
  'thesis_triage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

    // Thesis context
    thesisId: uuid('thesis_id').notNull(),
    thesisType: text('thesis_type').notNull(),  // 'macro' | 'asset'
    thesisTitle: text('thesis_title').notNull(),

    // Trigger source
    triggerType: text('trigger_type').notNull(),  // 'scheduled_monitoring' | 'filing_alert' | 'data_release' | 'manual' | 'lifecycle_transition' | 'signal_recommendation'
    triggerSource: text('trigger_source').notNull(),  // e.g., "daily_news_scan"

    // Aggregated content summary
    contentSummary: jsonb('content_summary').notNull().default({}),

    // AI analysis results
    aiAnalysis: jsonb('ai_analysis').notNull().default({}),

    // Raw matched results (for audit)
    matchedResults: jsonb('matched_results').notNull().default([]),

    // Triage classification
    severity: text('severity').notNull(),  // 'critical' | 'high' | 'medium' | 'low' | 'info'
    urgency: text('urgency').notNull(),  // 'immediate' | 'today' | 'this_week' | 'when_convenient'

    // User action tracking
    status: text('status').notNull().default('pending'),  // 'pending' | 'in_review' | 'actioned' | 'dismissed'
    userNotes: text('user_notes'),
    actionsTaken: jsonb('actions_taken').default([]),

    // Link to full assessment report
    assessmentReportPath: text('assessment_report_path'),

    // Lifecycle orchestration fields
    lifecycleStage: text('lifecycle_stage'),  // 'synthesis' | 'monitoring' | etc.
    suggestedSkill: text('suggested_skill'),  // e.g., '/synthesize-thesis', '/assess-validation-evidence'
    actionRequired: text('action_required'),  // Human-readable action description

    // Triage rule that created this record (for filtering and analytics)
    // Uses UPPER_SNAKE_CASE to match position/strategy triage patterns
    triageRule: text('triage_rule'),  // 'NEEDS_RESEARCH' | 'PRODUCE_CORE_ARGUMENT' | 'UPDATE_CORE_ARGUMENT' | 'REVIEW_CONTENT' | 'REVIEW_DATA'

    // Completion tracking
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by'),  // 'user' or skill name
  },
  (table) => ({
    thesisIdx: index('idx_thesis_triage_thesis').on(table.thesisId, table.thesisType),
    statusIdx: index('idx_thesis_triage_status').on(table.status),
    severityIdx: index('idx_thesis_triage_severity').on(table.severity, table.urgency),
    createdIdx: index('idx_thesis_triage_created').on(table.createdAt),
    lifecycleIdx: index('idx_thesis_triage_lifecycle').on(table.lifecycleStage),
  })
);

export type ThesisTriageRecord = typeof thesisTriageRecords.$inferSelect;
export type NewThesisTriageRecord = typeof thesisTriageRecords.$inferInsert;

// ============================================================================
// Thesis News Items (News Archive)
// Historical archive of news items fetched by monitoring script for each thesis
// ============================================================================

export const thesisNewsItems = pgTable(
  'thesis_news_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

    // Thesis linkage
    thesisId: uuid('thesis_id').notNull(),
    thesisType: text('thesis_type').notNull(),  // 'macro' | 'asset'

    // News item data
    url: text('url').notNull(),
    title: text('title').notNull(),
    snippet: text('snippet'),
    sourceDomain: text('source_domain'),
    publishedDate: date('published_date'),

    // Fetch metadata
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    matchScore: integer('match_score'),
    matchedKeywords: text('matched_keywords').array(),
    queryType: text('query_type'),  // 'wide' | 'narrow'

    // Optional link to triage record (if analysis created one)
    triageRecordId: uuid('triage_record_id').references(() => thesisTriageRecords.id, { onDelete: 'set null' }),
  },
  (table) => ({
    thesisIdx: index('idx_thesis_news_items_thesis').on(table.thesisId, table.thesisType),
    fetchedAtIdx: index('idx_thesis_news_items_fetched_at').on(table.fetchedAt),
    publishedDateIdx: index('idx_thesis_news_items_published_date').on(table.publishedDate),
    // Unique constraint handled by database migration
  })
);

export type ThesisNewsItem = typeof thesisNewsItems.$inferSelect;
export type NewThesisNewsItem = typeof thesisNewsItems.$inferInsert;

// ============================================================================
// FRED Series Metadata (Reference Table)
// Stores metadata about FRED series for display and validation
// ============================================================================

export const fredSeriesMetadata = pgTable('fred_series_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  seriesId: text('series_id').notNull().unique(),    // FRED series ID (e.g., 'DGS10', 'UNRATE')
  title: text('title').notNull(),                     // Full series title from FRED
  frequency: text('frequency'),                       // 'daily' | 'weekly' | 'monthly' | 'quarterly'
  units: text('units'),                               // 'percent', 'billions_of_dollars', etc.
  seasonalAdjustment: text('seasonal_adjustment'),    // 'sa' | 'nsa' | 'saar'
  lastUpdated: timestamp('last_updated', { withTimezone: true }),
  observationStart: date('observation_start'),        // Earliest available observation
  observationEnd: date('observation_end'),            // Latest available observation
  notes: text('notes'),                               // FRED series notes/description
  category: text('category'),                         // 'interest_rates' | 'inflation' | 'labor' | etc.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FredSeriesMetadata = typeof fredSeriesMetadata.$inferSelect;
export type NewFredSeriesMetadata = typeof fredSeriesMetadata.$inferInsert;

// ============================================================================
// FRED Observations (Historical Data)
// Stores historical time-series data from FRED API
// ============================================================================

export const fredObservations = pgTable(
  'fred_observations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seriesId: text('series_id').notNull(),            // FRED series ID (e.g., 'DGS10')
    observationDate: date('observation_date').notNull(),
    value: numeric('value'),                          // NULL for missing data marked as '.'

    // Computed fields for threshold logic
    value1dChange: numeric('value_1d_change'),        // 1-day change
    value1dPctChange: numeric('value_1d_pct_change'), // 1-day percent change
    value5dChange: numeric('value_5d_change'),        // 5-day change
    value20dChange: numeric('value_20d_change'),      // 20-day change

    // Data quality
    isPreliminary: boolean('is_preliminary').default(false),

    // Fetch metadata
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSeriesDate: unique().on(table.seriesId, table.observationDate),
    seriesIdx: index('idx_fred_obs_series').on(table.seriesId),
    dateIdx: index('idx_fred_obs_date').on(table.observationDate),
  })
);

export type FredObservation = typeof fredObservations.$inferSelect;
export type NewFredObservation = typeof fredObservations.$inferInsert;

// ============================================================================
// Thesis FRED Indicators (Linkage Table)
// Links theses to relevant FRED indicators with threshold configurations
// ============================================================================

export const thesisFredIndicators = pgTable(
  'thesis_fred_indicators',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Thesis linkage (polymorphic)
    thesisId: uuid('thesis_id').notNull(),
    thesisType: text('thesis_type').notNull(),        // 'macro' | 'asset'

    // FRED series linkage
    seriesId: text('series_id').notNull(),

    // Indicator configuration
    priority: integer('priority').notNull().default(5),  // 1-5, lower = more important
    relevanceNotes: text('relevance_notes'),

    // Simple threshold config
    thresholdOperator: text('threshold_operator'),    // '>' | '>=' | '<' | '<=' | '=' | 'between' | 'outside'
    thresholdValue: numeric('threshold_value'),
    thresholdValueUpper: numeric('threshold_value_upper'),

    // Enhanced threshold: Trend-based
    trendPeriodDays: integer('trend_period_days'),
    trendChangeThreshold: numeric('trend_change_threshold'),
    trendPctChangeThreshold: numeric('trend_pct_change_threshold'),

    // Enhanced threshold: Velocity/acceleration
    velocityThreshold: numeric('velocity_threshold'),
    accelerationThreshold: numeric('acceleration_threshold'),

    // Enhanced threshold: Composite (multi-series)
    compositeConfig: jsonb('composite_config'),       // { conditions: [...], logic: 'AND|OR' }

    // Threshold breach behavior
    breachSeverity: text('breach_severity').default('medium'),
    breachMessageTemplate: text('breach_message_template'),

    // Link to signal
    linkedSignalId: uuid('linked_signal_id'),
    linkedSignalType: text('linked_signal_type'),
    autoUpdateSignalStatus: boolean('auto_update_vi_status').default(false), // Note: column name kept for backwards compat

    // Status
    enabled: boolean('enabled').notNull().default(true),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastBreachAt: timestamp('last_breach_at', { withTimezone: true }),
    lastBreachValue: numeric('last_breach_value'),
    consecutiveBreachDays: integer('consecutive_breach_days').default(0),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueThesisSeries: unique().on(table.thesisId, table.thesisType, table.seriesId),
    thesisIdx: index('idx_thesis_fred_thesis').on(table.thesisId, table.thesisType),
    seriesIdx: index('idx_thesis_fred_series').on(table.seriesId),
    enabledIdx: index('idx_thesis_fred_enabled').on(table.enabled),
  })
);

export type ThesisFredIndicator = typeof thesisFredIndicators.$inferSelect;
export type NewThesisFredIndicator = typeof thesisFredIndicators.$inferInsert;

// TypeScript interface for composite config JSONB
export interface FredCompositeCondition {
  seriesId: string;
  operator: '>' | '>=' | '<' | '<=' | '=' | 'between' | 'outside';
  value: number;
  valueUpper?: number;
}

export interface FredCompositeConfig {
  conditions: FredCompositeCondition[];
  logic: 'AND' | 'OR';
}

// ============================================================================
// FRED Threshold Breaches (Audit Trail)
// Records all threshold breaches for audit and pattern analysis
// ============================================================================

export const fredThresholdBreaches = pgTable(
  'fred_threshold_breaches',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Link to indicator config
    indicatorId: uuid('indicator_id').notNull().references(() => thesisFredIndicators.id, { onDelete: 'cascade' }),

    // Thesis context (denormalized)
    thesisId: uuid('thesis_id').notNull(),
    thesisType: text('thesis_type').notNull(),
    seriesId: text('series_id').notNull(),

    // Breach details
    breachDate: date('breach_date').notNull(),
    breachValue: numeric('breach_value').notNull(),
    thresholdConfig: jsonb('threshold_config').notNull(),  // Snapshot at breach time
    breachType: text('breach_type').notNull(),             // 'simple' | 'trend' | 'velocity' | 'composite'

    // Impact
    severity: text('severity').notNull(),
    breachMessage: text('breach_message'),

    // Action taken
    autoUpdatedViStatus: boolean('auto_updated_vi_status').default(false),
    viPointId: uuid('vi_point_id'),
    viStatusBefore: text('vi_status_before'),
    viStatusAfter: text('vi_status_after'),

    // Linkage to triage
    triageRecordId: uuid('triage_record_id'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    indicatorIdx: index('idx_fred_breach_indicator').on(table.indicatorId),
    thesisIdx: index('idx_fred_breach_thesis').on(table.thesisId, table.thesisType),
    dateIdx: index('idx_fred_breach_date').on(table.breachDate),
  })
);

export type FredThresholdBreach = typeof fredThresholdBreaches.$inferSelect;
export type NewFredThresholdBreach = typeof fredThresholdBreaches.$inferInsert;

// ============================================================================
// Journal Entries (Decision Log)
// Comprehensive audit trail of all actions across all object types
// Renamed from blotter_entries to align with PRD terminology
// ============================================================================

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),

    // Object context (polymorphic)
    objectType: text('object_type').notNull(),  // 'macro_thesis' | 'asset_thesis' | 'strategy' | 'position' | 'claim' | 'validation_point'
    objectId: uuid('object_id').notNull(),
    objectTitle: text('object_title'),

    // Action details
    actionType: text('action_type').notNull(),  // 'status_change' | 'skill_invoked' | 'claim_linked' | 'triage_completed' | etc.
    actionDescription: text('action_description').notNull(),

    // Linkage to other entities
    triageRecordId: uuid('triage_record_id'),  // References thesis_triage_records or triage_records
    skillInvoked: text('skill_invoked'),  // e.g., '/synthesize-thesis'

    // State change tracking
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),

    // User rationale (for divergence tracking)
    rationale: text('rationale'),

    // Provenance
    source: text('source').notNull(),  // 'user' | 'skill' | 'automation'

    // Additional metadata
    metadata: jsonb('metadata').default({}),

    // Deduplication / lifecycle tracking
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    occurrenceCount: integer('occurrence_count').default(1),
    status: text('status').default('active'), // 'active' | 'resolved' | 'dismissed' | 'superseded'
  },
  (table) => ({
    objectIdx: index('idx_journal_object').on(table.objectType, table.objectId),
    timestampIdx: index('idx_journal_timestamp').on(table.timestamp),
    actionTypeIdx: index('idx_journal_action_type').on(table.actionType),
    sourceIdx: index('idx_journal_source').on(table.source),
    dedupLookupIdx: index('idx_journal_dedup_lookup').on(table.objectId, table.actionType, table.status),
  })
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

// Type definitions for Triage JSONB fields
export interface TriageContentSummary {
  totalItemsScanned: number;
  relevantItemsFound: number;
  sources: string[];
  dateRange: { from: string; to: string };
}

export interface TriageAIAnalysis {
  assessmentId?: string;
  summary: string;
  validationPointsAffected: {
    pointId: string;
    pointStatement: string;
    evidenceType: 'strong_validation' | 'weak_validation' | 'neutral' | 'weak_invalidation' | 'strong_invalidation';
    confidence: 'high' | 'medium' | 'low';
    recommendedAction: string;
  }[];
  keyFindings: string[];
  suggestedNextSteps: string[];
}

export interface TriageMatchedResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
  queryType: 'wide' | 'narrow';
  matchScore: number;
  matchedKeywords: string[];
}

// Type definitions for JSONB fields
export interface ThesisSearchConfig {
  derivedKeywords: string[];
  additionalKeywords: string[];
  exclusions: string[];
}

export interface ThesisMonitoringSources {
  fred?: {
    enabled: boolean;
    series: string[];
  };
  priceIv?: {
    enabled: boolean;
  };
  news?: {
    enabled: boolean;
    providers: ('perplexity' | 'finnhub' | 'yahoo' | 'google')[];
  };
  secFilings?: {
    enabled: boolean;
    filingTypes: ('8-K' | '10-Q' | '10-K' | 'Form4')[];
  };
}

export interface ExplicitThreshold {
  signalId: string;
  source: 'fred' | 'price_iv';
  metric: string;                     // e.g., "ICSA", "spot", "iv30"
  operator: '>' | '<' | '>=' | '<=' | '==';
  value: number;
  description: string;                // Human-readable: "ICSA > 250,000"
}
