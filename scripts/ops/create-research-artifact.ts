#!/usr/bin/env tsx

/**
 * Create a research artifact + insight record for Tana-promoted content.
 *
 * Used by the promote-claims component to ensure Tana-promoted investment claims
 * appear in the Trade Journal research library alongside file-pipeline claims.
 *
 * Creates:
 *   1. research_artifacts row  (the raw source content)
 *   2. research_insights row   (linked to artifact, holds summary + themes)
 *
 * Prints JSON with { artifactId, insightId } for use by the calling pipeline.
 *
 * Usage:
 *   npx tsx scripts/ops/create-research-artifact.ts \
 *     --title "Venice AI: The Uncensored AI Platform" \
 *     --source-type article \
 *     --source-url "https://example.com/article" \
 *     --author "John Smith" \
 *     --raw-content "Full transcript text..." \
 *     --summary "Venice AI positions itself as a privacy-first AI platform..." \
 *     --key-themes "AI infrastructure,Privacy,Decentralisation" \
 *     --tickers "VVV" \
 *     --structured-by "tana-pipeline"
 *
 * Required: --title, --source-type, --raw-content, --summary
 * Optional: --source-url, --author, --published-date (YYYY-MM-DD),
 *           --key-themes (comma-separated), --tickers (comma-separated),
 *           --tana-content-node-id (Tana node ID for dedup),
 *           --structured-by (default: ai; allowed: ai, manual, hybrid),
 *           --claims-structure (JSON string; written to research_insights.claims_structure)
 */

import { db, closeDb, schema } from '../lib/db.js';
import { eq, sql } from 'drizzle-orm';
import { RESEARCH_SOURCE_TYPES } from '@/lib/research/sourceTypes';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      args[key] = argv[i + 1] || '';
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const {
    title,
    source_type,
    source_url,
    author,
    published_date,
    raw_content,
    summary,
    key_themes,
    tickers,
    tana_content_node_id,
    claims_structure,
    structured_by = 'ai',
  } = args;

  if (!title || !source_type || !raw_content || !summary) {
    console.error('Required: --title, --source-type, --raw-content, --summary');
    process.exit(1);
  }

  const keyThemesArray = key_themes
    ? key_themes.split(',').map(t => t.trim()).filter(Boolean)
    : undefined;

  const tickersArray = tickers
    ? tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    : undefined;

  // Normalise source_type to allowed DB values
  const SOURCE_TYPE_MAP: Record<string, string> = {
    thread: 'article',
    post: 'article',
    x: 'article',
    twitter: 'article',
  };
  const validSourceTypes: readonly string[] = RESEARCH_SOURCE_TYPES;
  const normalisedSourceType = SOURCE_TYPE_MAP[source_type] ?? (validSourceTypes.includes(source_type) ? source_type : 'article');

  // Dedup: if tana_content_node_id provided, check for existing artifact
  if (tana_content_node_id) {
    const existing = await db
      .select({ id: schema.researchArtifacts.id })
      .from(schema.researchArtifacts)
      .where(
        sql`${schema.researchArtifacts.metadata}->>'tana_content_node_id' = ${tana_content_node_id}`
      )
      .limit(1);

    if (existing.length > 0) {
      // Check if insight already exists too
      const existingInsight = await db
        .select({ id: schema.researchInsights.id })
        .from(schema.researchInsights)
        .where(eq(schema.researchInsights.researchArtifactId, existing[0].id))
        .limit(1);

      if (existingInsight.length > 0) {
        console.log(JSON.stringify({
          success: true,
          artifactId: existing[0].id,
          insightId: existingInsight[0].id,
          title,
          deduplicated: true,
        }, null, 2));
        await closeDb();
        process.exit(0);
      }
    }
  }

  // 1. Create research_artifact
  const [artifact] = await db
    .insert(schema.researchArtifacts)
    .values({
      title,
      sourceType: normalisedSourceType,
      sourceUrl: source_url || null,
      author: author || null,
      publishedDate: published_date || null,
      rawContent: raw_content,
      status: 'structured',
      metadata: {
        origin: 'tana-pipeline',
        ...(tana_content_node_id ? { tana_content_node_id } : {}),
      },
    })
    .returning({ id: schema.researchArtifacts.id });

  // Parse claims_structure if provided
  let claimsStructureParsed: unknown = null;
  if (claims_structure) {
    try {
      claimsStructureParsed = JSON.parse(claims_structure);
    } catch {
      console.error('--claims-structure is not valid JSON');
      process.exit(1);
    }
  }

  // 2. Create research_insight linked to artifact
  const [insight] = await db
    .insert(schema.researchInsights)
    .values({
      researchArtifactId: artifact.id,
      summary,
      keyThemes: keyThemesArray,
      relevantTickers: tickersArray,
      structuredBy: ['ai', 'manual', 'hybrid'].includes(structured_by) ? structured_by : 'ai',
      aiModel: 'claude-sonnet-4-6',
      ...(claimsStructureParsed ? { claimsStructure: claimsStructureParsed } : {}),
    })
    .returning({ id: schema.researchInsights.id });

  console.log(JSON.stringify({
    success: true,
    artifactId: artifact.id,
    insightId: insight.id,
    title,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
