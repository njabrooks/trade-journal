/**
 * Upload Galaxy Digital Strong Buy (Rittenhouse Research) audit to database
 *
 * Creates:
 * 1. Research artifact (the original report)
 * 2. Research insight with claims_structure (the audit)
 * 3. Auto-promotes main claims to main_claims table
 */

import { db, closeDb, schema } from './lib/db.js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const { researchArtifacts, researchInsights, mainClaims } = schema;

const AUDIT_FILE = '/Users/njb/Desktop/nick/investing/20250515-Galaxy-Digital-Strong-Buy-audit.md';
const ORIGINAL_FILE = '/Users/njb/Desktop/nick/investing/20250515-Galaxy-Digital-Strong-Buy.md';

async function main() {
  // Read original report content
  console.log('📖 Reading original report...');
  const originalContent = readFileSync(ORIGINAL_FILE, 'utf-8');

  // Read audit file
  console.log('📖 Reading audit file...');
  const auditContent = readFileSync(AUDIT_FILE, 'utf-8');

  console.log('🔍 Parsing claims structure...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`   Found ${claimsStructure.main_claims.length} main claims`);
  console.log(`   Found ${claimsStructure.evidence_claims.length} evidence claims`);

  // Generate IDs
  const artifactId = randomUUID();
  const insightId = randomUUID();

  // Step 1: Create artifact
  console.log('\n📊 Creating research artifact...');
  await db.insert(researchArtifacts).values({
    id: artifactId,
    title: 'Galaxy Digital – Strong Buy (Rittenhouse Research)',
    sourceType: 'report',
    sourceUrl: null,
    author: 'Rittenhouse Research',
    publishedDate: '2025-05-15',
    rawContent: originalContent,
    contentFormat: 'markdown',
    tags: ['AI infrastructure', 'data centers', 'power scarcity', 'Bitcoin mining pivot', 'GLXY', 'BRPHF', 'CORZ', 'WULF', 'DLR', 'NVDA', 'CRWV', 'META'],
    status: 'structured', // Already processed
    ingestedAt: new Date(),
  });
  console.log(`   ✅ Artifact created: ${artifactId}`);

  // Step 2: Create insight with claims_structure
  console.log('\n📊 Creating research insight with claims_structure...');
  await db.insert(researchInsights).values({
    id: insightId,
    researchArtifactId: artifactId,
    summary: 'Galaxy Digital is significantly undervalued as an AI data center platform. Helios campus (2.5GW potential) positions Galaxy to capitalize on power scarcity constraining hyperscalers. CoreWeave lease demonstrates superior economics ($1.8MM/MW, 90% margin) vs competitors. Nasdaq uplisting (May 16, 2025) is near-term catalyst. Strong buy with potential $32B+ equity value.',
    keyThemes: ['AI infrastructure power scarcity', 'Bitcoin mining to AI pivot', 'Data center valuation arbitrage', 'CoreWeave credit risk', 'Large centralized data centers', 'Nasdaq uplisting catalyst'],
    claimsStructure: claimsStructure,
    relevantTickers: ['GLXY', 'BRPHF', 'CORZ', 'WULF', 'DLR', 'EQIX', 'META', 'NVDA', 'CRWV'],
    timeHorizon: 'medium_term',
    confidenceLevel: 'high',
    structuredBy: 'ai',
    aiModel: 'process-transcript',
    structuredAt: new Date(),
  });
  console.log(`   ✅ Insight created: ${insightId}`);

  // Step 3: Auto-promote main claims
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
      relevantTickers: claim.tickers.length > 0 ? claim.tickers : null,
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
  console.log(`\n   Artifact ID: ${artifactId}`);
  console.log(`   Insight ID:  ${insightId}`);
  console.log(`   Main Claims: ${claimsStructure.main_claims.length}`);
  console.log(`   Evidence Claims: ${claimsStructure.evidence_claims.length}`);
  console.log(`\n→ View in app: /research/${insightId}`);
  console.log('→ Browse claims: /claims');

  await closeDb();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Error:', e);
  await closeDb();
  process.exit(1);
});
