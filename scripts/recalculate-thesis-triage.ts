/**
 * Recalculate Thesis Triage Records
 *
 * This script:
 * 1. Deletes pending lifecycle triage records (NEEDS_RESEARCH, PRODUCE_CORE_ARGUMENT, UPDATE_CORE_ARGUMENT)
 * 2. Re-runs computeThesisTriageForAll to regenerate with correct rules and statuses
 *
 * Run with: npx tsx scripts/recalculate-thesis-triage.ts
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { computeThesisTriageForAll } from '../src/lib/derived/thesisTriage.js';

const { thesisTriageRecords } = schema;

async function main() {
  console.log('=== Recalculate Thesis Triage Records ===\n');

  // Lifecycle rules to delete and recalculate
  const lifecycleRules = [
    // New UPPER_SNAKE_CASE rules
    'NEEDS_RESEARCH',
    'PRODUCE_CORE_ARGUMENT',
    'UPDATE_CORE_ARGUMENT',
    // Legacy snake_case rules
    'thesis_needs_articulation',
    'thesis_new_claims_available',
  ];

  // Step 1: Count existing records
  const existingRecords = await db
    .select()
    .from(thesisTriageRecords)
    .where(
      and(
        inArray(thesisTriageRecords.triageRule, lifecycleRules),
        ne(thesisTriageRecords.status, 'complete'),
        ne(thesisTriageRecords.status, 'dismissed'),
        ne(thesisTriageRecords.status, 'actioned')
      )
    );

  console.log(`Found ${existingRecords.length} pending lifecycle triage records to recalculate`);

  if (existingRecords.length > 0) {
    // Show breakdown by rule
    const byRule = existingRecords.reduce((acc, r) => {
      const rule = r.triageRule ?? 'unknown';
      acc[rule] = (acc[rule] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\nBreakdown by triage rule:');
    for (const [rule, count] of Object.entries(byRule)) {
      console.log(`  - ${rule}: ${count}`);
    }

    // Step 2: Delete existing pending lifecycle records
    console.log('\nDeleting existing pending lifecycle records...');
    const deleteResult = await db
      .delete(thesisTriageRecords)
      .where(
        and(
          inArray(thesisTriageRecords.triageRule, lifecycleRules),
          ne(thesisTriageRecords.status, 'complete'),
          ne(thesisTriageRecords.status, 'dismissed'),
          ne(thesisTriageRecords.status, 'actioned')
        )
      );

    console.log(`Deleted ${existingRecords.length} records`);
  }

  // Step 3: Recalculate all thesis triage
  console.log('\nRecalculating thesis triage for all active theses...');
  const results = await computeThesisTriageForAll();

  // Summary
  console.log('\n=== Results ===');
  console.log(`Macro theses processed: ${results.macro.length}`);
  console.log(`Asset theses processed: ${results.asset.length}`);

  // Count new triage records created
  const macroCreated = results.macro.filter(r => r.triageCreated).length;
  const assetCreated = results.asset.filter(r => r.triageCreated).length;

  console.log(`\nNew triage records created:`);
  console.log(`  - Macro theses: ${macroCreated}`);
  console.log(`  - Asset theses: ${assetCreated}`);

  // Show breakdown by rule
  const allCreated = [...results.macro, ...results.asset].filter(r => r.triageCreated);
  const createdByRule = allCreated.reduce((acc, r) => {
    const rule = r.triageCreated!;
    acc[rule] = (acc[rule] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (Object.keys(createdByRule).length > 0) {
    console.log('\nBreakdown of new records by rule:');
    for (const [rule, count] of Object.entries(createdByRule)) {
      console.log(`  - ${rule}: ${count}`);
    }
  }

  // Verify the results
  console.log('\n=== Verification ===');
  const newRecords = await db
    .select({
      triageRule: thesisTriageRecords.triageRule,
      status: thesisTriageRecords.status,
    })
    .from(thesisTriageRecords)
    .where(
      and(
        inArray(thesisTriageRecords.triageRule, ['NEEDS_RESEARCH', 'PRODUCE_CORE_ARGUMENT', 'UPDATE_CORE_ARGUMENT']),
        ne(thesisTriageRecords.status, 'complete'),
        ne(thesisTriageRecords.status, 'dismissed')
      )
    );

  const verifyByRule = newRecords.reduce((acc, r) => {
    const key = `${r.triageRule} (${r.status})`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Current pending lifecycle records by rule and status:');
  for (const [key, count] of Object.entries(verifyByRule)) {
    console.log(`  - ${key}: ${count}`);
  }

  await closeDb();
  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
