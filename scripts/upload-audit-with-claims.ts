#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';

// Load environment variables FIRST before any other imports
dotenv.config({ path: '.env.local' });

// Now dynamically import db after env is loaded
async function main() {
  const { db } = await import('../src/db/index.js');
  const { researchArtifacts, researchInsights } = await import('../src/db/schema.js');
  const { parseClaimsMarkdown } = await import('../src/lib/research/parseClaimsMarkdown.js');

  // Read transcript file
  const transcriptPath = 'research-workspace/1-transcripts/2025-12-21-apps-to-agents.md';
  const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');

  // Read audit file
  const auditPath = 'research-workspace/2-audits/2025-12-21-apps-to-agents-audit.md';
  const auditContent = await fs.readFile(auditPath, 'utf-8');

  // Parse claims structure from markdown to JSON
  console.log('Parsing claims structure from markdown...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`✅ Parsed ${claimsStructure.main_claims.length} main claims, ${claimsStructure.evidence_claims.length} evidence claims`);

  console.log('Creating research artifact...');

  // Create artifact
  const [artifact] = await db.insert(researchArtifacts).values({
    title: 'From Apps to Agents: Why 2026 Is the Real AI Inflection Point',
    sourceType: 'transcript',
    author: 'YouTube',
    publishedDate: '2025-12-21', // Date string, not Date object
    sourceUrl: 'https://www.youtube.com/watch?v=0Hcw9toVRNg',
    rawContent: transcriptContent,
    contentFormat: 'markdown',
    tags: ['AI agents', '2026 inflection', 'enterprise adoption', 'CSCO', 'MU', 'NVDA', 'TSLA', 'BTC', 'infrastructure', 'labor deflation', 'multimodality', 'compute demand'],
    status: 'raw',
    ingestedAt: new Date(),
  }).returning();

  console.log('✅ Artifact created:', artifact.id);

  console.log('Creating research insight with claims structure...');

  // Create insight with claims_structure
  const [insight] = await db.insert(researchInsights).values({
    researchArtifactId: artifact.id,
    summary: 'Comprehensive forensic audit extracting 78 investment claims (18 main thesis/view candidates, 60 evidence claims) analyzing the 2026 AI inflection point transition from apps to agents, covering enterprise adoption, infrastructure buildout, labor deflation, and compute demand dynamics.',
    keyThemes: ['AI agents', 'enterprise inflection', 'VLM infrastructure', 'compute demand', 'labor deflation', 'multimodality', 'Cisco/Micron infrastructure', 'small cap rotation', 'knowledge worker displacement'],
    timeHorizon: 'medium_term',
    confidenceLevel: 'high',
    relevantTickers: ['CSCO', 'MU', 'NVDA', 'TSLA', 'BTC', 'ORCL', 'GOOGL', 'MSFT', 'META', 'AMD', 'IWM'],
    claimsStructure: claimsStructure, // JSON structure with placeholder
    structuredBy: 'ai', // Valid enum: 'ai' | 'manual' | 'hybrid'
    aiModel: 'process-transcript', // Store skill name in aiModel field
    structuredAt: new Date(), // Use current timestamp
  }).returning();

  console.log('✅ Insight created:', insight.id);

  // Update artifact status
  await db.update(researchArtifacts)
    .set({ status: 'structured', updatedAt: new Date() })
    .where({ id: artifact.id });

  console.log('✅ Artifact status updated to "structured"');

  // Auto-promote claims to main_claims table
  const { autoPromoteAuditClaims } = await import('../src/db/queries/research.js');
  console.log('\n🚀 Promoting claims to main_claims table...');
  const promotedCount = await autoPromoteAuditClaims(insight.id);
  console.log(`✅ Promoted ${promotedCount} claims`);

  console.log('\n📊 Upload Summary:');
  console.log('─'.repeat(60));
  console.log(`Artifact ID: ${artifact.id}`);
  console.log(`Insight ID:  ${insight.id}`);
  console.log(`Title:       ${artifact.title}`);
  console.log(`Claims:      ${claimsStructure.main_claims.length} main, ${claimsStructure.evidence_claims.length} evidence (${claimsStructure.main_claims.length + claimsStructure.evidence_claims.length} total)`);
  console.log(`Promoted:    ${promotedCount} claims to main_claims table`);
  console.log(`Tickers:     ${insight.relevantTickers?.join(', ')}`);
  console.log('\n✅ Ready to browse in app at:');
  console.log(`   http://localhost:3000/research/${artifact.id}`);
}

main().catch(console.error);
