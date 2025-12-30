#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config({ path: '.env.local' });

async function main() {
  const { autoPromoteAuditClaims } = await import('../src/db/queries/research.js');

  const insightIds = [
    'db40dd2e-8028-419f-907e-233a88c97450', // First audit
    '57a1f636-610e-4a03-a469-e028685f4337', // Second audit
  ];

  for (const insightId of insightIds) {
    console.log(`\nPromoting claims for insight: ${insightId}`);
    const promotedCount = await autoPromoteAuditClaims(insightId);
    console.log(`✅ Promoted ${promotedCount} claims to main_claims table`);
  }

  console.log('\n✅ All claims promoted successfully!');
}

main().catch(console.error);
