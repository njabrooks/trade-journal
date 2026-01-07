/**
 * Test Lifecycle Detection
 *
 * Verifies that lifecycle detection logic works correctly with existing data.
 * Run with: npx tsx scripts/test-lifecycle-detection.ts
 */

import { db, closeDb, schema } from './lib/db.js';
const { macroTheses, assetTheses, claimThesisMappings, thesisArticulations, validationPoints, thesisMonitoringConfigs } = schema;
import { eq, and, sql, count } from 'drizzle-orm';

async function main() {
  console.log('='.repeat(60));
  console.log('LIFECYCLE DETECTION TEST');
  console.log('='.repeat(60));

  // 1. Check current lifecycle status distribution
  console.log('\n📊 Current Lifecycle Status Distribution:\n');

  const macroStatusCounts = await db
    .select({
      status: macroTheses.lifecycleStatus,
      count: count(),
    })
    .from(macroTheses)
    .groupBy(macroTheses.lifecycleStatus);

  console.log('Macro Theses:');
  for (const row of macroStatusCounts) {
    console.log(`  ${row.status || 'null'}: ${row.count}`);
  }

  const assetStatusCounts = await db
    .select({
      status: assetTheses.lifecycleStatus,
      count: count(),
    })
    .from(assetTheses)
    .groupBy(assetTheses.lifecycleStatus);

  console.log('\nAsset Theses:');
  for (const row of assetStatusCounts) {
    console.log(`  ${row.status || 'null'}: ${row.count}`);
  }

  // 2. Check which theses might need transitions
  console.log('\n🔄 Checking Potential Transitions:\n');

  // Find theses in 'created' status with linked claims
  const createdMacroWithClaims = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      claimCount: count(claimThesisMappings.id),
    })
    .from(macroTheses)
    .leftJoin(claimThesisMappings, eq(claimThesisMappings.macroThesisId, macroTheses.id))
    .where(
      sql`${macroTheses.lifecycleStatus} = 'created' OR ${macroTheses.lifecycleStatus} IS NULL`
    )
    .groupBy(macroTheses.id, macroTheses.title)
    .having(sql`count(${claimThesisMappings.id}) >= 3`);

  if (createdMacroWithClaims.length > 0) {
    console.log(`Macro theses in 'created' with 3+ claims (ready for 'claims_linked'):`);
    for (const t of createdMacroWithClaims) {
      console.log(`  - "${t.title}" (${t.claimCount} claims)`);
    }
  } else {
    console.log('✓ No macro theses in "created" status need transition to "claims_linked"');
  }

  // Find theses in 'claims_linked' with articulations
  const claimsLinkedWithArticulation = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
    })
    .from(macroTheses)
    .where(eq(macroTheses.lifecycleStatus, 'claims_linked'))
    .innerJoin(
      thesisArticulations,
      and(
        eq(thesisArticulations.thesisId, macroTheses.id),
        eq(thesisArticulations.thesisType, 'macro')
      )
    );

  if (claimsLinkedWithArticulation.length > 0) {
    console.log(`\nMacro theses in 'claims_linked' with articulations (ready for 'synthesized'):`);
    for (const t of claimsLinkedWithArticulation) {
      console.log(`  - "${t.title}"`);
    }
  } else {
    console.log('\n✓ No macro theses in "claims_linked" status need transition to "synthesized"');
  }

  // Find theses in 'synthesized' with validation points
  const synthesizedWithVPs = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
    })
    .from(macroTheses)
    .where(eq(macroTheses.lifecycleStatus, 'synthesized'))
    .innerJoin(
      validationPoints,
      and(
        eq(validationPoints.thesisId, macroTheses.id),
        eq(validationPoints.thesisType, 'macro')
      )
    );

  if (synthesizedWithVPs.length > 0) {
    console.log(`\nMacro theses in 'synthesized' with V&I points (ready for 'validated'):`);
    for (const t of synthesizedWithVPs) {
      console.log(`  - "${t.title}"`);
    }
  } else {
    console.log('\n✓ No macro theses in "synthesized" status need transition to "validated"');
  }

  // 3. Show sample data for verification
  console.log('\n📋 Sample Thesis Data:\n');

  const sampleTheses = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      status: macroTheses.status,
      lifecycleStatus: macroTheses.lifecycleStatus,
    })
    .from(macroTheses)
    .limit(5);

  console.log('Sample Macro Theses:');
  for (const t of sampleTheses) {
    console.log(`  - ${t.title}`);
    console.log(`    Status: ${t.status}, Lifecycle: ${t.lifecycleStatus}`);
  }

  // 4. Check claim-thesis mappings
  console.log('\n🔗 Claim-Thesis Mapping Stats:\n');

  const mappingStats = await db
    .select({
      total: count(),
    })
    .from(claimThesisMappings);

  console.log(`Total claim-thesis mappings: ${mappingStats[0]?.total || 0}`);

  const macroMappings = await db
    .select({
      count: count(),
    })
    .from(claimThesisMappings)
    .where(sql`${claimThesisMappings.macroThesisId} IS NOT NULL`);

  const assetMappings = await db
    .select({
      count: count(),
    })
    .from(claimThesisMappings)
    .where(sql`${claimThesisMappings.assetThesisId} IS NOT NULL`);

  console.log(`  Mappings to macro theses: ${macroMappings[0]?.count || 0}`);
  console.log(`  Mappings to asset theses: ${assetMappings[0]?.count || 0}`);

  // 5. Check articulations and validation points
  console.log('\n📝 Articulations & Validation Points:\n');

  const articulationCount = await db
    .select({ count: count() })
    .from(thesisArticulations);
  console.log(`Total articulations: ${articulationCount[0]?.count || 0}`);

  const vpCount = await db
    .select({ count: count() })
    .from(validationPoints);
  console.log(`Total validation points: ${vpCount[0]?.count || 0}`);

  const monitoringCount = await db
    .select({ count: count() })
    .from(thesisMonitoringConfigs)
    .where(eq(thesisMonitoringConfigs.enabled, true));
  console.log(`Active monitoring configs: ${monitoringCount[0]?.count || 0}`);

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
