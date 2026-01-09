-- Create thesis_news_items table for storing fetched news independently of triage records
-- This enables historical news archive view on thesis detail pages

CREATE TABLE thesis_news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Thesis linkage
    thesis_id UUID NOT NULL,
    thesis_type VARCHAR(10) NOT NULL CHECK (thesis_type IN ('macro', 'asset')),

    -- News item data
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT,
    source_domain TEXT,
    published_date DATE,

    -- Fetch metadata
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    match_score INTEGER,
    matched_keywords TEXT[],
    query_type VARCHAR(10) CHECK (query_type IN ('wide', 'narrow')),

    -- Optional link to triage record (if analysis created one)
    triage_record_id UUID REFERENCES thesis_triage_records(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: same URL for same thesis only stored once
    CONSTRAINT thesis_news_items_unique_url UNIQUE (thesis_id, thesis_type, url)
);

-- Indexes for common queries
CREATE INDEX idx_thesis_news_items_thesis ON thesis_news_items(thesis_id, thesis_type);
CREATE INDEX idx_thesis_news_items_fetched_at ON thesis_news_items(fetched_at DESC);
CREATE INDEX idx_thesis_news_items_published_date ON thesis_news_items(published_date DESC);

-- Add comment
COMMENT ON TABLE thesis_news_items IS 'Historical archive of news items fetched by monitoring script for each thesis';
