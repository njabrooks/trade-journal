-- Add owner field to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner TEXT;

-- Populate owner based on existing labels
UPDATE accounts SET owner = 'Alex' WHERE label LIKE 'Alex%';
UPDATE accounts SET owner = 'Lily' WHERE label LIKE 'Lily%';
UPDATE accounts SET owner = 'Leo' WHERE label LIKE 'Leo%';
UPDATE accounts SET owner = 'Maisy' WHERE label LIKE 'Maisy%';
UPDATE accounts SET owner = 'Nick' WHERE label LIKE 'Nick%';
UPDATE accounts SET owner = 'TTC' WHERE label LIKE 'TTC%';

-- Set Nick for the Kraken account with null label
UPDATE accounts SET owner = 'Nick' WHERE broker_account_id = 'Nick_KRAKEN';
