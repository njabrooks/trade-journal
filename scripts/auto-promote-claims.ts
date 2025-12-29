#!/usr/bin/env tsx

import { autoPromoteAuditClaims } from '../src/db/queries/research';

/**
 * Auto-promote all claims from a research insight's audit to the main_claims table
 *
 * Usage:
 *   npx tsx scripts/auto-promote-claims.ts <insight_id>
 */

async function main() {
  const insightId = process.argv[2];

  if (!insightId) {
    console.error('❌ Error: insight_id is required');
    console.error('\nUsage:');
    console.error('  npx tsx scripts/auto-promote-claims.ts <insight_id>');
    process.exit(1);
  }

  try {
    console.log(`🔄 Auto-promoting claims from insight: ${insightId}...`);

    const promotedCount = await autoPromoteAuditClaims(insightId);

    if (promotedCount === 0) {
      console.log('ℹ️  No new claims to promote (may already be promoted or no claims_structure found)');
    } else {
      console.log(`✅ Successfully auto-promoted ${promotedCount} claims to main_claims table`);
      console.log(`   Status: unconfirmed (ready for manual review and confirmation)`);
      console.log(`\n→ View claims at: /research/claims`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error auto-promoting claims:', error);
    process.exit(1);
  }
}

main();
