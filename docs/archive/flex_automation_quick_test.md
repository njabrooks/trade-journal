# Quick Test Guide - Automated Flex Ingestion

## Quick Start (5 minutes)

### 1. Run Basic Tests

```bash
# Install tsx if needed
npm install -D tsx

# Run test script
npx tsx scripts/test_flex_automation.ts
```

This verifies:
- ✅ Database schema exists
- ✅ API client loads correctly
- ✅ Existing configurations and accounts

### 2. Test via Admin UI

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Navigate to admin page:**
   ```
   http://localhost:3000/admin/ingestion/flex-configs
   ```

3. **Add a test configuration:**
   - Click "Add Configuration"
   - Fill in:
     - Account: Select an account
     - Query Name: "Test Positions"
     - Query Type: "positions"
     - FLEX Token: Your IBKR Flex token
     - Query ID: Your Flex query ID
   - Click "Create"

4. **Test manual run:**
   - Click "Run Now" on your config
   - Wait for completion
   - Check for success/error message
   - Verify "Last run" status updated

### 3. Test via API

```bash
# List all configs
curl http://localhost:3000/api/ingest/flex/automated

# Run specific config (replace {config-id} with actual ID)
curl -X POST "http://localhost:3000/api/ingest/flex/automated?configId={config-id}"

# Run all active configs
curl -X POST "http://localhost:3000/api/ingest/flex/automated?all=true"
```

### 4. Verify Results

1. **Check process tracking:**
   - Go to `/admin/processes`
   - Look for `flex_automated_ingestion` process
   - Verify status and results

2. **Check data ingestion:**
   - Verify positions/trades were inserted
   - Check that recompute was triggered
   - Verify strategy metrics and triage records

## Common Test Scenarios

### Test Success Path
1. Create config with valid token and query ID
2. Run ingestion
3. Verify data appears in database
4. Check process shows "completed"

### Test Error Handling
1. Create config with invalid token
2. Run ingestion
3. Verify error is caught and displayed
4. Check `last_run_error` field

### Test Inactive Config
1. Create config with `isActive: false`
2. Click "Run All Active"
3. Verify inactive config is skipped

## Troubleshooting

**"Schema error"**
- Run database migrations
- Check Supabase connection

**"Validation failed"**
- Ensure all required fields are provided
- Check query type is "positions" or "trades"

**"Flex API error"**
- Verify FLEX token is valid
- Check Query ID is correct
- Ensure Flex query is active in IBKR

**"Ingestion failed"**
- Check `/admin/processes` for detailed error
- Verify CSV format matches expected Flex format
- Check account IDs match

## Next Steps

Once basic tests pass:
1. Set up scheduled automation (see `flex_automation_setup.md`)
2. Monitor first few automated runs
3. Set up error alerts

