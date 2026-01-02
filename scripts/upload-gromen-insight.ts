/**
 * Upload Gromen insight with claims structure to database
 *
 * This script demonstrates the correct pattern for scripts that need database access:
 * 1. Import from scripts/lib/db.js (handles dotenv loading automatically)
 * 2. Use db and schema from the helper
 * 3. Call closeDb() before exiting
 */

import { db, closeDb, schema } from './lib/db.js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const { researchInsights, mainClaims } = schema;

const AUDIT_FILE = '/Users/njb/Desktop/nick/investing/2026-01-02-after-the-dollar-luke-gromen-audit.md';
const ARTIFACT_ID = 'd32ee6a3-fecf-4c97-b6ef-db2e50c203e5';

async function main() {

  console.log('📖 Reading audit file...');
  const auditContent = readFileSync(AUDIT_FILE, 'utf-8');

  console.log('🔍 Parsing claims structure...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`   Found ${claimsStructure.main_claims.length} main claims`);
  console.log(`   Found ${claimsStructure.evidence_claims.length} evidence claims`);

  const insightId = randomUUID();

  console.log('\n📊 Uploading insight with claims_structure...');

  await db.insert(researchInsights).values({
    id: insightId,
    researchArtifactId: ARTIFACT_ID,
    summary: 'Luke Gromen and Balaji discuss dollar hegemony decline, BRICS dedollarization, gold repricing, and the structural challenges facing US fiscal and monetary policy. Key themes include the Fed put, PPP GDP analysis, China supply chain dependencies, and potential currency reset scenarios.',
    keyThemes: ['dollar hegemony', 'dedollarization', 'BRICS', 'gold repricing', 'Fed put', 'PPP GDP', 'supply chains', 'financial repression', 'currency reset'],
    claimsStructure: claimsStructure,
    relevantTickers: ['GLD', 'BTC'],
    timeHorizon: 'long_term',
    confidenceLevel: 'high',
    structuredBy: 'ai',
    aiModel: 'process-transcript',
    structuredAt: new Date(),
  });

  console.log(`   ✅ Insight created: ${insightId}`);

  console.log('\n🚀 Auto-promoting main claims...');

  for (const claim of claimsStructure.main_claims) {
    const claimId = randomUUID();

    await db.insert(mainClaims).values({
      id: claimId,
      sourceInsightId: insightId,
      sourceClaimId: claim.id,
      title: claim.title,
      claim: claim.claim,
      category: claim.category,
      relevantTickers: claim.tickers.length > 0 && claim.tickers[0] !== '-' ? claim.tickers : null,
      timeHorizon: claim.time_horizon,
      qualifier: claim.qualifier,
      evidence: claim.evidence.length > 0 ? claim.evidence : null,
      reasoning: claim.reasoning || null,
      backing: claim.backing || null,
      rebuttal: claim.rebuttal.length > 0 ? claim.rebuttal : null,
      status: 'unconfirmed',
    });

    console.log(`   ✅ ${claim.id}: ${claim.title.substring(0, 50)}...`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Upload complete!');
  console.log('='.repeat(60));
  console.log(`\n   Artifact ID: ${ARTIFACT_ID}`);
  console.log(`   Insight ID:  ${insightId}`);
  console.log(`\n→ View in app: /research/${insightId}`);
  console.log('→ Browse claims: /claims');

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
