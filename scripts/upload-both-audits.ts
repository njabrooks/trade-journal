#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';

// Load environment variables FIRST before any other imports
dotenv.config({ path: '.env.local' });

async function uploadAudit(transcriptPath: string, auditPath: string, title: string, sourceUrl: string, tags: string[]) {
  const { db } = await import('../src/db/index.js');
  const { researchArtifacts, researchInsights } = await import('../src/db/schema.js');
  const { parseClaimsMarkdown } = await import('../src/lib/research/parseClaimsMarkdown.js');
  const { autoPromoteAuditClaims } = await import('../src/db/queries/research.js');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Uploading: ${title}`);
  console.log('='.repeat(80));

  // Read files
  const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
  const auditContent = await fs.readFile(auditPath, 'utf-8');

  // Parse claims structure
  console.log('📋 Parsing claims structure from markdown...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`   ✅ Parsed ${claimsStructure.main_claims.length} main claims, ${claimsStructure.evidence_claims.length} evidence claims`);

  // Extract summary and themes from audit frontmatter
  const frontmatterMatch = auditContent.match(/---\n([\s\S]*?)\n---/);
  let summary = '';
  let themes: string[] = [];
  let tickers: string[] = [];

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const summaryMatch = frontmatter.match(/summary:\s*(.+)/);
    if (summaryMatch) summary = summaryMatch[1].trim();

    const themesMatch = frontmatter.match(/key_themes:\s*\[(.+)\]/);
    if (themesMatch) {
      themes = themesMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
    }

    const tickersMatch = frontmatter.match(/relevant_tickers:\s*\[(.+)\]/);
    if (tickersMatch) {
      tickers = tickersMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
    }
  }

  console.log('📄 Creating research artifact...');
  const [artifact] = await db.insert(researchArtifacts).values({
    title,
    sourceType: 'transcript',
    author: 'YouTube',
    publishedDate: auditPath.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().split('T')[0],
    sourceUrl,
    rawContent: transcriptContent,
    contentFormat: 'markdown',
    tags: [...themes, ...tickers],
    status: 'raw',
    ingestedAt: new Date(),
  }).returning();
  console.log(`   ✅ Artifact created: ${artifact.id}`);

  console.log('🔬 Creating research insight with claims structure...');
  const [insight] = await db.insert(researchInsights).values({
    researchArtifactId: artifact.id,
    summary: summary || 'Forensic audit with Toulmin claims extraction',
    keyThemes: themes,
    timeHorizon: 'medium_term',
    confidenceLevel: 'high',
    relevantTickers: tickers,
    claimsStructure: claimsStructure,
    structuredBy: 'ai',
    aiModel: 'process-transcript',
    structuredAt: new Date(),
  }).returning();
  console.log(`   ✅ Insight created: ${insight.id}`);

  // Update artifact status
  await db.update(researchArtifacts)
    .set({ status: 'structured', updatedAt: new Date() })
    .where({ id: artifact.id });
  console.log('   ✅ Artifact status updated to "structured"');

  // Auto-promote claims to main_claims table
  console.log('🚀 Promoting claims to main_claims table...');
  const promotedCount = await autoPromoteAuditClaims(insight.id);
  console.log(`   ✅ Promoted ${promotedCount} claims`);

  console.log('\n📊 Upload Summary:');
  console.log('─'.repeat(60));
  console.log(`Artifact ID: ${artifact.id}`);
  console.log(`Insight ID:  ${insight.id}`);
  console.log(`Title:       ${title}`);
  console.log(`Claims:      ${claimsStructure.main_claims.length} main, ${claimsStructure.evidence_claims.length} evidence (${claimsStructure.main_claims.length + claimsStructure.evidence_claims.length} total)`);
  console.log(`Tickers:     ${tickers.join(', ')}`);

  return { artifact, insight, promotedCount };
}

async function main() {
  console.log('\n🚀 Starting batch upload of research audits\n');

  // Upload first audit
  await uploadAudit(
    '/Users/njb/Desktop/nick/investing/2025-12-21-transcript-apps-to-agents.md',
    '/Users/njb/Desktop/nick/investing/2025-12-21-audit-apps-to-agents-audit.md',
    'From Apps to Agents: Why 2026 Is the Real AI Inflection Point',
    'https://www.youtube.com/watch?v=0Hcw9toVRNg',
    ['AI agents', '2026 inflection', 'enterprise adoption', 'CSCO', 'MU', 'NVDA', 'TSLA', 'BTC']
  );

  // Upload second audit
  await uploadAudit(
    '/Users/njb/Desktop/nick/investing/2025-12-28-transcript-The-Deadly-ROIC-Gap-Could-Kill-the-AI-Hyperscalers-in-2026.md',
    '/Users/njb/Desktop/nick/investing/2025-12-14-audit-oracle-roic-gap-hyperscalers-audit.md',
    'The Deadly ROIC Gap Could Kill the AI Hyperscalers in 2026',
    'https://www.youtube.com/watch?v=example',
    ['hyperscalers', 'ROIC gap', 'capex', 'GOOGL', 'MSFT', 'META', 'AMZN']
  );

  console.log('\n' + '='.repeat(80));
  console.log('✅ All audits uploaded successfully!');
  console.log('='.repeat(80));
}

main().catch(console.error);
