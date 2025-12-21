# Automated Flex Ingestion - Testing Guide

This guide covers how to test the automated Flex ingestion implementation.

## Prerequisites

1. **IBKR Flex Web Service Access**
   - IBKR account with Flex Web Service enabled
   - FLEX token (from Account Management → Flex Web Service)
   - At least one Flex query created (Positions or Trades)

2. **Test Data**
   - At least one account in the database
   - Flex query that has data for recent dates

## Testing Steps

### 1. Test Admin UI - Configuration Management

#### 1.1 Add a Flex Query Configuration

1. Navigate to `/admin/ingestion/flex-configs`
2. Click "Add Configuration"
3. Fill in the form:
   - **Account**: Select an account from the dropdown
   - **Query Name**: e.g., "Test Positions Query"
   - **Query Type**: Select "positions" or "trades"
   - **FLEX Token**: Enter your IBKR Flex token
   - **Query ID**: Enter your Flex query ID
   - **Schedule Cron**: Leave empty for now (manual testing)
   - **Active**: Check to enable
4. Click "Create"
5. Verify the configuration appears in the list

#### 1.2 Edit Configuration

1. Click "Edit" on a configuration
2. Modify fields (note: token/query ID won't show existing values for security)
3. Click "Update"
4. Verify changes are saved

#### 1.3 Test Configuration Status

1. Toggle "Active" status via edit
2. Verify inactive configs don't run with "Run All Active"

### 2. Test Manual Ingestion - Single Config

#### 2.1 Via Admin UI

1. Go to `/admin/ingestion/flex-configs`
2. Click "Run Now" on a configuration
3. Wait for completion (button shows "Running..." during execution)
4. Check the result:
   - Success: Alert shows "Ingestion completed successfully!"
   - Failure: Alert shows error message
5. Verify last run status updated:
   - Last run timestamp updated
   - Status shows "success" or "failed"
   - Error message displayed if failed

#### 2.2 Via API Directly

```bash
# Get config ID first
curl http://localhost:3000/api/ingest/flex/automated

# Run specific config
curl -X POST "http://localhost:3000/api/ingest/flex/automated?configId={config-id}"

# Check response
# Should return:
# {
#   "success": true,
#   "summary": { "total": 1, "success": 1, "failures": 0 },
#   "results": [...]
# }
```

### 3. Test Batch Ingestion - All Active Configs

#### 3.1 Via Admin UI

1. Create multiple active configurations
2. Click "Run All Active" button
3. Wait for completion
4. Verify all configs show updated last run status

#### 3.2 Via API

```bash
curl -X POST "http://localhost:3000/api/ingest/flex/automated?all=true"
```

### 4. Test Flex API Client Directly

Create a test script to verify Flex API connectivity:

```typescript
// test-flex-api.ts
import { fetchFlexQuery, validateFlexConfig } from '@/lib/ingestion/flex/api';

async function testFlexApi() {
  const config = {
    flexToken: 'YOUR_FLEX_TOKEN',
    queryId: 'YOUR_QUERY_ID',
    queryType: 'positions' as const,
  };

  // Validate config
  const validation = validateFlexConfig(config);
  console.log('Validation:', validation);

  if (!validation.valid) {
    console.error('Invalid config:', validation.errors);
    return;
  }

  try {
    // Fetch query result
    const result = await fetchFlexQuery(config);
    console.log('Success!');
    console.log('Content-Type:', result.contentType);
    console.log('CSV length:', result.csv.length);
    console.log('First 500 chars:', result.csv.substring(0, 500));
  } catch (error) {
    console.error('Error:', error);
  }
}

testFlexApi();
```

Run with:
```bash
npx tsx test-flex-api.ts
```

### 5. Test Error Scenarios

#### 5.1 Invalid FLEX Token

1. Create config with invalid token
2. Run ingestion
3. Verify error is caught and logged
4. Check `last_run_error` field in database

#### 5.2 Invalid Query ID

1. Create config with invalid query ID
2. Run ingestion
3. Verify error handling

#### 5.3 Missing Configuration

```bash
# Try to run non-existent config
curl -X POST "http://localhost:3000/api/ingest/flex/automated?configId=invalid-id"
# Should return 400 or 404 error
```

#### 5.4 Inactive Configuration

1. Create config with `isActive: false`
2. Try to run it
3. Verify it's skipped when running "all active"

### 6. Test Integration with Existing Ingestion

#### 6.1 Verify Data Ingestion

After running automated ingestion:

1. Check `/admin/processes` page
   - Should see new process record
   - Status should be "completed"
   - Result should show ingestion summary

2. Verify data in database:
   ```sql
   -- Check positions (if positions query)
   SELECT COUNT(*) FROM positions WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days';
   
   -- Check trades (if trades query)
   SELECT COUNT(*) FROM trades WHERE trade_date >= CURRENT_DATE - INTERVAL '7 days';
   ```

3. Verify recompute was triggered:
   ```sql
   -- Check strategy metrics
   SELECT COUNT(*) FROM strategy_metrics_snapshots WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days';
   
   -- Check triage records
   SELECT COUNT(*) FROM triage_records WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days';
   ```

#### 6.2 Compare with Manual Upload

1. Download Flex CSV manually from IBKR
2. Upload via `/admin/ingestion/flex`
3. Run automated ingestion for same query
4. Compare results - should be identical (idempotent)

### 7. Test Process Tracking

1. Run automated ingestion
2. Check `/admin/processes` page
3. Verify:
   - Process type: `flex_automated_ingestion`
   - Trigger: `scheduled`
   - Status: `completed` or `failed`
   - Payload includes config info
   - Result includes summary

### 8. Test API Endpoints

#### 8.1 GET /api/ingest/flex/automated

```bash
# List all configs
curl http://localhost:3000/api/ingest/flex/automated

# List only active
curl "http://localhost:3000/api/ingest/flex/automated?activeOnly=true"
```

#### 8.2 POST /api/admin/flex-configs

```bash
# Create config
curl -X POST http://localhost:3000/api/admin/flex-configs \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "account-uuid",
    "queryName": "Test Query",
    "queryType": "positions",
    "flexToken": "test-token",
    "queryId": "test-query-id",
    "isActive": true
  }'
```

#### 8.3 PUT /api/admin/flex-configs/[id]

```bash
# Update config
curl -X PUT http://localhost:3000/api/admin/flex-configs/{config-id} \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

#### 8.4 DELETE /api/admin/flex-configs/[id]

```bash
# Delete config
curl -X DELETE http://localhost:3000/api/admin/flex-configs/{config-id}
```

## Automated Test Script

Create a comprehensive test script:

```typescript
// scripts/test_flex_automation.ts
import { db } from '@/db';
import { flexQueryConfigs, accounts } from '@/db/schema';
import { fetchFlexQuery } from '@/lib/ingestion/flex/api';

async function runTests() {
  console.log('🧪 Testing Automated Flex Ingestion\n');

  // Test 1: Database schema
  console.log('Test 1: Database schema');
  try {
    const configs = await db.select().from(flexQueryConfigs).limit(1);
    console.log('✅ Schema exists\n');
  } catch (error) {
    console.error('❌ Schema error:', error);
    return;
  }

  // Test 2: API client validation
  console.log('Test 2: API client validation');
  const { validateFlexConfig } = await import('@/lib/ingestion/flex/api');
  const validation = validateFlexConfig({
    flexToken: 'test',
    queryId: 'test',
    queryType: 'positions',
  });
  if (validation.valid) {
    console.log('✅ Validation works\n');
  } else {
    console.error('❌ Validation failed:', validation.errors);
  }

  // Test 3: Check for test configs
  console.log('Test 3: Check configurations');
  const allConfigs = await db.select().from(flexQueryConfigs);
  console.log(`Found ${allConfigs.length} configurations\n`);

  // Test 4: Check accounts
  console.log('Test 4: Check accounts');
  const allAccounts = await db.select().from(accounts);
  console.log(`Found ${allAccounts.length} accounts\n`);

  console.log('✅ All basic tests passed!');
  console.log('\nNext steps:');
  console.log('1. Add a Flex query config via admin UI');
  console.log('2. Test manual run via "Run Now" button');
  console.log('3. Verify data ingestion in database');
}

runTests().catch(console.error);
```

Run with:
```bash
npx tsx scripts/test_flex_automation.ts
```

## Common Issues & Solutions

### Issue: "FLEX_TOKEN and QUERY_ID are required"
**Solution**: Ensure config has both token and query ID set

### Issue: "Flex API returned an error page"
**Solution**: 
- Verify FLEX token is valid and not expired
- Check Query ID is correct
- Ensure Flex query is active in IBKR Client Portal

### Issue: "Empty response from Flex API"
**Solution**: 
- Query may not have data for requested date range
- Check Flex query settings in IBKR

### Issue: Ingestion fails after API call succeeds
**Solution**:
- Check ingestion logs in `/admin/processes`
- Verify CSV format matches expected Flex format
- Check account IDs match between Flex data and database

### Issue: Internal API call fails in automated route
**Solution**:
- Check `NEXT_PUBLIC_APP_URL` or `VERCEL_URL` environment variable
- For local testing, ensure app is running on `localhost:3000`
- For production, ensure base URL is correctly configured

## Testing Checklist

- [ ] Admin UI loads correctly
- [ ] Can create Flex query configuration
- [ ] Can edit configuration
- [ ] Can delete configuration
- [ ] "Run Now" button works for single config
- [ ] "Run All Active" button works
- [ ] Last run status updates correctly
- [ ] Errors are displayed properly
- [ ] API endpoints return correct responses
- [ ] Data is ingested correctly
- [ ] Recompute is triggered automatically
- [ ] Process tracking works
- [ ] Error scenarios are handled gracefully

## Next Steps After Testing

1. **Set up scheduled automation** (see `docs/flex_automation_setup.md`)
2. **Monitor first few automated runs** to ensure stability
3. **Set up alerts** for failed ingestion runs
4. **Document any custom configurations** specific to your setup

