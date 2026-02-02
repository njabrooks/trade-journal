-- Migration: Merge duplicate Kraken accounts
-- The Nick_KRAKEN account (e96394aa) is the same as kraken (51782199) after a rename.
-- This migration merges all data from Nick_KRAKEN into kraken and removes the old account.

BEGIN;

-- Define account IDs
-- Old: Nick_KRAKEN = e96394aa-7e34-4556-b828-b28797b35b19
-- New: kraken      = 51782199-1190-4259-8e88-112422b55780

-- Step 1: Merge duplicate strategies (same key on both accounts)
-- For each overlapping key, move positions & trades from Nick_KRAKEN strategy to kraken strategy

-- BABY-CRYPTO: Nick_KRAKEN 98324777 -> kraken 6d6d1e25
UPDATE positions SET strategy_id = '6d6d1e25-c308-4ce2-9599-739099145ab3', updated_at = NOW()
  WHERE strategy_id = '98324777-b70e-42b4-8d29-0bd84bc82a01';
UPDATE trades SET strategy_id = '6d6d1e25-c308-4ce2-9599-739099145ab3'
  WHERE strategy_id = '98324777-b70e-42b4-8d29-0bd84bc82a01';

-- BTC-CRYPTO: Nick_KRAKEN 38af7dcb -> kraken 644a8bdd (already 0 pos/trades)
UPDATE positions SET strategy_id = '644a8bdd-4457-44dd-9208-4001a79f0518', updated_at = NOW()
  WHERE strategy_id = '38af7dcb-c0e6-4479-a492-369ab40f2347';
UPDATE trades SET strategy_id = '644a8bdd-4457-44dd-9208-4001a79f0518'
  WHERE strategy_id = '38af7dcb-c0e6-4479-a492-369ab40f2347';

-- DOGE-CRYPTO: Nick_KRAKEN 6191c765 -> kraken 4d6e1580 (already 0 pos/trades)
UPDATE positions SET strategy_id = '4d6e1580-b26c-462a-9627-4dd8cbb3fff6', updated_at = NOW()
  WHERE strategy_id = '6191c765-3309-4aae-b8aa-f1ec034c4fdb';
UPDATE trades SET strategy_id = '4d6e1580-b26c-462a-9627-4dd8cbb3fff6'
  WHERE strategy_id = '6191c765-3309-4aae-b8aa-f1ec034c4fdb';

-- SUI-CRYPTO: Nick_KRAKEN d4570e62 -> kraken 91e0f644 (already 0 pos/trades)
UPDATE positions SET strategy_id = '91e0f644-a943-4709-8d81-fb4efc937ed0', updated_at = NOW()
  WHERE strategy_id = 'd4570e62-8d29-47cd-8ef4-d1790859d86e';
UPDATE trades SET strategy_id = '91e0f644-a943-4709-8d81-fb4efc937ed0'
  WHERE strategy_id = 'd4570e62-8d29-47cd-8ef4-d1790859d86e';

-- TAO-CRYPTO: Nick_KRAKEN b59f92a0 -> kraken d13bebe4
UPDATE positions SET strategy_id = 'd13bebe4-2cd0-4c6b-9aa4-4aceb4521f77', updated_at = NOW()
  WHERE strategy_id = 'b59f92a0-f92f-4b67-b24e-913c953ce7f1';
UPDATE trades SET strategy_id = 'd13bebe4-2cd0-4c6b-9aa4-4aceb4521f77'
  WHERE strategy_id = 'b59f92a0-f92f-4b67-b24e-913c953ce7f1';

-- Step 2: Clean up triage records, metrics snapshots, and journal entries for old strategies
DELETE FROM triage_records WHERE strategy_id IN (
  '98324777-b70e-42b4-8d29-0bd84bc82a01',
  '38af7dcb-c0e6-4479-a492-369ab40f2347',
  '6191c765-3309-4aae-b8aa-f1ec034c4fdb',
  'd4570e62-8d29-47cd-8ef4-d1790859d86e',
  'b59f92a0-f92f-4b67-b24e-913c953ce7f1'
);

DELETE FROM strategy_metrics_snapshots WHERE strategy_id IN (
  '98324777-b70e-42b4-8d29-0bd84bc82a01',
  '38af7dcb-c0e6-4479-a492-369ab40f2347',
  '6191c765-3309-4aae-b8aa-f1ec034c4fdb',
  'd4570e62-8d29-47cd-8ef4-d1790859d86e',
  'b59f92a0-f92f-4b67-b24e-913c953ce7f1'
);

-- Step 3: Delete the old Nick_KRAKEN strategies (all data moved to kraken strategies)
DELETE FROM strategies WHERE id IN (
  '98324777-b70e-42b4-8d29-0bd84bc82a01',
  '38af7dcb-c0e6-4479-a492-369ab40f2347',
  '6191c765-3309-4aae-b8aa-f1ec034c4fdb',
  'd4570e62-8d29-47cd-8ef4-d1790859d86e',
  'b59f92a0-f92f-4b67-b24e-913c953ce7f1'
);

-- Step 4: Move all remaining data from Nick_KRAKEN account to kraken account
-- Positions (any that weren't linked to a strategy)
UPDATE positions SET account_id = '51782199-1190-4259-8e88-112422b55780', updated_at = NOW()
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Trades
UPDATE trades SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Triage records
UPDATE triage_records SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Ingestion runs
UPDATE ingestion_runs SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Ingestion cursors (delete old - kraken account already has its own cursors)
DELETE FROM ingestion_cursors
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- MTM snapshots
UPDATE mtm_snapshots SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- NAV snapshots
UPDATE nav_snapshots SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Portfolio snapshots
UPDATE portfolio_snapshots SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Strategy metrics snapshots (any remaining ones not already deleted in step 2)
UPDATE strategy_metrics_snapshots SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Flex query configs
UPDATE flex_query_configs SET account_id = '51782199-1190-4259-8e88-112422b55780'
  WHERE account_id = 'e96394aa-7e34-4556-b828-b28797b35b19';

-- Step 5: Delete the old Nick_KRAKEN account
DELETE FROM accounts WHERE id = 'e96394aa-7e34-4556-b828-b28797b35b19';

COMMIT;
