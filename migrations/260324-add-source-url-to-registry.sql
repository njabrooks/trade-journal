-- Add source_url column for user-facing website links on data sources page
ALTER TABLE signal_data_source_registry
ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Populate URLs for sources with a web presence
UPDATE signal_data_source_registry SET source_url = CASE key
  WHEN 'tradingview_cdp'  THEN 'https://www.tradingview.com'
  WHEN 'coingecko'        THEN 'https://www.coingecko.com'
  WHEN 'defillama'        THEN 'https://defillama.com'
  WHEN 'hypeflows'        THEN 'https://hypeflows.com'
  WHEN 'hormuz_strait'    THEN 'https://hormuzstraitmonitor.com'
  WHEN 'economic_calendar' THEN 'https://www.tradingview.com/economic-calendar/'
  WHEN 'strategy_price'   THEN 'https://www.tradingview.com'
  WHEN 'price_history'    THEN 'https://www.tradingview.com'
  ELSE NULL
END
WHERE key IN ('tradingview_cdp', 'coingecko', 'defillama', 'hypeflows', 'hormuz_strait', 'economic_calendar', 'strategy_price', 'price_history');
