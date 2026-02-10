#!/usr/bin/env npx tsx
/**
 * upload-audit.ts
 * 
 * Generic script to upload any AUDIT file to Supabase.
 * Follows finalize-for-upload skill logic exactly.
 * 
 * Usage:
 *   npx tsx scripts/upload-audit.ts /path/to/YYYYMMDD-slug-AUDIT.md
 *   npx tsx scripts/upload-audit.ts /path/to/YYYYMMDD-slug-AUDIT.md --transcript /path/to/original.md
 * 
 * What it does:
 *   1. Reads and parses AUDIT file with parseClaimsMarkdown()
 *   2. Extracts metadata from frontmatter (title, author, source, tickers, etc.)
 *   3. Creates research_artifacts record (with transcript if provided)
 *   4. Creates research_insights record with claims_structure JSONB
 *   5. Auto-promotes main claims to main_claims table (status: draft)
 *   6. Outputs artifact ID, insight ID, and claim count
 * 
 * Environment:
 *   Reads DATABASE_URL from .env.local in trade-journal directory
 */

import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// Load environment variables FIRST
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/upload-audit.ts <audit-file> [--transcript <transcript-file>]');
    console.error('Example: npx tsx scripts/upload-audit.ts /path/to/20260210-slug-AUDIT.md');
    process.exit(1);
  }

  const auditPath = args[0];
  let transcriptPath: string | null = null;
  
  const transcriptIdx = args.indexOf('--transcript');
  if (transcriptIdx !== -1 && args[transcriptIdx + 1]) {
    transcriptPath = args[transcriptIdx + 1];
  }

  // Validate audit file exists
  try {
    await fs.access(auditPath);
  } catch {
    console.error(`❌ Audit file not found: ${auditPath}`);
    process.exit(1);
  }

  // Read audit file
  console.log(`📄 Reading audit file: ${auditPath}`);
  const auditContent = await fs.readFile(auditPath, 'utf-8');

  // Read transcript if provided
  let transcriptContent: string | null = null;
  if (transcriptPath) {
    try {
      transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
      console.log(`📄 Reading transcript: ${transcriptPath}`);
    } catch {
      console.warn(`⚠️  Transcript file not found: ${transcriptPath}, proceeding without it`);
    }
  }

  // Parse frontmatter
  const frontmatterMatch = auditContent.match(/^---\n([\s\S]*?)\n---/);
  let frontmatter: Record<string, any> = {};
  if (frontmatterMatch) {
    try {
      frontmatter = yaml.parse(frontmatterMatch[1]);
    } catch (e) {
      console.warn('⚠️  Failed to parse frontmatter, using defaults');
    }
  }

  // Extract metadata
  const title = frontmatter.title || extractTitleFromContent(auditContent) || path.basename(auditPath, '-AUDIT.md');
  const author = frontmatter.author || 'Unknown';
  const sourceUrl = frontmatter.source_url || frontmatter.source || null;
  const sourceType = frontmatter.source_type || 'transcript';
  const auditDate = frontmatter.audit_date || new Date().toISOString().split('T')[0];
  const topics = frontmatter.topics || [];
  const tickers = extractTickers(frontmatter.tickers || auditContent);
  
  console.log(`\n📊 Metadata extracted:`);
  console.log(`   Title: ${title}`);
  console.log(`   Author: ${author}`);
  console.log(`   Source: ${sourceUrl || '(none)'}`);
  console.log(`   Tickers: ${tickers.join(', ') || '(none)'}`);

  // Dynamic imports after env is loaded
  const { db } = await import('../src/db/index.js');
  const { researchArtifacts, researchInsights, mainClaims } = await import('../src/db/schema.js');
  const { parseClaimsMarkdown } = await import('../src/lib/research/parseClaimsMarkdown.js');
  const { eq } = await import('drizzle-orm');

  // Parse claims structure
  console.log('\n🔍 Parsing claims structure...');
  const claimsStructure = parseClaimsMarkdown(auditContent);
  console.log(`   ✅ Parsed ${claimsStructure.main_claims.length} main claims, ${claimsStructure.evidence_claims.length} evidence claims`);

  if (claimsStructure.main_claims.length === 0) {
    console.error('❌ No main claims found in audit file. Check format matches parseClaimsMarkdown expectations.');
    process.exit(1);
  }

  // Create artifact
  console.log('\n📦 Creating research artifact...');
  const [artifact] = await db.insert(researchArtifacts).values({
    title: title,
    sourceType: sourceType,
    author: author,
    publishedDate: auditDate,
    sourceUrl: sourceUrl,
    rawContent: transcriptContent || auditContent,
    contentFormat: 'markdown',
    tags: Array.isArray(topics) ? topics : (typeof topics === 'string' ? topics.split(/[,\s]+/).filter(Boolean) : []),
    status: 'structured',
    ingestedAt: new Date(),
  }).returning();

  console.log(`   ✅ Artifact created: ${artifact.id}`);

  // Generate summary from claims
  const summary = generateSummary(claimsStructure, title);
  
  // Extract key themes from claims
  const keyThemes = extractKeyThemes(claimsStructure, topics);

  // Infer time horizon (most common among claims)
  const timeHorizon = inferTimeHorizon(claimsStructure);
  
  // Infer confidence (highest among claims)
  const confidenceLevel = inferConfidence(claimsStructure);

  // Create insight
  console.log('\n💡 Creating research insight...');
  const [insight] = await db.insert(researchInsights).values({
    researchArtifactId: artifact.id,
    summary: summary,
    keyThemes: keyThemes,
    timeHorizon: timeHorizon,
    confidenceLevel: confidenceLevel,
    relevantTickers: tickers.length > 0 ? tickers : null,
    claimsStructure: claimsStructure,
    structuredBy: 'ai',
    aiModel: 'process-investment-note',
    structuredAt: new Date(),
  }).returning();

  console.log(`   ✅ Insight created: ${insight.id}`);

  // Auto-promote main claims to main_claims table
  console.log('\n🚀 Promoting claims to main_claims table...');
  let promotedCount = 0;
  
  for (const claim of claimsStructure.main_claims) {
    try {
      await db.insert(mainClaims).values({
        sourceInsightId: insight.id,
        sourceClaimId: claim.id,
        title: claim.title,
        claim: claim.claim,
        category: claim.category || 'macro',
        relevantTickers: claim.tickers && claim.tickers.length > 0 ? claim.tickers : null,
        timeHorizon: claim.time_horizon || 'medium_term',
        qualifier: claim.qualifier || 'medium',
        evidence: claim.evidence && claim.evidence.length > 0 ? claim.evidence : null,
        reasoning: claim.reasoning || null,
        backing: claim.backing || null,
        rebuttal: claim.rebuttal && claim.rebuttal.length > 0 ? claim.rebuttal : null,
        status: 'draft',
      });
      promotedCount++;
    } catch (e) {
      console.warn(`   ⚠️  Failed to promote claim ${claim.id}: ${e}`);
    }
  }

  console.log(`   ✅ Promoted ${promotedCount} claims`);

  // Output summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 UPLOAD SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Artifact ID:  ${artifact.id}`);
  console.log(`Insight ID:   ${insight.id}`);
  console.log(`Title:        ${title}`);
  console.log(`Claims:       ${claimsStructure.main_claims.length} main, ${claimsStructure.evidence_claims.length} evidence`);
  console.log(`Promoted:     ${promotedCount} claims to main_claims (status: draft)`);
  console.log(`Tickers:      ${tickers.join(', ') || '(none)'}`);
  console.log('─'.repeat(60));
  console.log(`\n✅ Ready to browse in app at:`);
  console.log(`   http://localhost:3000/research/${artifact.id}`);
  console.log(`\n📋 Claims browser:`);
  console.log(`   http://localhost:3000/claims`);

  // Output JSON for programmatic use
  console.log('\n📤 JSON output:');
  console.log(JSON.stringify({
    success: true,
    artifactId: artifact.id,
    insightId: insight.id,
    title: title,
    mainClaims: claimsStructure.main_claims.length,
    evidenceClaims: claimsStructure.evidence_claims.length,
    promotedClaims: promotedCount,
    tickers: tickers,
    appUrl: `http://localhost:3000/research/${artifact.id}`,
  }, null, 2));

  process.exit(0);
}

// Helper functions

function extractTitleFromContent(content: string): string | null {
  // Try to find "# Forensic Audit: Title" pattern
  const match = content.match(/^#\s*Forensic Audit:\s*(.+)$/m);
  if (match) return match[1].trim();
  
  // Try to find any H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  
  return null;
}

function extractTickers(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input.map(t => t.toUpperCase().trim()).filter(t => /^[A-Z]{1,5}$/.test(t));
  }
  if (typeof input === 'string') {
    // Extract ticker-like patterns (1-5 uppercase letters)
    const matches = input.match(/\b[A-Z]{1,5}\b/g) || [];
    // Filter out common non-ticker words
    const excluded = new Set(['USA', 'NATO', 'CEO', 'CFO', 'COO', 'CTO', 'AI', 'ML', 'API', 'GDP', 'CPI', 'PMI', 'THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'ALL', 'CAN', 'HAS', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 'SAY', 'SHE', 'TOO', 'USE']);
    return [...new Set(matches.filter(t => !excluded.has(t)))];
  }
  return [];
}

function generateSummary(claimsStructure: any, title: string): string {
  const mainCount = claimsStructure.main_claims.length;
  const evidenceCount = claimsStructure.evidence_claims.length;
  const totalCount = mainCount + evidenceCount;
  
  // Get first 2-3 main claim titles for summary
  const claimTitles = claimsStructure.main_claims
    .slice(0, 3)
    .map((c: any) => c.title)
    .join(', ');
  
  return `Forensic audit extracting ${totalCount} claims (${mainCount} main thesis/view candidates, ${evidenceCount} evidence claims) from "${title}". Key claims: ${claimTitles}.`;
}

function extractKeyThemes(claimsStructure: any, topics: any): string[] {
  const themes = new Set<string>();
  
  // Add topics from frontmatter
  if (Array.isArray(topics)) {
    topics.forEach(t => themes.add(String(t).toLowerCase().replace('#', '')));
  }
  
  // Extract categories from claims
  claimsStructure.main_claims.forEach((c: any) => {
    if (c.category) themes.add(c.category);
  });
  
  return [...themes].slice(0, 10);
}

function inferTimeHorizon(claimsStructure: any): 'long_term' | 'medium_term' | 'short_term' {
  const horizons: Record<string, number> = { long_term: 0, medium_term: 0, short_term: 0 };
  
  claimsStructure.main_claims.forEach((c: any) => {
    if (c.time_horizon && horizons[c.time_horizon] !== undefined) {
      horizons[c.time_horizon]++;
    }
  });
  
  // Return most common, defaulting to medium_term
  const max = Math.max(...Object.values(horizons));
  if (max === 0) return 'medium_term';
  
  for (const [h, count] of Object.entries(horizons)) {
    if (count === max) return h as 'long_term' | 'medium_term' | 'short_term';
  }
  
  return 'medium_term';
}

function inferConfidence(claimsStructure: any): 'high' | 'medium' | 'low' | 'exploratory' {
  const levels: Record<string, number> = { high: 4, medium: 3, low: 2, exploratory: 1 };
  let maxLevel = 0;
  let maxConfidence: 'high' | 'medium' | 'low' | 'exploratory' = 'medium';
  
  claimsStructure.main_claims.forEach((c: any) => {
    if (c.qualifier && levels[c.qualifier] && levels[c.qualifier] > maxLevel) {
      maxLevel = levels[c.qualifier];
      maxConfidence = c.qualifier;
    }
  });
  
  return maxConfidence;
}

main().catch((err) => {
  console.error('❌ Upload failed:', err);
  process.exit(1);
});
