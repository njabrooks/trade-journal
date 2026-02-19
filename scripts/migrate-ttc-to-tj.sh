#!/usr/bin/env bash
#
# M1 Data Migration: TTC Supabase → TJ Supabase
#
# Transfers ~594K rows across 9 tables (4 empty tables skipped).
# Idempotent: safe to re-run (truncates TJ tables before loading).
#
# Usage: bash scripts/migrate-ttc-to-tj.sh [--dry-run]
#
set -euo pipefail

PSQL="/opt/homebrew/opt/postgresql@17/bin/psql"
PG_DUMP="/opt/homebrew/opt/postgresql@17/bin/pg_dump"
DUMP_DIR="/tmp/ttc-to-tj-migration"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE — no data will be written ==="
fi

# ============================================================================
# Phase 0: Connection setup
# ============================================================================

echo ""
echo "=== Phase 0: Verifying connectivity ==="

TTC_URL="$(grep '^DATABASE_URL=' /Users/njb/Desktop/projects/twotreescap-app/.env.local | head -1 | cut -d= -f2-)?sslmode=require&gssencmode=disable"
TJ_URL="$(grep '^DATABASE_URL_POOLER=' /Users/njb/Desktop/projects/trade-journal/.env.local | head -1 | cut -d= -f2-)&gssencmode=disable"

$PSQL "$TTC_URL" -t -c "SELECT 'TTC connected (' || current_database() || ')'" || { echo "FATAL: Cannot connect to TTC"; exit 1; }
$PSQL "$TJ_URL" -t -c "SELECT 'TJ connected (' || current_database() || ')'" || { echo "FATAL: Cannot connect to TJ"; exit 1; }

# ============================================================================
# Phase 1: Export from TTC
# ============================================================================

echo ""
echo "=== Phase 1: Exporting from TTC ==="

mkdir -p "$DUMP_DIR"

# --- Tables without enums: direct pg_dump ---
for TABLE in assets import_batches events event_calculations average_cost_positions daily_portfolio_values; do
  echo "  Exporting $TABLE..."
  $PG_DUMP "$TTC_URL" \
    --data-only \
    --no-owner \
    --no-privileges \
    --table="public.$TABLE" \
    --file="$DUMP_DIR/$TABLE.sql"
done

# --- daily_balances → portfolio_daily_balances (rename via sed) ---
echo "  Exporting daily_balances (→ portfolio_daily_balances)..."
$PG_DUMP "$TTC_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --table="public.daily_balances" \
  --file="$DUMP_DIR/daily_balances_raw.sql"

sed 's/public\.daily_balances/public.portfolio_daily_balances/g; s/^COPY daily_balances/COPY portfolio_daily_balances/g' \
  "$DUMP_DIR/daily_balances_raw.sql" > "$DUMP_DIR/portfolio_daily_balances.sql"

# --- owners (entity_type enum → text) ---
echo "  Exporting owners (enum→text cast)..."
$PSQL "$TTC_URL" -c "\COPY (SELECT id, user_id, name, entity_type::text, legal_name, tax_jurisdiction, ssn_or_ein, is_active, created_at, updated_at FROM owners) TO STDOUT WITH (FORMAT csv, HEADER true)" \
  > "$DUMP_DIR/owners.csv"

# --- price_history (source enum → text) ---
echo "  Exporting price_history (enum→text cast)..."
$PSQL "$TTC_URL" -c "\COPY (SELECT id, asset_id, price_date, price_close, price_open, price_high, price_low, volume, source::text, source_raw_price, source_currency, fx_rate_to_usd, created_at, updated_at FROM price_history) TO STDOUT WITH (FORMAT csv, HEADER true)" \
  > "$DUMP_DIR/price_history.csv"

echo "  Export complete. Files in $DUMP_DIR"
ls -lh "$DUMP_DIR"

if $DRY_RUN; then
  echo ""
  echo "=== DRY RUN: Would load the following into TJ ==="
  for f in "$DUMP_DIR"/*.sql "$DUMP_DIR"/*.csv; do
    [ -f "$f" ] && echo "  $(basename "$f"): $(wc -l < "$f") lines / $(du -h "$f" | cut -f1)"
  done
  echo ""
  echo "=== Source row counts ==="
  $PSQL "$TTC_URL" -t -c "
    SELECT 'assets', COUNT(*) FROM assets
    UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches
    UNION ALL SELECT 'owners', COUNT(*) FROM owners
    UNION ALL SELECT 'events', COUNT(*) FROM events
    UNION ALL SELECT 'event_calculations', COUNT(*) FROM event_calculations
    UNION ALL SELECT 'average_cost_positions', COUNT(*) FROM average_cost_positions
    UNION ALL SELECT 'daily_balances', COUNT(*) FROM daily_balances
    UNION ALL SELECT 'price_history', COUNT(*) FROM price_history
    UNION ALL SELECT 'daily_portfolio_values', COUNT(*) FROM daily_portfolio_values
    ORDER BY 1;
  "
  echo ""
  echo "=== DRY RUN complete. Re-run without --dry-run to execute. ==="
  rm -rf "$DUMP_DIR"
  exit 0
fi

# ============================================================================
# Phase 2: Pre-load cleanup on TJ
# ============================================================================

echo ""
echo "=== Phase 2: Preparing TJ (clear M1 tables + drop constraints) ==="

# SAFETY: Use DELETE FROM (not TRUNCATE CASCADE) to avoid cascading into
# TJ's existing core tables (accounts, strategies, positions, trades, signals).
# Only M1 event-sourcing tables are cleared.

$PSQL "$TJ_URL" <<'SQL'
SET timezone = 'UTC';

-- Delete M1 data in reverse FK order (NO CASCADE)
DELETE FROM lot_consumptions;
DELETE FROM tax_lots;
DELETE FROM event_calculations;
DELETE FROM average_cost_positions;
DELETE FROM daily_snapshots;
DELETE FROM events;
DELETE FROM asset_aliases;
DELETE FROM price_history;
DELETE FROM portfolio_daily_balances;
DELETE FROM daily_portfolio_values;
DELETE FROM import_batches;
DELETE FROM owners;
DELETE FROM assets;

-- Drop FK constraints that TTC doesn't enforce
-- (TTC has no import_batch_id FK, no linked_event_id FK for some data)
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_linked_event_id_fkey;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_import_batch_id_fkey;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_quantity_check;

-- Drop check constraints not present in TTC
-- (TTC data has negative avg cost positions from calculation edge cases)
ALTER TABLE average_cost_positions DROP CONSTRAINT IF EXISTS avg_positive_qty;
ALTER TABLE average_cost_positions DROP CONSTRAINT IF EXISTS avg_positive_cost;
SQL

echo "  M1 tables cleared, constraints dropped for load"

# ============================================================================
# Phase 3: Load into TJ (FK order)
# ============================================================================

echo ""
echo "=== Phase 3: Loading into TJ ==="

# Tier 0: No FK dependencies
echo "  Loading assets (1,068 rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/assets.sql"

echo "  Loading import_batches (35 rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/import_batches.sql"

echo "  Loading owners (1 row, CSV)..."
$PSQL "$TJ_URL" -c "\COPY owners (id, user_id, name, entity_type, legal_name, tax_jurisdiction, ssn_or_ein, is_active, created_at, updated_at) FROM STDIN WITH (FORMAT csv, HEADER true)" \
  < "$DUMP_DIR/owners.csv"

# Tier 1: FK → assets (or no FK)
echo "  Loading price_history (267K rows, CSV)..."
$PSQL "$TJ_URL" -c "\COPY price_history (id, asset_id, price_date, price_close, price_open, price_high, price_low, volume, source, source_raw_price, source_currency, fx_rate_to_usd, created_at, updated_at) FROM STDIN WITH (FORMAT csv, HEADER true)" \
  < "$DUMP_DIR/price_history.csv"

echo "  Loading portfolio_daily_balances (244K rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/portfolio_daily_balances.sql"

echo "  Loading daily_portfolio_values (21.5K rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/daily_portfolio_values.sql"

# Tier 2: FK → assets, import_batches
echo "  Loading events (30K rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/events.sql"

# Tier 3: FK → events
echo "  Loading event_calculations (30K rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/event_calculations.sql"

# Tier 4: FK → assets, events
echo "  Loading average_cost_positions (1.2K rows)..."
$PSQL "$TJ_URL" -f "$DUMP_DIR/average_cost_positions.sql"

# Re-add constraints
echo "  Re-adding constraints..."
$PSQL "$TJ_URL" <<'SQL'
-- Re-add FK constraints
ALTER TABLE events ADD CONSTRAINT events_linked_event_id_fkey
  FOREIGN KEY (linked_event_id) REFERENCES events(id);

-- Note: NOT re-adding events_import_batch_id_fkey — TTC never had it and
-- some events reference batch IDs not in import_batches table.
-- Can be added later after reconciling import_batches data.

-- Note: NOT re-adding events_quantity_check, avg_positive_qty, avg_positive_cost
-- TTC data has edge cases (negative avg cost from calculation). These constraints
-- can be re-evaluated after verifying the calculation engine produces clean data.
SQL

echo "  Load complete"

# ============================================================================
# Phase 4: Validate
# ============================================================================

echo ""
echo "=== Phase 4: Validating ==="

echo ""
echo "--- Row count comparison ---"

TABLES="assets import_batches owners events event_calculations average_cost_positions daily_portfolio_values"
ALL_OK=true

for TABLE in $TABLES; do
  TTC_COUNT=$($PSQL "$TTC_URL" -t -c "SELECT COUNT(*) FROM $TABLE" | tr -d ' ')
  TJ_COUNT=$($PSQL "$TJ_URL" -t -c "SELECT COUNT(*) FROM $TABLE" | tr -d ' ')
  if [ "$TTC_COUNT" = "$TJ_COUNT" ]; then
    echo "  $TABLE: $TTC_COUNT → $TJ_COUNT [OK]"
  else
    echo "  $TABLE: $TTC_COUNT → $TJ_COUNT [MISMATCH]"
    ALL_OK=false
  fi
done

# Special: daily_balances → portfolio_daily_balances
TTC_COUNT=$($PSQL "$TTC_URL" -t -c "SELECT COUNT(*) FROM daily_balances" | tr -d ' ')
TJ_COUNT=$($PSQL "$TJ_URL" -t -c "SELECT COUNT(*) FROM portfolio_daily_balances" | tr -d ' ')
if [ "$TTC_COUNT" = "$TJ_COUNT" ]; then
  echo "  daily_balances→portfolio_daily_balances: $TTC_COUNT → $TJ_COUNT [OK]"
else
  echo "  daily_balances→portfolio_daily_balances: $TTC_COUNT → $TJ_COUNT [MISMATCH]"
  ALL_OK=false
fi

# Special: price_history
TTC_COUNT=$($PSQL "$TTC_URL" -t -c "SELECT COUNT(*) FROM price_history" | tr -d ' ')
TJ_COUNT=$($PSQL "$TJ_URL" -t -c "SELECT COUNT(*) FROM price_history" | tr -d ' ')
if [ "$TTC_COUNT" = "$TJ_COUNT" ]; then
  echo "  price_history: $TTC_COUNT → $TJ_COUNT [OK]"
else
  echo "  price_history: $TTC_COUNT → $TJ_COUNT [MISMATCH]"
  ALL_OK=false
fi

echo ""
echo "--- Integrity checks ---"

# Self-referencing FK integrity
ORPHANS=$($PSQL "$TJ_URL" -t -c "
SELECT COUNT(*) FROM events e
WHERE e.linked_event_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM events e2 WHERE e2.id = e.linked_event_id);
" | tr -d ' ')
echo "  Orphaned linked_event_id refs: $ORPHANS"

# Enum values came through as text
echo "  price_history sources: $($PSQL "$TJ_URL" -t -c "SELECT string_agg(DISTINCT source, ', ' ORDER BY source) FROM price_history;")"

echo ""
echo "--- TJ core table safety check (must be > 0) ---"
for CORE_TABLE in accounts strategies positions trades signals; do
  CORE_COUNT=$($PSQL "$TJ_URL" -t -c "SELECT COUNT(*) FROM $CORE_TABLE" 2>/dev/null | tr -d ' ')
  if [ -z "$CORE_COUNT" ] || [ "$CORE_COUNT" = "0" ]; then
    echo "  $CORE_TABLE: ${CORE_COUNT:-N/A} [WARNING — may have been wiped!]"
    ALL_OK=false
  else
    echo "  $CORE_TABLE: $CORE_COUNT [SAFE]"
  fi
done

if $ALL_OK && [ "$ORPHANS" = "0" ]; then
  echo ""
  echo "=== MIGRATION SUCCESSFUL ==="
else
  echo ""
  echo "=== MIGRATION COMPLETED WITH WARNINGS — review above ==="
fi

# ============================================================================
# Phase 5: Cleanup
# ============================================================================

echo ""
echo "=== Phase 5: Cleaning up temp files ==="
rm -rf "$DUMP_DIR"
echo "  Done"
