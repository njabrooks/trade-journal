/**
 * Upload Milk Road AI "How To Invest Across The Full AI Stack" audit
 *
 * Creates:
 * 1. Research artifact from transcript
 * 2. Research insight with claims_structure
 * 3. Auto-promoted main claims
 */

import { db, closeDb, schema } from './lib/db.js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const { researchArtifacts, researchInsights, mainClaims } = schema;

const AUDIT_FILE = '/Users/njb/Desktop/nick/investing/20251114-How-To-Invest-Across-The-Full-AI-Stack-audit.md';
const TRANSCRIPT_FILE = '/Users/njb/Desktop/nick/investing/20251114-How-To-Invest-Across-The-Full-AI-Stack.md';

async function main() {
  const artifactId = randomUUID();
  const insightId = randomUUID();

  // Step 1: Read transcript and create artifact
  console.log('📖 Reading transcript file...');
  const transcriptContent = readFileSync(TRANSCRIPT_FILE, 'utf-8');

  console.log('\n📦 Creating research artifact...');
  await db.insert(researchArtifacts).values({
    id: artifactId,
    title: 'Why We Are NOT In An AI Bubble & How To Invest Across The Full AI Stack',
    sourceType: 'transcript',
    author: 'Milk Road AI',
    publishedDate: '2025-11-14',
    rawContent: transcriptContent,
    contentFormat: 'markdown',
    sourceUrl: 'https://www.youtube.com/watch?v=cqukvAdqlAY',
    tags: ['AI infrastructure', 'AI bubble', 'AI robotics', 'semiconductors', 'data centers', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'GLXY', 'inference chips', 'GPU depreciation'],
    status: 'structured',
  });
  console.log(`   ✅ Artifact created: ${artifactId}`);

  // Step 2: Read audit and parse claims
  console.log('\n📖 Reading audit file...');
  const auditContent = readFileSync(AUDIT_FILE, 'utf-8');

  console.log('🔍 Parsing claims structure...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`   Found ${claimsStructure.main_claims.length} main claims`);
  console.log(`   Found ${claimsStructure.evidence_claims.length} evidence claims`);

  // Step 3: Create insight with claims_structure
  console.log('\n📊 Uploading insight with claims_structure...');
  await db.insert(researchInsights).values({
    id: insightId,
    researchArtifactId: artifactId,
    summary: 'Milk Road AI podcast discussing AI investment thesis: why AI is not in a bubble (2-3 year demand runway), the investable stack (chips, hyperscalers, data centers, models, apps, robotics), key themes including NVIDIA dominance, model commoditization, data center landlord opportunity, and emerging inference chip thesis.',
    keyThemes: [
      'AI infrastructure buildout',
      'no AI bubble',
      'AI robotics',
      'NVIDIA picks-and-shovels',
      'model commoditization',
      'data center landlords',
      'specialized inference chips',
      'GPU depreciation',
      'Jevons paradox',
      'enterprise AI adoption'
    ],
    claimsStructure: claimsStructure,
    relevantTickers: ['NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'GLXY', 'AMD', 'INTC', 'AVGO'],
    timeHorizon: 'medium_term',
    confidenceLevel: 'high',
    structuredBy: 'ai',
    aiModel: 'process-transcript',
    structuredAt: new Date(),
  });
  console.log(`   ✅ Insight created: ${insightId}`);

  // Step 4: Auto-promote main claims
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
      relevantTickers: claim.tickers.length > 0 && claim.tickers[0] !== '' ? claim.tickers : null,
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

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
