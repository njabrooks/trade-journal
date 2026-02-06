#!/usr/bin/env tsx
/**
 * Upload external AUDIT files from notes vault to Supabase
 * Usage: npx tsx scripts/upload-external-audit.ts /path/to/AUDIT.md
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';

// Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wvukkvsrmgumzhvemjfb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_ANON_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const auditFilePath = process.argv[2];
  
  if (!auditFilePath) {
    console.error('❌ Usage: npx tsx scripts/upload-external-audit.ts /path/to/AUDIT.md');
    process.exit(1);
  }

  console.log(`📄 Reading: ${auditFilePath}`);
  const content = readFileSync(auditFilePath, 'utf-8');

  // Parse frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let metadata: any = {};
  
  if (frontmatterMatch) {
    const frontmatterLines = frontmatterMatch[1].split('\n');
    frontmatterLines.forEach((line) => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        metadata[key] = value.replace(/^["']|["']$/g, '');
      }
    });
  }

  // Parse claims using Trade Journal's parser
  console.log('🔍 Parsing claims...');
  const parsed = parseClaimsMarkdown(content);
  console.log(`✅ Found ${parsed.main_claims.length} main claims, ${parsed.evidence_claims.length} evidence claims`);

  if (parsed.main_claims.length === 0) {
    console.error('❌ No claims found! Check AUDIT format.');
    process.exit(1);
  }

  // Extract tickers and topics
  const allTickers = [...new Set(parsed.main_claims.flatMap(c => c.tickers || []))];
  const allTopics = metadata.topics?.split(' ').map((t: string) => t.replace('#', '')) || [];

  // Create artifact
  console.log('📦 Creating research artifact...');
  const { data: artifact, error: artifactError } = await supabase
    .from('research_artifacts')
    .insert({
      title: metadata.source_transcript?.replace('.md', '') || 'Untitled',
      source_url: metadata.source_url || null,
      author: metadata.author || null,
      source_type: metadata.source_type || 'transcript',
      published_date: metadata.audit_date || new Date().toISOString().split('T')[0],
      raw_content: content,
      content_format: 'markdown',
      status: 'structured',
      tags: [...allTopics, ...allTickers],
      metadata: {
        investment: metadata.investment === 'true',
        vault_path: auditFilePath
      }
    })
    .select()
    .single();

  if (artifactError) {
    console.error('❌ Failed to create artifact:', artifactError.message);
    process.exit(1);
  }

  console.log(`✅ Artifact created: ${artifact.id}`);

  // Normalize confidence level
  const normalizeConfidence = (qual: string | undefined): string => {
    if (!qual) return 'medium';
    const lower = qual.toLowerCase();
    if (lower.includes('high') || lower.includes('75%') || lower.includes('70%')) return 'high';
    if (lower.includes('low')) return 'low';
    if (lower.includes('exploratory')) return 'exploratory';
    return 'medium';
  };

  // Create insight with claims_structure
  console.log('💡 Creating insight with claims structure...');
  const { data: insight, error: insightError } = await supabase
    .from('research_insights')
    .insert({
      research_artifact_id: artifact.id,
      summary: `Investment analysis with ${parsed.main_claims.length} main claims`,
      key_themes: allTopics,
      claims_structure: parsed,
      time_horizon: parsed.main_claims[0]?.time_horizon || 'medium_term',
      confidence_level: normalizeConfidence(parsed.main_claims[0]?.qualifier),
      relevant_tickers: allTickers,
      structured_by: 'ai',
      ai_model: 'process-note-vault',
      human_reviewed: false
    })
    .select()
    .single();

  if (insightError) {
    console.error('❌ Failed to create insight:', insightError.message);
    process.exit(1);
  }

  console.log(`✅ Insight created: ${insight.id}`);
  console.log('\n✅ Upload complete!');
  console.log('─'.repeat(60));
  console.log(`Artifact ID: ${artifact.id}`);
  console.log(`Insight ID:  ${insight.id}`);
  console.log(`Claims:      ${parsed.main_claims.length} main, ${parsed.evidence_claims.length} evidence`);
  console.log(`\n🌐 View in app: http://localhost:3000/research/${artifact.id}`);
}

main().catch((error) => {
  console.error('❌ Upload failed:', error);
  process.exit(1);
});
