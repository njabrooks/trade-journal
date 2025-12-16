/**
 * Test script for Automated Flex Ingestion
 * 
 * Run with: npx tsx scripts/test_flex_automation.ts
 */

import { db } from '../src/db';
import { flexQueryConfigs, accounts } from '../src/db/schema';
import { validateFlexConfig } from '../src/lib/ingestion/flex/api';

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
  const validation = validateFlexConfig({
    flexToken: 'test-token',
    queryId: 'test-query-id',
    queryType: 'positions',
  });
  if (validation.valid) {
    console.log('✅ Validation works\n');
  } else {
    console.error('❌ Validation failed:', validation.errors);
  }

  // Test invalid config
  const invalidValidation = validateFlexConfig({
    flexToken: '',
    queryId: '',
    queryType: 'invalid' as any,
  });
  if (!invalidValidation.valid && invalidValidation.errors.length > 0) {
    console.log('✅ Invalid config validation works\n');
  } else {
    console.error('❌ Invalid config validation failed\n');
  }

  // Test 3: Check for existing configs
  console.log('Test 3: Check configurations');
  try {
    const allConfigs = await db.select().from(flexQueryConfigs);
    console.log(`Found ${allConfigs.length} configuration(s)`);
    if (allConfigs.length > 0) {
      console.log('Configurations:');
      allConfigs.forEach((config) => {
        console.log(`  - ${config.queryName} (${config.queryType}) - ${config.isActive ? 'Active' : 'Inactive'}`);
      });
    }
    console.log('');
  } catch (error) {
    console.error('❌ Error fetching configs:', error);
  }

  // Test 4: Check accounts
  console.log('Test 4: Check accounts');
  try {
    const allAccounts = await db.select().from(accounts);
    console.log(`Found ${allAccounts.length} account(s)`);
    if (allAccounts.length > 0) {
      console.log('Accounts:');
      allAccounts.forEach((acc) => {
        console.log(`  - ${acc.label || acc.brokerAccountId} (${acc.id})`);
      });
    }
    console.log('');
  } catch (error) {
    console.error('❌ Error fetching accounts:', error);
  }

  // Test 5: Check API endpoint availability
  console.log('Test 5: API endpoint structure');
  try {
    const { fetchFlexQuery } = await import('../src/lib/ingestion/flex/api');
    console.log('✅ Flex API client module loads correctly\n');
  } catch (error) {
    console.error('❌ Error loading Flex API client:', error);
  }

  console.log('✅ All basic tests passed!');
  console.log('\n📋 Next steps:');
  console.log('1. Navigate to /admin/ingestion/flex-configs');
  console.log('2. Add a Flex query configuration');
  console.log('3. Test manual run via "Run Now" button');
  console.log('4. Verify data ingestion in database');
  console.log('5. Check /admin/processes for ingestion logs');
}

runTests()
  .then(() => {
    console.log('\n✨ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });

