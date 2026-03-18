-- Migration: add_economic_events
-- Drops the old economic_events table (wrong schema, stale data) and
-- recreates it with the correct design to match TradingView API shape.
-- Ingested by scripts/ingest-economic-calendar.ts

DROP TABLE IF EXISTS economic_events;

CREATE TABLE economic_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identity
  tv_event_id       TEXT,
  event_type        TEXT        NOT NULL,  -- Normalised key e.g. 'FOMC_RATE_DECISION'
  title             TEXT        NOT NULL,  -- Human-readable name from TradingView
  indicator         TEXT,                  -- TV indicator name
  category          TEXT,                  -- TV category code: 'cntrl' | 'lbr' | 'infl' | etc.
  country           TEXT        NOT NULL,  -- ISO country code e.g. 'US'

  -- Timing
  event_date        TIMESTAMPTZ NOT NULL,

  -- Impact
  impact_level      TEXT        NOT NULL,  -- 'high' | 'medium' | 'low'

  -- Values (nullable — future events have no actual yet)
  actual            NUMERIC,
  forecast          NUMERIC,
  previous          NUMERIC,
  unit              TEXT,                  -- '%', 'K', 'B', etc.

  -- Source metadata
  source            TEXT,
  source_url        TEXT,
  period            TEXT,                  -- Reference period e.g. 'Mar', 'Q1'

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Upsert key: type + date + country uniquely identifies an event
  CONSTRAINT economic_events_event_type_event_date_country_key
    UNIQUE (event_type, event_date, country)
);

-- Indexes for common query patterns
CREATE INDEX idx_economic_events_event_date
  ON economic_events (event_date);

CREATE INDEX idx_economic_events_impact
  ON economic_events (impact_level);

CREATE INDEX idx_economic_events_country
  ON economic_events (country);

COMMENT ON TABLE economic_events IS
  'Upcoming and recent economic releases fetched from TradingView economic calendar. '
  'Ingested by scripts/ingest-economic-calendar.ts. Used by macro thesis signals.';
