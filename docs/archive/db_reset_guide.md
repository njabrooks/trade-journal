# Database Reset Guide

This guide provides step-by-step instructions for resetting the database while preserving reference/configuration data.

## Overview

A database reset wipes all transactional and derived data while preserving reference data that doesn't change frequently. This is useful for:
- Testing with fresh data after bug fixes
- Starting over with clean data after schema changes
- Resolving data inconsistencies

## Tables to Preserve

These tables contain reference/configuration data and should **NOT** be wiped:

1. **`accounts`** - Brokerage account configurations
2. **`underlyings`** - Instrument reference data (tickers, asset classes, etc.)
3. **`underlyings_iv_history`** - Historical IV/ATR/RV data for underlyings
4. **`playbook_items`** - Strategy playbook rules and state codes (CRITICAL: Must be preserved or reseeded)

## Tables to Wipe

All other tables should be truncated. Order matters due to foreign key constraints:

### 1. Derived/Computed Data (wipe first)
- `ingestion_runs` - Process tracking
- `blotter_actions` - Blotter entries
- `triage_records` - Triage queue records
- `strategy_metrics_snapshots` - Strategy metrics over time
- `portfolio_snapshots` - Portfolio-level snapshots
- `nav_snapshots` - NAV snapshots
- `mtm_snapshots` - Mark-to-market snapshots

### 2. Transactional Data
- `positions` - Position snapshots
- `trades` - Trade records
- `strategies` - Strategy instances

### 3. Raw Ingestion Data
- `raw_flex_positions` - Raw position ingestion logs
- `raw_flex_trades` - Raw trade ingestion logs

### 4. Reference Data (optional - only if needed)
- `strategy_templates` - Strategy template definitions (usually wiped, but can be preserved if needed)

## Execution Method: Supabase MCP

**Use Supabase MCP tools** to execute the reset. This is the recommended and preferred method.

### Reset Steps Using MCP

1. **Use `mcp_supabase_execute_sql`** to truncate tables in order:
   - `project_id`: Your Supabase project ID
   - Execute each TRUNCATE statement individually or as a batch

2. **Tables to truncate** (in order):
   - Derived/computed data first:
     - `ingestion_runs`
     - `blotter_actions`
     - `triage_records`
     - `strategy_metrics_snapshots`
     - `portfolio_snapshots`
     - `nav_snapshots`
     - `mtm_snapshots`
   - Transactional data:
     - `positions`
     - `trades`
     - `strategies`
   - Raw ingestion data:
     - `raw_flex_positions`
     - `raw_flex_trades`
   - Reference data (optional):
     - `strategy_templates`
   
   **IMPORTANT**: Do NOT truncate `playbook_items` - it must be preserved.

3. **Verify reset** using `mcp_supabase_execute_sql` with a verification query

4. **Reseed playbook_items if needed**: After reset, check if `playbook_items` count is 17. If not, reseed using the seed script (see "Restoring Playbook Items" section below)

### Why Use Supabase MCP

- **Proper authentication**: Uses configured MCP credentials
- **Transaction safety**: MCP handles transactions properly
- **Consistent execution**: Same environment as other database operations
- **Easy verification**: Results returned directly from MCP
- **No direct SQL access needed**: Works through the MCP interface

### Example MCP Execution

Execute via Supabase MCP tools rather than direct SQL scripts. The MCP interface provides a safer and more consistent way to perform database operations.

**Note**: All database reset operations should be performed through Supabase MCP, not via direct SQL execution.

## Restoring Playbook Items

**`playbook_items` should always be preserved during reset**, but if they're missing or corrupted, reseed them:

### Method 1: Using the Seed Script (Recommended)

Run the seed script which uses the source data from `scripts/seed_playbook_items.ts`:

```bash
npx tsx scripts/seed_playbook_items.ts
```

**Note**: This requires `DATABASE_URL_POOLER` to be set in `.env.local`. If not available, use Method 2.

### Method 2: Using Supabase MCP

If the seed script can't run, use Supabase MCP to execute the SQL directly:

1. Use `mcp_supabase_execute_sql` with the INSERT query containing all 17 playbook items
2. The query uses `ON CONFLICT (code) DO UPDATE` to handle reseeding safely
3. Verify count: Should have exactly 17 items

**Execution**: The playbook items data is defined in `scripts/seed_playbook_items.ts`. Extract the INSERT statement from that file or use the seed script directly.

### Verification

After reseeding, verify:
- `playbook_items` count = 17
- All state codes are present: LC1, LC2, LC3, LC4, RR1, RR2, RR3, BC1, BC2, BC3, SD1, SD2, SD3, STK0, STK1, STK2, STK3

## Verification Checklist

After reset, verify:

- [ ] `accounts` count > 0 (usually 1)
- [ ] `underlyings` count > 0 (usually 9)
- [ ] `underlyings_iv_history` count > 0 (usually 3,000+)
- [ ] `playbook_items` count = 17 (**CRITICAL**: Must be 17, reseed if not)
- [ ] `strategies` count = 0
- [ ] `trades` count = 0
- [ ] `positions` count = 0
- [ ] `blotter_actions` count = 0
- [ ] `triage_records` count = 0
- [ ] `strategy_templates` count = 0 (unless preserved)

## Important Notes

1. **Foreign Key Constraints**: The `CASCADE` option ensures dependent records are also deleted. Order matters - wipe child tables before parent tables where possible.

2. **Playbook Items**: **MUST be preserved** - do NOT truncate `playbook_items`. If they're missing or corrupted after reset, reseed them using `scripts/seed_playbook_items.ts` or via Supabase MCP. The playbook items are essential for strategy state code detection and triage rules.

3. **Accounts**: Must be preserved - they're referenced by many tables and are user configuration.

4. **Underlyings & IV History**: These are reference data that don't change frequently. Preserving them saves time on re-uploading.

5. **Strategy Templates**: Usually wiped, but can be preserved if you want to keep strategy definitions. Update the SQL script accordingly.

## Post-Reset Steps

1. Verify reset completed successfully (use verification checklist)
2. **Check `playbook_items` count** - must be 17. If not, reseed using `scripts/seed_playbook_items.ts`
3. Re-upload Flex data (trades, positions)
4. Verify auto-linking and computation work correctly
5. Test triage and blotter functionality

## Common Issues

### Issue: Foreign key constraint errors
**Solution**: When using Supabase MCP, ensure you're truncating tables in the correct order (child tables first). The MCP tool handles CASCADE automatically.

### Issue: Playbook items count is 0 or not 17
**Solution**: `playbook_items` should be preserved during reset. If they're missing:
1. Run `npx tsx scripts/seed_playbook_items.ts` to reseed
2. Or use Supabase MCP to execute the INSERT statement from the seed script
3. Verify count = 17 after reseeding

### Issue: Accounts missing
**Solution**: Never wipe `accounts` - they're essential for all operations. If accidentally wiped, recreate them via the accounts API.

## Backup Before Reset

Before resetting, consider backing up:
- Current `playbook_items` data (if you've made changes)
- Any custom `strategy_templates` (if you want to preserve them)
- Account configurations (though these are usually stable)

## Related Documentation

- [`db_schema_v1.md`](./db_schema_v1.md) - Complete schema specification
- [`db_setup.md`](./db_setup.md) - Database setup and connection
- [`compute_operations_overview.md`](./compute_operations_overview.md) - How derived data is computed
