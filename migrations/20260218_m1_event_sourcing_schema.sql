-- Phase M1: Event Sourcing & Portfolio Accounting Schema
-- Date: 2026-02-18
-- Context: TTC Migration — creates all portfolio accounting tables in Trade Journal
-- Reference: twotreescap-app/docs/TRADE_JOURNAL_MIGRATION_PLAN.md

-- ============================================================================
-- 1. Owners
-- ============================================================================

CREATE TABLE IF NOT EXISTS owners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'individual',
  legal_name TEXT,
  tax_jurisdiction TEXT DEFAULT 'US',
  ssn_or_ein TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_owners_user ON owners(user_id);

-- ============================================================================
-- 2. Assets (canonical instrument registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  name TEXT,
  asset_class TEXT NOT NULL,
  sub_class TEXT,
  ibkr_conid TEXT UNIQUE,
  coinmarketcap_id TEXT,
  coingecko_id TEXT,
  cusip TEXT,
  isin TEXT,
  decimals INTEGER DEFAULT 8,
  base_currency TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_conid ON assets(ibkr_conid);
CREATE INDEX IF NOT EXISTS idx_assets_class ON assets(asset_class);
CREATE INDEX IF NOT EXISTS idx_assets_ticker ON assets(ticker);

-- ============================================================================
-- 3. Asset Aliases
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_aliases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aliases_unique ON asset_aliases(alias, source);
CREATE INDEX IF NOT EXISTS idx_aliases_asset ON asset_aliases(asset_id);

-- ============================================================================
-- 4. Import Batches (state machine for import operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL,
  filename TEXT,
  file_hash TEXT,
  total_records INTEGER,
  processed_records INTEGER DEFAULT 0,
  skipped_records INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  calc_phase TEXT,
  calc_progress JSONB,
  error_message TEXT,
  error_details JSONB,
  validation_errors JSONB,
  validation_warnings JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_batches_user_status ON import_batches(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_idempotency ON import_batches(user_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_import_batches_started ON import_batches(started_at);

-- ============================================================================
-- 5. Events (immutable append-only transaction log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  settlement_date DATE,
  asset_id UUID NOT NULL REFERENCES assets(id),
  asset_ticker TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price NUMERIC,
  total_value NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_basis NUMERIC,
  owner TEXT NOT NULL,
  account TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  import_batch_id UUID NOT NULL REFERENCES import_batches(id),
  linked_event_id UUID REFERENCES events(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  raw_data JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_asset ON events(asset_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_batch ON events(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_events_user_asset ON events(user_id, asset_ticker);
CREATE INDEX IF NOT EXISTS idx_events_owner_account ON events(owner, account);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source, source_id);

-- ============================================================================
-- 6. Event Calculations (mutable derived state per event)
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_calculations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  running_quantity NUMERIC,
  cost_basis NUMERIC,
  cost_basis_method TEXT,
  realized_gain NUMERIC,
  holding_days INTEGER,
  is_long_term BOOLEAN,
  new_average_cost NUMERIC,
  average_cost_used NUMERIC,
  fifo_matched BOOLEAN,
  lot_consumptions_count INTEGER,
  lot_type TEXT,
  calculated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_calculations_event_id ON event_calculations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_calculations_user ON event_calculations(user_id);

-- ============================================================================
-- 7. Tax Lots (FIFO cost basis tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_lots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id UUID NOT NULL REFERENCES assets(id),
  owner TEXT NOT NULL,
  account TEXT NOT NULL,
  acquisition_event_id UUID NOT NULL REFERENCES events(id) UNIQUE,
  acquisition_date TIMESTAMPTZ NOT NULL,
  original_quantity NUMERIC NOT NULL,
  consumed_quantity NUMERIC NOT NULL DEFAULT 0,
  remaining_quantity NUMERIC NOT NULL,
  cost_basis_per_unit NUMERIC NOT NULL,
  total_cost_basis NUMERIC NOT NULL,
  remaining_cost_basis NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  lot_type TEXT NOT NULL DEFAULT 'long',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT quantity_balance CHECK (remaining_quantity = original_quantity - consumed_quantity),
  CONSTRAINT positive_remaining CHECK (remaining_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_lots_fifo
  ON tax_lots(user_id, asset_id, owner, account, status, acquisition_date);
CREATE INDEX IF NOT EXISTS idx_lots_user ON tax_lots(user_id);
CREATE INDEX IF NOT EXISTS idx_lots_asset ON tax_lots(asset_id);

-- ============================================================================
-- 8. Lot Consumptions (FIFO matching audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lot_consumptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_id UUID NOT NULL REFERENCES tax_lots(id),
  disposal_event_id UUID NOT NULL REFERENCES events(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  cost_basis NUMERIC NOT NULL,
  proceeds NUMERIC NOT NULL,
  realized_gain NUMERIC NOT NULL,
  holding_days INTEGER NOT NULL,
  is_long_term BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consumptions_lot ON lot_consumptions(lot_id);
CREATE INDEX IF NOT EXISTS idx_consumptions_disposal ON lot_consumptions(disposal_event_id);

-- ============================================================================
-- 9. Average Cost Positions
-- ============================================================================

CREATE TABLE IF NOT EXISTS average_cost_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id UUID NOT NULL REFERENCES assets(id),
  owner TEXT NOT NULL,
  account TEXT NOT NULL,
  total_quantity NUMERIC NOT NULL DEFAULT 0,
  total_cost_basis NUMERIC NOT NULL DEFAULT 0,
  average_cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  first_acquisition_date TIMESTAMPTZ,
  last_updated_event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, asset_id, owner, account),
  CONSTRAINT avg_positive_qty CHECK (total_quantity >= 0),
  CONSTRAINT avg_positive_cost CHECK (average_cost_per_unit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_avg_cost_position
  ON average_cost_positions(user_id, asset_id, owner, account);

-- ============================================================================
-- 10. Portfolio Daily Balances (end-of-day balances per scope)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_daily_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  asset TEXT NOT NULL,
  account_type TEXT NOT NULL,
  owner TEXT NOT NULL,
  asset_class TEXT,
  quantity NUMERIC NOT NULL,
  price NUMERIC,
  market_value NUMERIC,
  book_value NUMERIC,
  market_value_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_portfolio_daily_balance
  ON portfolio_daily_balances(user_id, date, asset, account_type, owner);

-- ============================================================================
-- 11. Daily Snapshots (point-in-time portfolio state from tax lots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  asset_id UUID NOT NULL REFERENCES assets(id),
  owner TEXT NOT NULL,
  account TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  cost_basis NUMERIC NOT NULL,
  price_per_unit NUMERIC,
  market_value NUMERIC,
  unrealized_gain NUMERIC,
  unrealized_gain_percent NUMERIC,
  daily_pnl NUMERIC,
  daily_pnl_percent NUMERIC,
  is_calculated BOOLEAN DEFAULT true,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, user_id, asset_id, owner, account)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date_range ON daily_snapshots(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_asset ON daily_snapshots(user_id, asset_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_owner ON daily_snapshots(user_id, owner, account, snapshot_date);

-- ============================================================================
-- 12. Price History (OHLCV with multi-source priority)
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES assets(id),
  price_date DATE NOT NULL,
  price_close NUMERIC NOT NULL CHECK (price_close > 0),
  price_open NUMERIC,
  price_high NUMERIC,
  price_low NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL,
  source_raw_price NUMERIC,
  source_currency TEXT,
  fx_rate_to_usd NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(asset_id, price_date, source)
);

CREATE INDEX IF NOT EXISTS idx_price_lookup ON price_history(asset_id, price_date);
CREATE INDEX IF NOT EXISTS idx_price_source ON price_history(source, price_date);

-- ============================================================================
-- 13. Daily Portfolio Values (aggregated NAV at three levels)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_portfolio_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  owner TEXT,
  account TEXT,
  total_market_value NUMERIC,
  total_book_value NUMERIC,
  unrealized_gain NUMERIC,
  unrealized_gain_percent NUMERIC,
  position_count INTEGER,
  price_completeness NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- NULL-safe unique index (COALESCE handles NULL owner/account for aggregation levels)
CREATE UNIQUE INDEX IF NOT EXISTS unique_daily_portfolio_value_coalesce
  ON daily_portfolio_values(user_id, date, COALESCE(owner, '__ALL__'), COALESCE(account, '__ALL__'));

CREATE INDEX IF NOT EXISTS idx_daily_portfolio_values_date ON daily_portfolio_values(user_id, date);

-- ============================================================================
-- 14. Best Daily Prices (view — selects best source per asset/date)
-- ============================================================================

CREATE OR REPLACE VIEW best_daily_prices AS
SELECT DISTINCT ON (asset_id, price_date)
  asset_id,
  price_date,
  price_close,
  source
FROM price_history
ORDER BY
  asset_id,
  price_date,
  CASE source
    WHEN 'manual' THEN 1
    WHEN 'ibkr' THEN 2
    WHEN 'snapshot' THEN 3
    WHEN 'coingecko' THEN 4
    WHEN 'massive' THEN 5
    WHEN 'tradingview' THEN 6
    WHEN 'coinmarketcap' THEN 7
    WHEN 'fx_rate' THEN 8
    WHEN 'proxy' THEN 9
  END;

-- ============================================================================
-- 15. Alter existing accounts table (add portfolio accounting fields)
-- ============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owners(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS institution TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cost_basis_method TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
