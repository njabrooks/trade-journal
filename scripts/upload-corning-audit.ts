#!/usr/bin/env node
/**
 * Upload Corning (GLW) research audit to PostgreSQL database
 *
 * This script uploads the Corning investment analysis audit including:
 * - Research artifact (source document)
 * - Research insight with claims_structure
 * - Main claims auto-promoted to main_claims table
 */

import { db, closeDb } from './lib/db.js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as schema from '../src/db/schema.js';

const { researchArtifacts, researchInsights, mainClaims } = schema;

const AUDIT_FILE = '/Users/njb/Desktop/nick/investing/20251209-Corning-Write-up-Mgmt-Analysis-GLW-audit.md';
const SOURCE_FILE = '/Users/njb/Desktop/nick/investing/20251209-Corning-Write-up-Mgmt-Analysis-GLW.md';

async function main() {
  console.log('🔍 Reading audit and source files...');

  const auditContent = readFileSync(AUDIT_FILE, 'utf-8');
  const sourceContent = readFileSync(SOURCE_FILE, 'utf-8');

  // Parse frontmatter from source file
  const sourceFrontmatterMatch = sourceContent.match(/^---\n([\s\S]+?)\n---/);
  const sourceMeta = sourceFrontmatterMatch ? parseYAML(sourceFrontmatterMatch[1]) : {};

  // Parse frontmatter from audit file
  const auditFrontmatterMatch = auditContent.match(/^---\n([\s\S]+?)\n---/);
  const auditMeta = auditFrontmatterMatch ? parseYAML(auditFrontmatterMatch[1]) : {};

  console.log('📊 Parsing Toulmin claims structure...');
  const claimsStructure = parseClaimsMarkdown(auditContent);

  console.log(`   Main claims: ${claimsStructure.main_claims?.length || 0}`);
  console.log(`   Evidence claims: ${claimsStructure.evidence_claims?.length || 0}`);

  // Step 1: Upload source document as artifact
  console.log('\n📝 Step 1: Uploading source document as research artifact...');

  const artifactId = randomUUID();
  const tags = sourceMeta.tags || ['GLW', 'investment analysis'];
  const now = new Date();
  // publishedDate should be a string in YYYY-MM-DD format for date columns
  const publishedDate = sourceMeta.published_date || null;

  const artifactResult = await db.insert(researchArtifacts).values({
    id: artifactId,
    title: sourceMeta.title || 'Corning Write-up w/Mgmt Analysis (GLW)',
    sourceType: sourceMeta.source_type || 'article',
    author: sourceMeta.author || 'TheValueist',
    publishedDate: publishedDate,
    rawContent: sourceContent,
    contentFormat: 'markdown',
    sourceUrl: sourceMeta.source_url || null,
    tags: tags,
    status: 'structured',
    ingestedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`   ✅ Artifact created: ${artifactResult[0].id}`);

  // Step 2: Upload audit as insight with claims_structure
  console.log('\n📊 Step 2: Uploading audit as research insight with claims structure...');

  const insightId = randomUUID();

  // Extract summary from audit metadata
  const summary = `Investment analysis of Corning (GLW) examining structural earnings step-up from AI data center optics, U.S. solar onshoring, and Gorilla Glass, alongside comprehensive management quality assessment. ${auditMeta.total_claims || 38} claims extracted covering valuation (35x 2025E), optical growth risks, solar policy dependence, and governance concerns.`;

  // Extract themes
  const themes = [
    'AI infrastructure',
    'optical fiber',
    'solar manufacturing',
    'management analysis',
    'valuation analysis',
    'capital allocation',
  ];

  // Extract tickers from all claims
  const allTickers = new Set<string>();
  claimsStructure.main_claims?.forEach(claim => {
    claim.tickers?.forEach((t: string) => allTickers.add(t));
  });

  const tickers = Array.from(allTickers);

  const insightResult = await db.insert(researchInsights).values({
    id: insightId,
    researchArtifactId: artifactId,
    summary,
    keyThemes: themes,
    claimsStructure: claimsStructure as any,
    relevantTickers: tickers,
    timeHorizon: 'medium_term',
    confidenceLevel: 'high',
    structuredBy: 'ai',
    aiModel: 'process-transcript',
    structuredAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`   ✅ Insight created: ${insightResult[0].id}`);

  // Step 3: Auto-promote main claims to main_claims table
  console.log('\n🔄 Step 3: Auto-promoting main claims...');

  if (!claimsStructure.main_claims || claimsStructure.main_claims.length === 0) {
    console.log('   ⚠️  No main claims to promote');
  } else {
    let promotedCount = 0;

    for (const claim of claimsStructure.main_claims) {
      const claimId = randomUUID();
      const claimTickers = claim.tickers && claim.tickers.length > 0 ? claim.tickers : null;
      const evidence = claim.evidence && claim.evidence.length > 0 ? claim.evidence : null;
      const rebuttal = claim.rebuttal && claim.rebuttal.length > 0 ? claim.rebuttal : null;

      try {
        await db.insert(mainClaims).values({
          id: claimId,
          sourceInsightId: insightId,
          sourceClaimId: claim.id,
          title: claim.title || claim.claim?.substring(0, 100),
          claim: claim.claim,
          category: claim.category || 'macro',
          relevantTickers: claimTickers,
          timeHorizon: claim.time_horizon || 'medium_term',
          qualifier: claim.qualifier || 'medium',
          evidence: evidence,
          reasoning: claim.reasoning || null,
          backing: claim.backing || null,
          rebuttal: rebuttal,
          status: 'unconfirmed',
          createdAt: now,
          updatedAt: now,
        });
        promotedCount++;
      } catch (error: any) {
        console.error(`   ❌ Failed to insert claim "${claim.title}": ${error.message}`);
      }
    }

    console.log(`   ✅ Promoted ${promotedCount}/${claimsStructure.main_claims.length} claims to main_claims`);
  }

  await closeDb();

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ UPLOAD COMPLETE!');
  console.log('='.repeat(60));
  console.log(`
📊 Summary:
   Artifact ID:  ${artifactId}
   Insight ID:   ${insightId}

   Main Claims:     ${claimsStructure.main_claims?.length || 0}
   Evidence Claims: ${claimsStructure.evidence_claims?.length || 0}
   Tickers:         ${Array.from(allTickers).join(', ')}

🔗 Next Steps:
   1. View in app: /research/${insightId}
   2. Browse claims: /claims
   3. Promote claims: unconfirmed → confirmed in Claims Browser
   4. Convert claims to theses/views using ConvertClaimDialog
  `);
}

// Simple YAML parser for frontmatter
function parseYAML(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
    if (match) {
      const [, key, value] = match;

      // Handle arrays
      if (value.trim().startsWith('[')) {
        try {
          result[key] = JSON.parse(value.trim());
        } catch {
          result[key] = value.trim();
        }
      } else if (value.trim().startsWith('"') || value.trim().startsWith("'")) {
        result[key] = value.trim().slice(1, -1);
      } else {
        result[key] = value.trim();
      }
    }
  }

  return result;
}

main().catch((error) => {
  console.error('❌ Upload failed:', error);
  process.exit(1);
});
