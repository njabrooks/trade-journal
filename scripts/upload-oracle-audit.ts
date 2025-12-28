import { db } from '../src/db/index.js';
import { researchArtifacts, researchInsights } from '../src/db/schema.js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
import fs from 'fs/promises';
import path from 'path';

async function uploadAudit() {
  try {
    console.log('📖 Reading transcript...');
    const transcriptPath = '/Users/njb/Desktop/nick/investing/research/transcripts/The-Deadly-ROIC-Gap-Could-Kill-the-AI-Hyperscalers-in-2026.md';
    const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');

    console.log('📖 Reading audit...');
    const auditPath = '/Users/njb/Desktop/nick/investing/research/audits/2025-12-14-oracle-roic-gap-hyperscalers-audit.md';
    const auditContent = await fs.readFile(auditPath, 'utf-8');

    // Step 1: Upload transcript as artifact
    console.log('\n📥 Uploading transcript as research artifact...');
    const [artifact] = await db
      .insert(researchArtifacts)
      .values({
        title: 'Oracle Crashes 11%: The Deadly ROIC Gap Could Kill the AI Hyperscalers in 2026',
        sourceType: 'transcript',
        author: 'YouTube',
        publishedDate: '2025-12-14',
        sourceUrl: 'https://www.youtube.com/watch?v=Ps8PQOryRSU',
        rawContent: transcriptContent,
        contentFormat: 'markdown',
        tags: ['ROIC gap', 'hyperscalers', 'Blackwell', 'embodied AI', 'PMI expansion', 'SaaS decline', 'NVDA', 'GOOGL', 'MSFT', 'META', 'AMZN', 'ORCL', 'TSLA', 'BTC'],
        status: 'structured',
        ingestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log(`✅ Artifact created: ${artifact.id}`);
    console.log(`   Title: ${artifact.title}`);
    console.log(`   Type: ${artifact.sourceType}`);

    // Step 2: Parse claims structure
    console.log('\n🔍 Parsing Toulmin claims structure...');
    const claimsStructure = parseClaimsMarkdown(auditContent);

    console.log(`   Main claims: ${claimsStructure.main_claims.length}`);
    console.log(`   Evidence claims: ${claimsStructure.evidence_claims.length}`);

    // Step 3: Upload audit as insight
    console.log('\n📥 Uploading audit as research insight...');
    const [insight] = await db
      .insert(researchInsights)
      .values({
        researchArtifactId: artifact.id,
        summary: 'Comprehensive analysis of AI hyperscalers facing ROIC air gap in 2026 from capex timing mismatch, Blackwell transition enabling embodied AI era, SaaS structural decline, and PMI expansion dynamics. Extracted 28 Toulmin-structured claims covering macro themes (hardware investment era, power constraints, recursive self-improvement, Fed AI deflation acknowledgment) and asset-specific views (Oracle balance sheet stress, Tesla robo-taxi inflection, Bitcoin asymmetric bet).',
        keyThemes: ['ROIC air gap', 'Blackwell reset', 'embodied AI', 'SaaS decline', 'PMI expansion', 'hardware era', 'power constraints', 'hyperscaler stress'],
        claimsStructure: claimsStructure as any,
        relevantTickers: ['NVDA', 'GOOGL', 'MSFT', 'META', 'AMZN', 'ORCL', 'TSLA', 'BTC', 'ADBE', 'CRM'],
        timeHorizon: 'medium_term',
        confidenceLevel: 'high',
        structuredBy: 'ai',
        aiModel: 'process-transcript',
        structuredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log(`✅ Insight created: ${insight.id}`);
    console.log(`   Linked to artifact: ${artifact.id}`);
    console.log(`   Claims structure: ${claimsStructure.main_claims.length} main, ${claimsStructure.evidence_claims.length} evidence`);

    console.log('\n✅ Upload complete!');
    console.log(`\n→ View in app: http://localhost:3000/research/${insight.id}`);
    console.log('→ Convert claims to theses/views in the UI');
    console.log('→ Promote high-quality claims to first-class main_claims table');

    process.exit(0);
  } catch (error) {
    console.error('❌ Upload failed:', error);
    process.exit(1);
  }
}

uploadAudit();
