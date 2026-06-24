-- Signal lineage: the explicit statement↔sensor link (docs/v2/14 §9, P3 / docs/v2/16 §3 task 2).
--
-- The clean object model is "one signal = one iteratively-improved STATEMENT + an
-- optional attached SENSOR (explicit_details)". Today build-core-argument supersedes
-- every prior signal on re-underwrite and inserts fresh rows with explicit_details=NULL,
-- so a decision-grade sensor is ORPHANED on each statement iteration (the statement and
-- the sensor are bolted on separately, never linked across versions).
--
-- supersedes_signal_id makes the lineage explicit: when a re-underwritten statement is
-- the continuation of a prior signal, it points back at it — and insert-thesis-articulation
-- carries that prior signal's sensor (explicit_details + data_driven category) forward onto
-- the new row. The sensor now survives statement iteration, attached to one continuous
-- statement lineage.
--
-- ADDITIVE ONLY (docs/v2/16 §1c): does not rename/drop statement / explicit_details /
-- category / status. NULL for fresh (non-continuation) signals.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS supersedes_signal_id uuid REFERENCES signals(id) ON DELETE SET NULL;

COMMENT ON COLUMN signals.supersedes_signal_id IS
  'The prior signal whose statement this one iterates (the statement↔sensor lineage link, docs/v2/14 §9). NULL = fresh signal. insert-thesis-articulation carries the prior sensor (explicit_details) forward along this link.';

CREATE INDEX IF NOT EXISTS idx_signals_supersedes ON signals(supersedes_signal_id);
