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
  uniqueIndex,
  index,
  check,
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
  owner: text('owner'), // Owner name: 'TTC', 'Nick', 'Maisy', 'Alex', 'Lily', 'Leo'
  // Portfolio accounting fields (from TTC migration — M1)
  ownerId: uuid('owner_id'), // FK → owners (set via migration, nullable for existing rows)
  accountType: text('account_type'), // brokerage | exchange | wallet | bank | retirement
  institution: text('institution'), // IBKR, Coinbase, etc.
  accountNumber: text('account_number'), // External account number
  costBasisMethod: text('cost_basis_method'), // fifo | average_cost
  isActive: boolean('is_active').default(true),
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
  cik: text('cik'),  // SEC CIK identifier for filing lookups
  nextEarningsDate: date('next_earnings_date'),
  nextExDivDate: date('next_ex_div_date'),
  // For ETFs/wrappers, references the economic underlying (e.g., IBIT -> BTC, GLD -> gold)
  parentUnderlyingId: uuid('parent_underlying_id'),
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
    status: text('status').notNull().default('active'), // 'draft' | 'active' | 'complete' | 'rejected'

    // Position structure
    sectors: text('sectors').array().default(sql`'{}'`), // e.g., ['AI hyperscalers', 'crypto alts']
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral'
    positionStartDate: date('position_start_date'),
    positionEndDate: date('position_end_date'),

    // Outcome tracking
    outcome: text('outcome'), // 'validated' | 'invalidated' | 'partial' | 'ongoing'
    outcomeNotes: text('outcome_notes'),
    actualOutcomeDate: date('actual_outcome_date'),

    // Track claims count when articulation was last generated (for triage rule #2)
    claimsCountAtLastArticulation: integer('claims_count_at_last_articulation').default(0),

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
    status: text('status').notNull().default('active'), // 'draft' | 'active' | 'complete' | 'rejected'

    // AI-generated summary (Phase 2.8)
    aiSummary: text('ai_summary'),
    aiSummaryDetailLevel: text('ai_summary_detail_level'),
    aiSummaryGeneratedAt: timestamp('ai_summary_generated_at', { withTimezone: true }),
    aiSummaryClaimIds: text('ai_summary_claim_ids').array().default(sql`'{}'`),
    aiSummaryClaimCount: integer('ai_summary_claim_count').default(0),

    // Position structure
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral'
    positionStartDate: date('position_start_date'),
    positionEndDate: date('position_end_date'),

    // Price targets
    targetPrice: numeric('target_price'),
    entryReferencePrice: numeric('entry_reference_price'),

    // Outcome tracking
    outcome: text('outcome'), // 'validated' | 'invalidated' | 'partial' | 'ongoing'
    outcomeNotes: text('outcome_notes'),
    actualOutcomeDate: date('actual_outcome_date'),
    actualPrice: numeric('actual_price'),

    // Track claims count when articulation was last generated (for triage rule #2)
    claimsCountAtLastArticulation: integer('claims_count_at_last_articulation').default(0),

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
    status: text('status').notNull().default('draft'), // 'draft' | 'active' | 'complete' | 'rejected' (standardized #ENH-048)
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
    // One claim can only be linked to a given thesis once (regardless of mapping_type)
    uniqueMacro: uniqueIndex('idx_claim_thesis_unique_macro')
      .on(table.mainClaimId, table.macroThesisId)
      .where(sql`macro_thesis_id IS NOT NULL`),
    uniqueAsset: uniqueIndex('idx_claim_thesis_unique_asset')
      .on(table.mainClaimId, table.assetThesisId)
      .where(sql`asset_thesis_id IS NOT NULL`),
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
// Strategy Types
// ============================================================================

export const strategyTypes = pgTable(
  'strategy_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description'),
    defaultDirection: text('default_direction'), // 'bullish' | 'bearish' | 'neutral'
    category: text('category'), // 'directional' | 'income' | 'hedging' | 'volatility' | 'spread'
    legCount: integer('leg_count'),
    minDte: integer('min_dte'),
    maxDte: integer('max_dte'),
    riskProfile: text('risk_profile'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index('idx_strategy_types_active').on(table.isActive),
    categoryIdx: index('idx_strategy_types_category').on(table.category),
    sortIdx: index('idx_strategy_types_sort').on(table.sortOrder),
  })
);

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
    status: text('status').notNull().default('active'), // 'draft' | 'active' | 'complete' | 'rejected'
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
    // Strategy categorization
    strategyType: text('strategy_type'), // e.g., "Long Call", "Risk Reversal", etc. (legacy, use strategyTypeId)
    strategyTypeId: uuid('strategy_type_id').references(() => strategyTypes.id, {
      onDelete: 'set null',
    }),
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral' - strategy directional bias
    // Hierarchy linkage (Phase 1)
    // Note: Strategies inherit macro thesis connections through assetThesisId
    assetThesisId: uuid('asset_thesis_id').references(() => assetTheses.id, {
      onDelete: 'set null',
    }),
    // Merge tracking: when a strategy is merged into another, this points to the target
    mergedIntoId: uuid('merged_into_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    accountStrategyIdx: index('idx_strategies_account').on(table.accountId),
    strategyKeyIdx: index('idx_strategies_key').on(table.strategyKey),
    assetThesisIdx: index('idx_strategies_asset_thesis').on(table.assetThesisId),
    strategyTypeIdx: index('idx_strategies_type_id').on(table.strategyTypeId),
    mergedIntoIdx: index('idx_strategies_merged_into').on(table.mergedIntoId),
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
  // Currency and FX
  currency: text('currency'), // Trading currency from IBKR CurrencyPrimary (e.g., 'USD', 'GBP', 'CAD')
  // Mark-to-market fields
  spot: numeric('spot'),
  intrinsic: numeric('intrinsic'),
  extrinsic: numeric('extrinsic'),
  absNotional: numeric('abs_notional'), // Legacy: market value in position currency. Prefer marketValueUsd.
  absNotionalUsd: numeric('abs_notional_usd'), // Legacy: abs_notional in USD (IBKR only). Prefer marketValueUsd.
  marketValueUsd: numeric('market_value_usd'), // Market value in USD — always populated when price data available
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
    cash: numeric('cash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAccountDate: unique().on(table.accountId, table.reportDate),
  })
);

// ============================================================================
// Cash Balances
// ============================================================================

export const cashBalances = pgTable(
  'cash_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    currency: text('currency').notNull(),
    balance: numeric('balance').notNull(),
    balanceUsd: numeric('balance_usd'),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAccountDateCurrencySource: unique().on(
      table.accountId,
      table.snapshotDate,
      table.currency,
      table.source
    ),
    accountSnapshotIdx: index('idx_cash_balances_account_snapshot').on(
      table.accountId,
      table.snapshotDate
    ),
  })
);

// ============================================================================
// FX Rates (Daily Exchange Rates)
// ============================================================================

export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotDate: date('snapshot_date').notNull(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(), // Always 'USD'
    rate: numeric('rate').notNull(),
    source: text('source').notNull(), // 'ibkr_flex'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueDateCurrencyPair: unique().on(
      table.snapshotDate,
      table.fromCurrency,
      table.toCurrency
    ),
    snapshotDateIdx: index('idx_fx_rates_snapshot_date').on(table.snapshotDate),
    fromCurrencyIdx: index('idx_fx_rates_from_currency').on(table.fromCurrency),
  })
);

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;

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
    // Severity: importance/priority level (how urgent is this?)
    // Values: 'urgent' | 'attention' | 'monitor' | 'info'
    severity: text('severity'),
    // Status: workflow state (where is this in the triage workflow?)
    // Values: 'inbox' | 'in_progress' | 'done'
    status: text('status').default('inbox'),
    direction: text('direction'), // 'bullish' | 'bearish' | 'neutral' - net direction of position(s)
    recommendedAction: text('recommended_action'),
    notes: text('notes'),
    ruleSet: text('rule_set'), // e.g. 'options_v1'
    unmatchedTradeExecutions: jsonb('unmatched_trade_executions'), // JSONB array of unmatched trade blotter entry details (for QUANTITY_CHANGE)
    // Override tracking - persists user DISMISS/MONITOR actions across triage recomputes
    overrideSource: text('override_source'), // 'user_dismiss' | 'user_monitor' | null (no override)
    overrideExpiresDate: date('override_expires_date'), // When override expires (null = permanent)
    overrideAt: timestamp('override_at', { withTimezone: true }), // When override was set
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
    statusIdx: index('idx_triage_status').on(table.status),
    severityIdx: index('idx_triage_severity').on(table.severity),
    overrideSourceIdx: index('idx_triage_override_source').on(table.overrideSource),
  })
);

// ============================================================================
// Playbook Items - DEPRECATED and REMOVED (2026-01-16)
// Replaced by Signals system. See docs/CLEANUP_PLAN.md
// ============================================================================

// ============================================================================
// Blotter Actions - DEPRECATED (2026-01-16)
// ============================================================================
// The blotter_actions table has been deprecated and removed as part of the
// blotter-to-journal migration. All functionality has been moved to:
// - journal_entries: Audit trail for all actions
// - triage_records: Override tracking via overrideSource, overrideExpiresDate, overrideAt columns
// See: docs/CLEANUP_PLAN.md - Blotter-to-Journal Migration
// ============================================================================

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
    totalAbsNotionalUsd: numeric('total_abs_notional_usd'), // USD-normalized total notional
    totalUnrealizedPnl: numeric('total_unrealized_pnl'),
    navAtSnapshot: numeric('nav_at_snapshot'), // In account's base currency
    navAtSnapshotUsd: numeric('nav_at_snapshot_usd'), // NAV converted to USD
    pctNavAbsNotional: numeric('pct_nav_abs_notional'),
    absStockNotional: numeric('abs_stock_notional'),
    absOptionNotional: numeric('abs_option_notional'),
    absCryptoSpotNotional: numeric('abs_crypto_spot_notional'),
    absPerpNotional: numeric('abs_perp_notional'),
    totalCashUsd: numeric('total_cash_usd'),
    leverageRatio: numeric('leverage_ratio'),
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

export type StrategyType = typeof strategyTypes.$inferSelect;
export type NewStrategyType = typeof strategyTypes.$inferInsert;

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;

// Strategies relations (defined here after strategies table)
export const strategiesRelations = relations(strategies, ({ one }) => ({
  assetThesis: one(assetTheses, {
    fields: [strategies.assetThesisId],
    references: [assetTheses.id],
  }),
}));

// REMOVED: PlaybookItem types - deprecated, replaced by signals system (2026-01-16)

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;

export type MtmSnapshot = typeof mtmSnapshots.$inferSelect;
export type NewMtmSnapshot = typeof mtmSnapshots.$inferInsert;

export type NavSnapshot = typeof navSnapshots.$inferSelect;
export type NewNavSnapshot = typeof navSnapshots.$inferInsert;

export type CashBalance = typeof cashBalances.$inferSelect;
export type NewCashBalance = typeof cashBalances.$inferInsert;

export type TriageRecord = typeof triageRecords.$inferSelect;
export type NewTriageRecord = typeof triageRecords.$inferInsert;

// BlotterAction types removed - table deprecated (2026-01-16)

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
// Ingestion Cursors - Track incremental ingestion state per exchange
// ============================================================================

export const ingestionCursors = pgTable(
  'ingestion_cursors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    exchange: text('exchange').notNull(), // 'hyperliquid' | 'coinbase_prime' | 'kraken'
    cursorType: text('cursor_type').notNull(), // 'fills' | 'positions'
    cursorValue: text('cursor_value').notNull(), // timestamp (ms or ISO), page cursor, etc.
    metadata: jsonb('metadata'), // extra context (e.g., last fill ID)
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueCursor: unique().on(table.accountId, table.exchange, table.cursorType),
    exchangeIdx: index('idx_ingestion_cursors_exchange').on(table.exchange),
  })
);

export type IngestionCursor = typeof ingestionCursors.$inferSelect;
export type NewIngestionCursor = typeof ingestionCursors.$inferInsert;

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

    // Claim-level suggestion (nullable — null for insight-level recommendations)
    mainClaimId: uuid('main_claim_id').references(() => mainClaims.id, {
      onDelete: 'cascade',
    }),

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
    claimIdx: index('idx_recommendations_claim').on(table.mainClaimId),
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

    // Entity relationships now managed via signal_entity_links junction table
    articulationId: uuid('articulation_id').references(() => thesisArticulations.id, {
      onDelete: 'set null',
    }),

    // Core definition
    type: text('type').notNull(), // 'confirmation' | 'invalidation' | 'completion'
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

    // Status: draft (proposed) → active (accepted/monitoring) → complete (triggered) | rejected (cancelled)
    // Standardized #ENH-048: draft, active, complete, rejected
    status: text('status').notNull().default('active'), // 'draft' | 'active' | 'complete' | 'rejected'

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

// Signal Entity Links - Many-to-many junction between signals and entities (strategies/theses)
// Replaces the direct strategy_id/thesis_id on signals for strategy price signals,
// allowing one signal (e.g., "BTC > $150K") to link to multiple strategies.
export const signalEntityLinks = pgTable(
  'signal_entity_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // 'thesis' | 'strategy'
    strategyId: uuid('strategy_id').references(() => strategies.id, { onDelete: 'cascade' }),
    thesisId: uuid('thesis_id'),
    thesisType: text('thesis_type'), // 'macro' | 'asset'
    positionPct: integer('position_pct'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    signalIdx: index('idx_signal_entity_links_signal').on(table.signalId),
    strategyIdx: index('idx_signal_entity_links_strategy').on(table.strategyId),
    thesisIdx: index('idx_signal_entity_links_thesis').on(table.thesisId, table.thesisType),
    uniqueStrategy: unique('signal_entity_links_strategy_unique').on(table.signalId, table.strategyId),
    uniqueThesis: unique('signal_entity_links_thesis_unique').on(table.signalId, table.thesisId, table.thesisType),
  })
);

export type SignalEntityLink = typeof signalEntityLinks.$inferSelect;
export type NewSignalEntityLink = typeof signalEntityLinks.$inferInsert;

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

// Signal Data Snapshots - Time-series tracking for all signal types (quantitative + qualitative)
export const signalDataSnapshots = pgTable(
  'signal_data_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull().defaultNow(),

    // Quantitative data (for data-driven signals)
    observedValue: numeric('observed_value', { precision: 18, scale: 6 }),
    thresholdValue: numeric('threshold_value', { precision: 18, scale: 6 }),
    pctToThreshold: numeric('pct_to_threshold', { precision: 8, scale: 4 }),
    unit: text('unit'), // 'USD', '%', 'ratio', 'count', 'MW'

    // Qualitative data (for thesis monitor assessments)
    assessment: text('assessment'), // 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated'
    evidenceSummary: text('evidence_summary'),
    intelligenceItemId: uuid('intelligence_item_id')
      .references(() => intelligenceItems.id, { onDelete: 'set null' }),

    // Source tracking
    dataSource: text('data_source').notNull(), // 'defillama' | 'hypeflows' | 'coingecko' | 'tradingview_cdp' | 'internal_db' | 'thesis_monitor' | 'derived' | 'research_routing'
    reportId: uuid('report_id')
      .references(() => intelligenceReports.id, { onDelete: 'set null' }),

    // Pending review lifecycle: pending → accepted | rejected
    status: text('status').notNull().default('accepted'), // 'pending' | 'accepted' | 'rejected'

    // Claim provenance (populated only for data_source = 'research_routing')
    claimId: uuid('claim_id')
      .references(() => mainClaims.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    signalIdx: index('idx_signal_data_snapshots_signal').on(table.signalId, table.snapshotDate),
    reportIdx: index('idx_signal_data_snapshots_report').on(table.reportId),
  })
);

export type SignalDataSnapshot = typeof signalDataSnapshots.$inferSelect;
export type NewSignalDataSnapshot = typeof signalDataSnapshots.$inferInsert;

// Claim-Signal Evidences - Junction table linking claims to the signals they evidence
export const claimSignalEvidences = pgTable(
  'claim_signal_evidences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => mainClaims.id, { onDelete: 'cascade' }),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    assessment: text('assessment').notNull(), // 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated'
    snapshotId: uuid('snapshot_id')
      .references(() => signalDataSnapshots.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    claimIdx: index('idx_claim_signal_evidences_claim').on(table.claimId),
    signalIdx: index('idx_claim_signal_evidences_signal').on(table.signalId),
    uniqueClaimSignal: unique('claim_signal_evidences_unique').on(table.claimId, table.signalId),
  })
);

export type ClaimSignalEvidence = typeof claimSignalEvidences.$inferSelect;
export type NewClaimSignalEvidence = typeof claimSignalEvidences.$inferInsert;

// Signal Data Source Registry - Browsable library of available data sources for signal configuration
export const signalDataSourceRegistry = pgTable('signal_data_source_registry', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').unique().notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  measureType: text('measure_type').notNull(),
  availableMetrics: jsonb('available_metrics').notNull().default([]),
  assetScope: text('asset_scope').notNull(),
  supportedTickers: text('supported_tickers').array(),
  ingestionMethod: text('ingestion_method').notNull(),
  ingestionScript: text('ingestion_script'),
  ingestionSchedule: text('ingestion_schedule'),
  configTemplate: jsonb('config_template').notNull(),
  configExample: jsonb('config_example'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SignalDataSourceRegistryEntry = typeof signalDataSourceRegistry.$inferSelect;
export type NewSignalDataSourceRegistryEntry = typeof signalDataSourceRegistry.$inferInsert;

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

    // Triage classification (standardized pattern - see docs/CLEANUP_PLAN.md #ENH-047)
    // Severity: importance/priority level (how urgent is this?)
    // Values: 'urgent' | 'attention' | 'monitor' | 'info'
    severity: text('severity').notNull(),
    // Status: workflow state (where is this in the triage workflow?)
    // Values: 'inbox' | 'in_progress' | 'done'
    status: text('status').notNull().default('inbox'),
    userNotes: text('user_notes'),
    actionsTaken: jsonb('actions_taken').default([]),

    // Link to full assessment report
    assessmentReportPath: text('assessment_report_path'),

    // Lifecycle orchestration fields
    lifecycleStage: text('lifecycle_stage'),  // 'synthesis' | 'monitoring' | etc.
    suggestedSkill: text('suggested_skill'),  // e.g., '/build-core-argument', '/assess-validation-evidence'
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
    severityIdx: index('idx_thesis_triage_severity').on(table.severity),
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
    skillInvoked: text('skill_invoked'),  // e.g., '/build-core-argument'

    // State change tracking
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),

    // User rationale (for divergence tracking)
    rationale: text('rationale'),

    // Provenance
    source: text('source').notNull(),  // 'user' | 'skill' | 'automation'

    // Additional metadata
    metadata: jsonb('metadata').default({}),

    // Batch grouping - entries from the same operation share a batch_id
    batchId: uuid('batch_id'),

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
    batchIdx: index('idx_journal_batch').on(table.batchId),
  })
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

// ============================================================================
// Economic Events (TradingView Economic Calendar)
// Stores upcoming and recent economic releases for macro signal context.
// Ingested by scripts/ingest-economic-calendar.ts
// ============================================================================

export const economicEvents = pgTable(
  'economic_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Event identity
    tvEventId: text('tv_event_id'),          // TradingView internal event ID
    eventType: text('event_type').notNull(), // Normalised key e.g. "FOMC_RATE_DECISION", "CPI_MM"
    title: text('title').notNull(),          // Human-readable name from TV e.g. "Fed Interest Rate Decision"
    indicator: text('indicator'),            // TV indicator name (may differ from title)
    category: text('category'),              // TV category code: 'cntrl' | 'lbr' | 'infl' | etc.
    country: text('country').notNull(),      // ISO country code e.g. "US"

    // Timing
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),

    // Impact
    impactLevel: text('impact_level').notNull(), // 'high' | 'medium' | 'low'

    // Values (nullable — future events have no actual yet)
    actual: numeric('actual'),
    forecast: numeric('forecast'),
    previous: numeric('previous'),
    unit: text('unit'),  // '%', 'K', 'B', etc. from TV scale/unit fields

    // Source metadata
    source: text('source'),        // Publishing body e.g. "Federal Reserve"
    sourceUrl: text('source_url'),
    period: text('period'),        // Reference period e.g. "Mar", "Q1"

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Upsert key: an economic event is uniquely identified by type + date + country
    uniqueEventTypeDateCountry: unique().on(table.eventType, table.eventDate, table.country),
    eventDateIdx: index('idx_economic_events_event_date').on(table.eventDate),
    impactIdx: index('idx_economic_events_impact').on(table.impactLevel),
    countryIdx: index('idx_economic_events_country').on(table.country),
  })
);

export type EconomicEvent = typeof economicEvents.$inferSelect;
export type NewEconomicEvent = typeof economicEvents.$inferInsert;

// ============================================================================
// Portfolio Accounting — Event Sourcing (TTC Migration M1)
// ============================================================================

// --- Enumerations (as const arrays, matching TJ pattern — no pgEnum) ---

export const ENTITY_TYPES = [
  'individual', 'joint', 'trust', 'ira_traditional', 'ira_roth',
  'ira_sep', '401k', 'llc', 'corporation', 'partnership',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ACCOUNT_TYPES = [
  'brokerage', 'exchange', 'wallet', 'bank', 'retirement',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const COST_BASIS_METHODS = ['fifo', 'average_cost'] as const;
export type CostBasisMethod = (typeof COST_BASIS_METHODS)[number];

export const EVENT_TYPES = [
  'BUY', 'SELL', 'RECEIVE', 'SEND', 'FEE', 'DIVIDEND', 'INTEREST',
  'STAKING_REWARD', 'MINING_REWARD', 'GIFT_IN', 'GIFT_OUT', 'LOST',
  'FORK', 'EXPENSE', 'INCOME',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_SOURCES = [
  'ibkr_trade', 'ibkr_sof', 'ibkr_mtmpnl', 'ibkr_positions',
  'koinly', 'buxfer', 'coinbase', 'manual', 'migration',
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const BATCH_STATUSES = [
  'pending', 'parsing', 'validating', 'persisting', 'calculating',
  'completed', 'failed',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const CALC_PHASES = [
  'sort_indexes', 'running_quantity', 'cost_basis', 'average_cost_basis',
  'gbp_conversion', 'uk_section_104',
  'daily_balances', 'price_population', 'market_value_enrichment',
  'daily_nav', 'completed',
] as const;
export type CalcPhase = (typeof CALC_PHASES)[number];

export const ASSET_CLASSES = [
  'CRYPTO', 'EQUITY', 'FIAT', 'STABLECOIN', 'DERIVATIVE',
  'BOND', 'ETF', 'MUTUAL_FUND', 'COMMODITY', 'REAL_ESTATE', 'OTHER',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const PRICE_SOURCES = [
  'coinmarketcap', 'coingecko', 'massive', 'tradingview', 'ibkr', 'manual',
  'snapshot', 'fx_rate', 'proxy',
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const LOT_STATUSES = ['open', 'closed', 'partial'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const LOT_TYPES = ['long', 'short'] as const;
export type LotType = (typeof LOT_TYPES)[number];

// --- Owners ---

export const owners = pgTable('owners', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  entityType: text('entity_type').notNull().default('individual'), // EntityType
  legalName: text('legal_name'),
  taxJurisdiction: text('tax_jurisdiction').default('US'),
  baseCurrency: text('base_currency').notNull().default('USD'),
  ssnOrEin: text('ssn_or_ein'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueUserName: unique('unique_owner_user_name').on(table.userId, table.name),
  idxOwnersUser: index('idx_owners_user').on(table.userId),
}));

export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;

// --- Assets (canonical instrument registry — separate from underlyings) ---

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticker: text('ticker').notNull().unique(),
  name: text('name'),
  assetClass: text('asset_class').notNull(), // AssetClass
  subClass: text('sub_class'),
  ibkrConid: text('ibkr_conid').unique(),
  coinmarketcapId: text('coinmarketcap_id'),
  coingeckoId: text('coingecko_id'),
  cusip: text('cusip'),
  isin: text('isin'),
  decimals: integer('decimals').default(8),
  baseCurrency: text('base_currency'),
  pricingTier: text('pricing_tier'), // 'market' | 'proxy' | 'book_value' | 'zero'
  proxyAssetId: uuid('proxy_asset_id'), // FK to assets.id (self-ref, constraint in DB)
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxAssetsConid: index('idx_assets_conid').on(table.ibkrConid),
  idxAssetsClass: index('idx_assets_class').on(table.assetClass),
  idxAssetsTicker: index('idx_assets_ticker').on(table.ticker),
  idxAssetsPricingTier: index('idx_assets_pricing_tier').on(table.pricingTier),
}));

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

// --- Asset Aliases ---

export const assetAliases = pgTable('asset_aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  source: text('source'), // ibkr | koinly | buxfer | null=universal
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxAliasesUnique: uniqueIndex('idx_aliases_unique').on(table.alias, table.source),
  idxAliasesAsset: index('idx_aliases_asset').on(table.assetId),
}));

export type AssetAlias = typeof assetAliases.$inferSelect;
export type NewAssetAlias = typeof assetAliases.$inferInsert;

// --- Import Batches (state machine for import operations) ---

export const importBatches = pgTable('import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('pending'), // BatchStatus
  source: text('source').notNull(), // EventSource
  filename: text('filename'),
  fileHash: text('file_hash'), // SHA256 for idempotency
  totalRecords: integer('total_records'),
  processedRecords: integer('processed_records').default(0),
  skippedRecords: integer('skipped_records').default(0),
  errorCount: integer('error_count').default(0),
  calcPhase: text('calc_phase'), // CalcPhase (sub-state during 'calculating')
  calcProgress: jsonb('calc_progress'),
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),
  validationErrors: jsonb('validation_errors'),
  validationWarnings: jsonb('validation_warnings'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxImportBatchesUserStatus: index('idx_import_batches_user_status').on(table.userId, table.status),
  idxImportBatchesIdempotency: uniqueIndex('idx_import_batches_idempotency').on(table.userId, table.fileHash),
  idxImportBatchesStarted: index('idx_import_batches_started').on(table.startedAt),
}));

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;

// --- Events (immutable append-only transaction log) ---

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  eventType: text('event_type').notNull(), // EventType
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  settlementDate: date('settlement_date'),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  assetTicker: text('asset_ticker').notNull(), // Denormalized
  quantity: numeric('quantity').notNull(), // Always positive; event_type determines direction
  price: numeric('price'),
  totalValue: numeric('total_value').notNull(),
  currency: text('currency').notNull().default('USD'),
  costBasis: numeric('cost_basis'),
  owner: text('owner').notNull(),
  account: text('account').notNull(),
  source: text('source').notNull(), // EventSource
  sourceId: text('source_id').notNull(),
  importBatchId: uuid('import_batch_id').notNull(),
  linkedEventId: uuid('linked_event_id'), // Self-ref FK (managed via migration SQL)
  idempotencyKey: text('idempotency_key').notNull().unique(),
  rawData: jsonb('raw_data').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  idxEventsUserDate: index('idx_events_user_date').on(table.userId, table.timestamp),
  idxEventsAsset: index('idx_events_asset').on(table.assetId, table.timestamp),
  idxEventsBatch: index('idx_events_batch').on(table.importBatchId),
  idxEventsUserAsset: index('idx_events_user_asset').on(table.userId, table.assetTicker),
  idxEventsOwnerAccount: index('idx_events_owner_account').on(table.owner, table.account),
  idxEventsSource: index('idx_events_source').on(table.source, table.sourceId),
  positiveQuantity: check('positive_quantity', sql`quantity > 0`),
}));

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

// --- Event Calculations (mutable derived state per event) ---

export const eventCalculations = pgTable('event_calculations', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Denormalized for bulk operations
  runningQuantity: numeric('running_quantity'),
  costBasis: numeric('cost_basis'),
  costBasisMethod: text('cost_basis_method'), // 'average_cost' | 'fifo'
  realizedGain: numeric('realized_gain'),
  holdingDays: integer('holding_days'),
  isLongTerm: boolean('is_long_term'),
  newAverageCost: numeric('new_average_cost'),
  averageCostUsed: numeric('average_cost_used'),
  fifoMatched: boolean('fifo_matched'),
  lotConsumptionsCount: integer('lot_consumptions_count'),
  lotType: text('lot_type'), // 'long' | 'short'
  // M5: GBP conversion fields (ACB method in GBP)
  fxRateToGbp: numeric('fx_rate_to_gbp'),
  totalValueGbp: numeric('total_value_gbp'),
  costBasisGbp: numeric('cost_basis_gbp'),
  realizedGainGbp: numeric('realized_gain_gbp'),
  newAverageCostGbp: numeric('new_average_cost_gbp'),
  // M6: UK Section 104 fields (S104 method in GBP)
  s104CostBasisGbp: numeric('s104_cost_basis_gbp'),
  s104RealizedGainGbp: numeric('s104_realized_gain_gbp'),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueEventId: uniqueIndex('idx_event_calculations_event_id').on(table.eventId),
  idxCalcUser: index('idx_event_calculations_user').on(table.userId),
}));

export type EventCalculation = typeof eventCalculations.$inferSelect;
export type NewEventCalculation = typeof eventCalculations.$inferInsert;

// --- Tax Lots (FIFO cost basis tracking) ---

export const taxLots = pgTable('tax_lots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  owner: text('owner').notNull(),
  account: text('account').notNull(),
  acquisitionEventId: uuid('acquisition_event_id').notNull().references(() => events.id).unique(),
  acquisitionDate: timestamp('acquisition_date', { withTimezone: true }).notNull(),
  originalQuantity: numeric('original_quantity').notNull(),
  consumedQuantity: numeric('consumed_quantity').notNull().default('0'),
  remainingQuantity: numeric('remaining_quantity').notNull(),
  costBasisPerUnit: numeric('cost_basis_per_unit').notNull(),
  totalCostBasis: numeric('total_cost_basis').notNull(),
  remainingCostBasis: numeric('remaining_cost_basis').notNull(),
  status: text('status').notNull().default('open'), // LotStatus: open | closed | partial
  lotType: text('lot_type').notNull().default('long'), // LotType: long | short
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxLotsFifo: index('idx_lots_fifo').on(
    table.userId, table.assetId, table.owner, table.account,
    table.status, table.acquisitionDate,
  ),
  idxLotsUser: index('idx_lots_user').on(table.userId),
  idxLotsAsset: index('idx_lots_asset').on(table.assetId),
  quantityBalance: check('quantity_balance',
    sql`remaining_quantity = original_quantity - consumed_quantity`),
  positiveRemaining: check('positive_remaining',
    sql`remaining_quantity >= 0`),
}));

export type TaxLot = typeof taxLots.$inferSelect;
export type NewTaxLot = typeof taxLots.$inferInsert;

// --- Lot Consumptions (FIFO matching audit trail) ---

export const lotConsumptions = pgTable('lot_consumptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  lotId: uuid('lot_id').notNull().references(() => taxLots.id),
  disposalEventId: uuid('disposal_event_id').notNull().references(() => events.id),
  quantity: numeric('quantity').notNull(),
  costBasis: numeric('cost_basis').notNull(),
  proceeds: numeric('proceeds').notNull(),
  realizedGain: numeric('realized_gain').notNull(),
  holdingDays: integer('holding_days').notNull(),
  isLongTerm: boolean('is_long_term').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxConsumptionsLot: index('idx_consumptions_lot').on(table.lotId),
  idxConsumptionsDisposal: index('idx_consumptions_disposal').on(table.disposalEventId),
  positiveConsumption: check('positive_consumption', sql`quantity > 0`),
}));

export type LotConsumption = typeof lotConsumptions.$inferSelect;
export type NewLotConsumption = typeof lotConsumptions.$inferInsert;

// --- Average Cost Positions (alternative to FIFO for accounts using avg cost) ---

export const averageCostPositions = pgTable('average_cost_positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  owner: text('owner').notNull(),
  account: text('account').notNull(),
  totalQuantity: numeric('total_quantity').notNull().default('0'),
  totalCostBasis: numeric('total_cost_basis').notNull().default('0'),
  averageCostPerUnit: numeric('average_cost_per_unit').notNull().default('0'),
  firstAcquisitionDate: timestamp('first_acquisition_date', { withTimezone: true }),
  lastUpdatedEventId: uuid('last_updated_event_id').references(() => events.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePosition: unique('unique_avg_cost_position').on(
    table.userId, table.assetId, table.owner, table.account,
  ),
  idxAvgCostPosition: index('idx_avg_cost_position').on(
    table.userId, table.assetId, table.owner, table.account,
  ),
  avgPositiveQty: check('avg_positive_qty', sql`total_quantity >= 0`),
  avgPositiveCost: check('avg_positive_cost', sql`average_cost_per_unit >= 0`),
}));

export type AverageCostPosition = typeof averageCostPositions.$inferSelect;
export type NewAverageCostPosition = typeof averageCostPositions.$inferInsert;

// --- Section 104 Pools (UK tax: running S104 pool state per scope) ---

export const S104_MATCH_TYPES = ['same_day', 'bed_and_breakfast', 'section_104_pool'] as const;
export type S104MatchType = (typeof S104_MATCH_TYPES)[number];

export const section104Pools = pgTable('section_104_pools', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  owner: text('owner').notNull(),
  account: text('account').notNull(),
  poolQuantity: numeric('pool_quantity').notNull().default('0'),
  poolCostBasisGbp: numeric('pool_cost_basis_gbp').notNull().default('0'),
  poolAverageCostGbp: numeric('pool_average_cost_gbp').notNull().default('0'),
  firstAcquisitionDate: timestamp('first_acquisition_date', { withTimezone: true }),
  lastUpdatedEventId: uuid('last_updated_event_id').references(() => events.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePool: unique('unique_s104_pool').on(
    table.userId, table.assetId, table.owner, table.account,
  ),
  idxS104PoolScope: index('idx_s104_pools_scope').on(
    table.userId, table.assetId, table.owner, table.account,
  ),
}));

export type Section104Pool = typeof section104Pools.$inferSelect;
export type NewSection104Pool = typeof section104Pools.$inferInsert;

// --- Section 104 Matches (UK tax: per-disposal match audit trail) ---

export const section104Matches = pgTable('section_104_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  disposalEventId: uuid('disposal_event_id').notNull().references(() => events.id),
  acquisitionEventId: uuid('acquisition_event_id').references(() => events.id), // NULL for pool matches
  matchType: text('match_type').notNull(), // S104MatchType
  quantityMatched: numeric('quantity_matched').notNull(),
  costBasisGbp: numeric('cost_basis_gbp').notNull(),
  proceedsGbp: numeric('proceeds_gbp').notNull(),
  realizedGainGbp: numeric('realized_gain_gbp').notNull(),
  acquisitionDate: date('acquisition_date'),
  poolQtyAfter: numeric('pool_qty_after'), // Pool state after match (pool matches only)
  poolCostGbpAfter: numeric('pool_cost_gbp_after'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxS104MatchesDisposal: index('idx_s104_matches_disposal').on(table.disposalEventId),
  idxS104MatchesAcquisition: index('idx_s104_matches_acquisition').on(table.acquisitionEventId),
  s104MatchTypeCheck: check('s104_match_type_check', sql`match_type IN ('same_day', 'bed_and_breakfast', 'section_104_pool')`),
  s104PositiveQty: check('s104_positive_qty', sql`quantity_matched > 0`),
}));

export type Section104Match = typeof section104Matches.$inferSelect;
export type NewSection104Match = typeof section104Matches.$inferInsert;

// --- Portfolio Daily Balances (end-of-day balances per scope) ---
// Named portfolio_daily_balances to avoid confusion with TJ's cash_balances

export const portfolioDailyBalances = pgTable('portfolio_daily_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  date: date('date').notNull(),
  asset: text('asset').notNull(), // Asset UUID stored as text (denormalized)
  accountType: text('account_type').notNull(), // Account name
  owner: text('owner').notNull(),
  assetClass: text('asset_class'),
  quantity: numeric('quantity').notNull(),
  price: numeric('price'),
  marketValue: numeric('market_value'),
  bookValue: numeric('book_value'),
  marketValueSource: text('market_value_source'),
  // M5: GBP daily values
  bookValueGbp: numeric('book_value_gbp'),
  marketValueGbp: numeric('market_value_gbp'),
  fxRateUsdGbp: numeric('fx_rate_usd_gbp'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueBalance: uniqueIndex('unique_portfolio_daily_balance').on(
    table.userId, table.date, table.asset, table.accountType, table.owner,
  ),
}));

export type PortfolioDailyBalance = typeof portfolioDailyBalances.$inferSelect;
export type NewPortfolioDailyBalance = typeof portfolioDailyBalances.$inferInsert;

// --- Daily Snapshots (point-in-time portfolio state from tax lots) ---

export const dailySnapshots = pgTable('daily_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  snapshotDate: date('snapshot_date').notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  owner: text('owner').notNull(),
  account: text('account').notNull(),
  quantity: numeric('quantity').notNull(),
  costBasis: numeric('cost_basis').notNull(),
  pricePerUnit: numeric('price_per_unit'),
  marketValue: numeric('market_value'),
  unrealizedGain: numeric('unrealized_gain'),
  unrealizedGainPercent: numeric('unrealized_gain_percent'),
  dailyPnl: numeric('daily_pnl'),
  dailyPnlPercent: numeric('daily_pnl_percent'),
  isCalculated: boolean('is_calculated').default(true),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSnapshot: unique('unique_daily_snapshot').on(
    table.snapshotDate, table.userId, table.assetId, table.owner, table.account,
  ),
  idxSnapshotsDateRange: index('idx_snapshots_date_range').on(table.userId, table.snapshotDate),
  idxSnapshotsAsset: index('idx_snapshots_asset').on(table.userId, table.assetId, table.snapshotDate),
  idxSnapshotsOwner: index('idx_snapshots_owner').on(
    table.userId, table.owner, table.account, table.snapshotDate,
  ),
  snapshotPositiveQty: check('snapshot_positive_qty', sql`quantity >= 0`),
}));

export type DailySnapshot = typeof dailySnapshots.$inferSelect;
export type NewDailySnapshot = typeof dailySnapshots.$inferInsert;

// --- Price History (OHLCV with multi-source priority) ---

export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  priceDate: date('price_date').notNull(),
  priceClose: numeric('price_close').notNull(),
  priceOpen: numeric('price_open'),
  priceHigh: numeric('price_high'),
  priceLow: numeric('price_low'),
  volume: numeric('volume'),
  source: text('source').notNull(), // PriceSource
  sourceRawPrice: numeric('source_raw_price'),
  sourceCurrency: text('source_currency'),
  fxRateToUsd: numeric('fx_rate_to_usd'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueAssetDateSource: unique('unique_price_asset_date_source').on(
    table.assetId, table.priceDate, table.source,
  ),
  idxPriceLookup: index('idx_price_lookup').on(table.assetId, table.priceDate),
  idxPriceSource: index('idx_price_source').on(table.source, table.priceDate),
  positivePrice: check('positive_price', sql`price_close > 0`),
}));

export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type NewPriceHistoryRow = typeof priceHistory.$inferInsert;

// --- Daily Portfolio Values (aggregated NAV at three levels) ---

export const dailyPortfolioValues = pgTable('daily_portfolio_values', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  date: date('date').notNull(),
  owner: text('owner'), // NULL = grand total
  account: text('account'), // NULL = owner-level or grand total
  totalMarketValue: numeric('total_market_value'),
  totalBookValue: numeric('total_book_value'),
  unrealizedGain: numeric('unrealized_gain'),
  unrealizedGainPercent: numeric('unrealized_gain_percent'),
  positionCount: integer('position_count'),
  priceCompleteness: numeric('price_completeness'), // % positions with real prices
  // M5: GBP aggregates
  totalMarketValueGbp: numeric('total_market_value_gbp'),
  totalBookValueGbp: numeric('total_book_value_gbp'),
  unrealizedGainGbp: numeric('unrealized_gain_gbp'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // NOTE: The actual NULL-safe unique index is created in migration SQL using COALESCE.
  // This Drizzle index is approximate — for type inference and documentation only.
  uniqueNav: uniqueIndex('unique_daily_portfolio_value').on(
    table.userId, table.date, table.owner, table.account,
  ),
  idxNavDate: index('idx_daily_portfolio_values_date').on(table.userId, table.date),
}));

export type DailyPortfolioValue = typeof dailyPortfolioValues.$inferSelect;
export type NewDailyPortfolioValue = typeof dailyPortfolioValues.$inferInsert;

// ============================================================================
// End Portfolio Accounting Tables
// ============================================================================

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

// ============================================================================
// Reconciliation Resolutions (M7.1)
// ============================================================================

export const RESOLUTION_STATUSES = ['unresolved', 'accepted', 'flagged', 'resolved'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const DISCREPANCY_NATURES = [
  'mapping_error', 'missing_coverage', 'expected_gap',
  'dust', 'price_drift', 'qty_drift', 'other',
] as const;
export type DiscrepancyNature = (typeof DISCREPANCY_NATURES)[number];

export const reconciliationResolutions = pgTable(
  'reconciliation_resolutions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    owner: text('owner').notNull(),
    ticker: text('ticker').notNull(),
    status: text('status').notNull().default('unresolved'), // ResolutionStatus
    nature: text('nature'), // DiscrepancyNature — root cause classification
    notes: text('notes'),
    discrepancyType: text('discrepancy_type'), // qty_mismatch | mv_mismatch | snapshot_only | event_sourced_only
    qtyDeltaAtAction: numeric('qty_delta_at_action'),
    mvDeltaAtAction: numeric('mv_delta_at_action'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    ownerTickerUnique: uniqueIndex('idx_recon_res_owner_ticker').on(table.owner, table.ticker),
    statusIdx: index('idx_recon_res_status').on(table.status),
  })
);

export type ReconciliationResolution = typeof reconciliationResolutions.$inferSelect;
export type NewReconciliationResolution = typeof reconciliationResolutions.$inferInsert;

// --- Reconciliation Checkpoints ---

export const reconciliationCheckpoints = pgTable(
  'reconciliation_checkpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    comparisonDate: date('comparison_date').notNull(),
    snapshotNav: numeric('snapshot_nav').notNull(),
    eventSourcedNav: numeric('event_sourced_nav').notNull(),
    navDelta: numeric('nav_delta').notNull(),
    navDeltaPct: numeric('nav_delta_pct').notNull(),
    totalPositions: integer('total_positions').notNull(),
    matchedPositions: integer('matched_positions').notNull(),
    discrepancyCount: integer('discrepancy_count').notNull(),
    acceptedCount: integer('accepted_count').notNull(),
    flaggedCount: integer('flagged_count').notNull(),
    resolvedCount: integer('resolved_count').notNull(),
    unresolvedCount: integer('unresolved_count').notNull(),
    eventSourceFreshness: jsonb('event_source_freshness').notNull(),
    positionSnapshot: jsonb('position_snapshot').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    comparisonDateIdx: index('idx_recon_checkpoint_date').on(table.comparisonDate),
    createdAtIdx: index('idx_recon_checkpoint_created').on(table.createdAt),
  })
);

export type ReconciliationCheckpoint = typeof reconciliationCheckpoints.$inferSelect;
export type NewReconciliationCheckpoint = typeof reconciliationCheckpoints.$inferInsert;

// ============================================================================
// Intelligence Reports (World Monitor)
// Stores full World Monitor intelligence briefings from Arbor
// ============================================================================

export const intelligenceReports = pgTable(
  'intelligence_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportDate: date('report_date').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    timeWindow: text('time_window'),
    version: integer('version').default(1),
    executiveSummary: text('executive_summary'),
    keyThemes: text('key_themes'),
    fullMarkdown: text('full_markdown').notNull(),
    criticalCount: integer('critical_count').default(0),
    highCount: integer('high_count').default(0),
    mediumCount: integer('medium_count').default(0),
    infoCount: integer('info_count').default(0),
    sectors: text('sectors').array().default(sql`'{}'`),
    reportType: text('report_type').default('world-monitor'), // 'world-monitor' | 'thesis-monitor'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportDateIdx: index('idx_intelligence_reports_date').on(table.reportDate),
    createdAtIdx: index('idx_intelligence_reports_created').on(table.createdAt),
    uniqueReportDateGenerated: unique().on(table.reportDate, table.generatedAt),
  })
);

export type IntelligenceReport = typeof intelligenceReports.$inferSelect;
export type NewIntelligenceReport = typeof intelligenceReports.$inferInsert;

// ============================================================================
// Intelligence Items (individual stories from World Monitor reports)
// ============================================================================

export const intelligenceItems = pgTable(
  'intelligence_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id').notNull().references(() => intelligenceReports.id, { onDelete: 'cascade' }),
    severity: text('severity').notNull(),  // 'critical' | 'high' | 'medium' | 'info'
    sector: text('sector'),                // 'geopolitics' | 'tech' | 'finance'
    headline: text('headline').notNull(),
    body: text('body'),
    sourceUrls: text('source_urls').array().default(sql`'{}'`),
    relevantTickers: text('relevant_tickers').array().default(sql`'{}'`),
    section: text('section'),              // 'new_developments' | 'deep_dive' | 'running_stories' | 'key_themes' | 'opportunities' | 'executive_summary'
    sortOrder: integer('sort_order'),       // Ordinal position within the source report (0-based)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportIdx: index('idx_intelligence_items_report').on(table.reportId),
    severityIdx: index('idx_intelligence_items_severity').on(table.severity),
    sectorIdx: index('idx_intelligence_items_sector').on(table.sector),
    uniqueReportHeadline: unique().on(table.reportId, table.headline),
  })
);

export type IntelligenceItem = typeof intelligenceItems.$inferSelect;
export type NewIntelligenceItem = typeof intelligenceItems.$inferInsert;

// ============================================================================
// Earnings Events (portfolio holdings earnings calendar)
// ============================================================================

export const earningsEvents = pgTable(
  'earnings_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id').references(() => underlyings.id, { onDelete: 'set null' }),
    ticker: text('ticker').notNull(),
    reportDate: date('report_date').notNull(),
    reportTime: text('report_time'),       // 'bmo' | 'amc' | 'dmh'
    epsEstimate: numeric('eps_estimate'),
    epsActual: numeric('eps_actual'),
    revenueEstimate: numeric('revenue_estimate'),
    revenueActual: numeric('revenue_actual'),
    quarter: text('quarter'),
    year: integer('year'),
    surprise: numeric('surprise'),
    surprisePercent: numeric('surprise_percent'),
    source: text('source').notNull().default('finnhub'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateIdx: index('idx_earnings_events_date').on(table.reportDate),
    tickerIdx: index('idx_earnings_events_ticker').on(table.ticker),
    underlyingIdx: index('idx_earnings_events_underlying').on(table.underlyingId),
    uniqueEarnings: unique().on(table.ticker, table.reportDate, table.source),
  })
);

export type EarningsEvent = typeof earningsEvents.$inferSelect;
export type NewEarningsEvent = typeof earningsEvents.$inferInsert;

// ============================================================================
// SEC Filings (filing notifications for portfolio holdings)
// ============================================================================

export const secFilings = pgTable(
  'sec_filings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id').references(() => underlyings.id, { onDelete: 'set null' }),
    ticker: text('ticker').notNull(),
    cik: text('cik').notNull(),
    accessionNumber: text('accession_number').notNull().unique(),
    filingType: text('filing_type').notNull(),
    filingCategory: text('filing_category'),  // 'annual' | 'quarterly' | 'current' | 'proxy' | 'insider' | 'other'
    filedDate: date('filed_date').notNull(),
    filingUrl: text('filing_url').notNull(),
    description: text('description'),
    isMaterial: boolean('is_material').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tickerIdx: index('idx_sec_filings_ticker').on(table.ticker),
    dateIdx: index('idx_sec_filings_date').on(table.filedDate),
    typeIdx: index('idx_sec_filings_type').on(table.filingType),
    underlyingIdx: index('idx_sec_filings_underlying').on(table.underlyingId),
  })
);

export type SecFiling = typeof secFilings.$inferSelect;
export type NewSecFiling = typeof secFilings.$inferInsert;

// ============================================================================
// Analyst Actions (upgrade/downgrade rating changes from Finnhub)
// ============================================================================

export const analystActions = pgTable(
  'analyst_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id').references(() => underlyings.id, { onDelete: 'set null' }),
    ticker: text('ticker').notNull(),
    action: text('action').notNull(),          // 'up' | 'down' | 'main' | 'init' | 'reit'
    analystFirm: text('analyst_firm').notNull(),
    fromGrade: text('from_grade'),
    toGrade: text('to_grade'),
    actionDate: date('action_date').notNull(),
    source: text('source').notNull().default('finnhub'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tickerIdx: index('idx_analyst_actions_ticker').on(table.ticker),
    dateIdx: index('idx_analyst_actions_date').on(table.actionDate),
    underlyingIdx: index('idx_analyst_actions_underlying').on(table.underlyingId),
    uniqueAction: unique().on(table.ticker, table.analystFirm, table.actionDate, table.source),
  })
);

export type AnalystAction = typeof analystActions.$inferSelect;
export type NewAnalystAction = typeof analystActions.$inferInsert;

// ============================================================================
// Analyst Price Targets (consensus price target snapshots from Finnhub)
// ============================================================================

export const analystPriceTargets = pgTable(
  'analyst_price_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id').references(() => underlyings.id, { onDelete: 'set null' }),
    ticker: text('ticker').notNull(),
    targetHigh: numeric('target_high'),
    targetLow: numeric('target_low'),
    targetMean: numeric('target_mean'),
    targetMedian: numeric('target_median'),
    numberAnalysts: integer('number_analysts'),
    snapshotDate: date('snapshot_date').notNull(),
    source: text('source').notNull().default('finnhub'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tickerIdx: index('idx_analyst_price_targets_ticker').on(table.ticker),
    dateIdx: index('idx_analyst_price_targets_date').on(table.snapshotDate),
    underlyingIdx: index('idx_analyst_price_targets_underlying').on(table.underlyingId),
    uniqueTarget: unique().on(table.ticker, table.snapshotDate, table.source),
  })
);

export type AnalystPriceTarget = typeof analystPriceTargets.$inferSelect;
export type NewAnalystPriceTarget = typeof analystPriceTargets.$inferInsert;

// ============================================================================
// Insider Transactions (insider buying/selling from Finnhub)
// ============================================================================

export const insiderTransactions = pgTable(
  'insider_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    underlyingId: uuid('underlying_id').references(() => underlyings.id, { onDelete: 'set null' }),
    ticker: text('ticker').notNull(),
    insiderName: text('insider_name').notNull(),
    shares: numeric('shares'),
    change: numeric('change'),
    transactionDate: date('transaction_date').notNull(),
    filingDate: date('filing_date'),
    transactionCode: text('transaction_code'),   // 'P' (purchase), 'S' (sale), etc.
    transactionPrice: numeric('transaction_price'),
    source: text('source').notNull().default('finnhub'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tickerIdx: index('idx_insider_transactions_ticker').on(table.ticker),
    dateIdx: index('idx_insider_transactions_date').on(table.transactionDate),
    underlyingIdx: index('idx_insider_transactions_underlying').on(table.underlyingId),
    uniqueTransaction: unique().on(table.ticker, table.insiderName, table.transactionDate, table.change, table.source),
  })
);

export type InsiderTransaction = typeof insiderTransactions.$inferSelect;
export type NewInsiderTransaction = typeof insiderTransactions.$inferInsert;
