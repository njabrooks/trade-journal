/**
 * Upload coal contrarian case audit with claims structure to database
 *
 * Steps:
 * 1. Upload original transcript as research_artifact
 * 2. Parse audit and upload as research_insight with claims_structure
 * 3. Auto-promote main claims to main_claims table
 */

import { db, closeDb, schema } from './lib/db.js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const { researchArtifacts, researchInsights, mainClaims } = schema;

const TRANSCRIPT_FILE = 'research-workspace/transcripts-audits/20260203-coal-contrarian-case.md';
const AUDIT_FILE = 'research-workspace/transcripts-audits/20260203-coal-contrarian-case-audit.md';

async function main() {
  // Step 1: Upload transcript as artifact
  console.log('📄 Uploading transcript as artifact...');
  const transcriptContent = readFileSync(TRANSCRIPT_FILE, 'utf-8');

  const artifactId = randomUUID();
  await db.insert(researchArtifacts).values({
    id: artifactId,
    title: 'Beautiful Clean Coal - The Contrarian Case for Coal in the Energy Transition',
    sourceType: 'report',
    sourceUrl: '',
    author: 'Lekker Insights (@qthomp)',
    publishedDate: '2026-02-03',
    rawContent: transcriptContent,
    contentFormat: 'markdown',
    tags: ['coal', 'natural gas', 'steel', 'met coal', 'thermal coal', 'energy transition', 'HCC', 'AMR', 'METC', 'BTU', 'ARLP', 'CNR', 'HNRG', 'SXC', 'NRP', 'data centers', 'LNG'],
    status: 'structured',
    ingestedAt: new Date(),
  });
  console.log(`   ✅ Artifact created: ${artifactId}`);

  // Step 2: Parse audit and upload as insight
  console.log('\n📖 Reading audit file...');
  let auditContent = readFileSync(AUDIT_FILE, 'utf-8');

  console.log('🔍 Parsing claims structure...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`   Found ${claimsStructure.main_claims.length} main claims`);
  console.log(`   Found ${claimsStructure.evidence_claims.length} evidence claims`);

  const insightId = randomUUID();

  console.log('\n📊 Uploading insight with claims_structure...');

  await db.insert(researchInsights).values({
    id: insightId,
    researchArtifactId: artifactId,
    summary: 'Lekker Insights presents the contrarian investment case for coal equities over a 12-24 month horizon. Key thesis: LNG export growth has structurally lifted natural gas prices above coal competitiveness thresholds, met coal has no substitute in blast furnace steelmaking (70% of global steel), ESG exclusions have created a valuation discount (4.1x EV/EBITDA), and Trump regulatory rollbacks extend coal plant lives through 2029. Top picks: HCC and AMR for met coal/steel exposure, ARLP for thermal/yield.',
    keyThemes: ['coal equities', 'natural gas structural shift', 'LNG exports', 'met coal', 'steel demand', 'ESG valuation discount', 'regulatory rollbacks', 'data center power demand', 'India steel growth', 'supply constraints'],
    claimsStructure: claimsStructure,
    relevantTickers: ['HCC', 'AMR', 'METC', 'BTU', 'ARLP', 'CNR', 'HNRG', 'SXC', 'NRP', 'NC'],
    timeHorizon: 'medium_term',
    confidenceLevel: 'medium',
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
      relevantTickers: claim.tickers.length > 0 && claim.tickers[0] !== '-' ? claim.tickers : null,
      timeHorizon: claim.time_horizon,
      qualifier: claim.qualifier,
      evidence: claim.evidence.length > 0 ? claim.evidence : null,
      reasoning: claim.reasoning || null,
      backing: claim.backing || null,
      rebuttal: claim.rebuttal.length > 0 ? claim.rebuttal : null,
      status: 'draft',
    });

    console.log(`   ✅ ${claim.id}: ${claim.title.substring(0, 60)}...`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Upload complete!');
  console.log('='.repeat(60));
  console.log(`\n   Artifact ID: ${artifactId}`);
  console.log(`   Insight ID:  ${insightId}`);
  console.log(`   Main Claims: ${claimsStructure.main_claims.length} promoted to main_claims table`);
  console.log(`   Evidence Claims: ${claimsStructure.evidence_claims.length} stored in claims_structure JSONB`);
  console.log(`\n→ View in app: /research/${insightId}`);
  console.log('→ Browse claims: /claims');

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
