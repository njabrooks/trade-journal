-- M6: UK Tax Method — HMRC Section 104 Pooling
-- Creates tables for Section 104 pool tracking and disposal match audit trail.
-- Also updates owner/account data for UK tax jurisdiction.

-- ============================================================================
-- New Table: section_104_pools
-- Running S104 pool state per (asset, owner, account) scope.
-- Analogous to average_cost_positions but GBP-denominated with S104 semantics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS section_104_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  asset_id UUID NOT NULL REFERENCES assets(id),
  owner TEXT NOT NULL,
  account TEXT NOT NULL,
  pool_quantity NUMERIC NOT NULL DEFAULT 0,
  pool_cost_basis_gbp NUMERIC NOT NULL DEFAULT 0,
  pool_average_cost_gbp NUMERIC NOT NULL DEFAULT 0,
  first_acquisition_date TIMESTAMPTZ,
  last_updated_event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, asset_id, owner, account)
);

CREATE INDEX idx_s104_pools_user ON section_104_pools(user_id);
CREATE INDEX idx_s104_pools_scope ON section_104_pools(user_id, asset_id, owner, account);

-- ============================================================================
-- New Table: section_104_matches
-- Per-match audit trail for S104 disposals.
-- Each disposal event may have 1-3 match rows (same-day, B&B, pool).
-- Analogous to lot_consumptions for FIFO.
-- ============================================================================

CREATE TABLE IF NOT EXISTS section_104_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposal_event_id UUID NOT NULL REFERENCES events(id),
  acquisition_event_id UUID REFERENCES events(id),  -- NULL for pool matches
  match_type TEXT NOT NULL,  -- 'same_day' | 'bed_and_breakfast' | 'section_104_pool'
  quantity_matched NUMERIC NOT NULL,
  cost_basis_gbp NUMERIC NOT NULL,
  proceeds_gbp NUMERIC NOT NULL,
  realized_gain_gbp NUMERIC NOT NULL,
  acquisition_date DATE,  -- For audit trail
  pool_qty_after NUMERIC,  -- Pool state after match (pool matches only)
  pool_cost_gbp_after NUMERIC,  -- Pool state after match (pool matches only)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT s104_match_type_check CHECK (match_type IN ('same_day', 'bed_and_breakfast', 'section_104_pool')),
  CONSTRAINT s104_positive_qty CHECK (quantity_matched > 0)
);

CREATE INDEX idx_s104_matches_disposal ON section_104_matches(disposal_event_id);
CREATE INDEX idx_s104_matches_acquisition ON section_104_matches(acquisition_event_id);

-- ============================================================================
-- Data Updates: Set UK tax jurisdiction for Nick
-- ============================================================================

-- Set Nick's tax jurisdiction to GB (enables S104 cost basis)
UPDATE owners
SET tax_jurisdiction = 'GB', updated_at = now()
WHERE name = 'Nick' AND (tax_jurisdiction IS NULL OR tax_jurisdiction = 'US');

-- Set Nick's accounts to uk_section_104 cost basis method
UPDATE accounts
SET cost_basis_method = 'uk_section_104', updated_at = now()
WHERE owner = 'Nick' AND (cost_basis_method IS NULL OR cost_basis_method = 'average_cost');
