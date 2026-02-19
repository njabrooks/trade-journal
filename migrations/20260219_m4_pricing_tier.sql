-- M4.1: Add pricing_tier classification to assets table
-- Enables systematic daily price fetching by categorizing assets into:
--   market     - API-fetchable prices (Polygon crypto, IBKR equity)
--   proxy      - Priced via known equivalent (WBTC→BTC, STETH→ETH)
--   book_value - No market price, use cost basis (LP tokens, yield tokens)
--   zero       - Dead/dust/worthless (Solana addresses, dead tokens)

ALTER TABLE assets ADD COLUMN IF NOT EXISTS pricing_tier text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS proxy_asset_id uuid REFERENCES assets(id);

CREATE INDEX IF NOT EXISTS idx_assets_pricing_tier ON assets(pricing_tier);
