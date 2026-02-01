-- Add ingestion_cursors table for tracking incremental crypto exchange ingestion state
CREATE TABLE IF NOT EXISTS ingestion_cursors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  cursor_type text NOT NULL,
  cursor_value text NOT NULL,
  metadata jsonb,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(account_id, exchange, cursor_type)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_cursors_exchange ON ingestion_cursors(exchange);
