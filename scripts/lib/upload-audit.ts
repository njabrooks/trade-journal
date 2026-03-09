/**
 * Reusable audit upload helper
 *
 * Handles the full flow: parse audit markdown → create artifact →
 * create insight → auto-promote claims to main_claims table.
 *
 * Usage from a script:
 *   import * as dotenv from 'dotenv';
 *   dotenv.config({ path: '.env.local' });
 *
 *   async function main() {
 *     const { uploadAudit } = await import('./lib/upload-audit.js');
 *     const result = await uploadAudit({
 *       auditPath: 'path/to/audit.md',
 *       title: 'Research Title',
 *     });
 *     console.log(result);
 *   }
 *   main().catch(console.error);
 *
 * IMPORTANT: dotenv must be loaded BEFORE dynamically importing this module,
 * since it imports from src/db which needs DATABASE_URL_POOLER.
 */

import { promises as fs } from 'fs';
import { db } from '../../src/db/index.js';
import { researchArtifacts, researchInsights } from '../../src/db/schema.js';
import { parseClaimsMarkdown } from '../../src/lib/research/parseClaimsMarkdown.js';
import { autoPromoteAuditClaims } from '../../src/db/queries/research.js';
import { generateClaimThesisSuggestions } from '../../src/lib/services/claim-thesis-suggestions.js';

export interface UploadAuditOptions {
  /** Path to the audit markdown file */
  auditPath: string;
  /** Title for the research artifact */
  title: string;
  /** Source type (default: 'article') */
  sourceType?: string;
  /** Source URL */
  sourceUrl?: string;
  /** Author name */
  author?: string;
  /** Published date (YYYY-MM-DD string) */
  publishedDate?: string;
  /** Path to separate raw content file (if different from audit) */
  rawContentPath?: string;
  /** Tags for the artifact */
  tags?: string[];
  /** Summary for the insight (auto-generated if omitted) */
  summary?: string;
}

export interface UploadAuditResult {
  artifactId: string;
  insightId: string;
  promotedCount: number;
  mainClaimCount: number;
  evidenceClaimCount: number;
  suggestionCount: number;
}

export async function uploadAudit(opts: UploadAuditOptions): Promise<UploadAuditResult> {
  // Read and parse audit file
  const auditContent = await fs.readFile(opts.auditPath, 'utf-8');
  const claimsStructure = parseClaimsMarkdown(auditContent);

  console.log(`Parsed ${claimsStructure.main_claims.length} main claims, ${claimsStructure.evidence_claims.length} evidence claims`);

  // Read raw content (separate file or audit itself)
  const rawContent = opts.rawContentPath
    ? await fs.readFile(opts.rawContentPath, 'utf-8')
    : auditContent;

  // Collect all tickers from claims
  const allTickers = new Set<string>();
  for (const claim of claimsStructure.main_claims) {
    claim.relevant_tickers?.forEach(t => allTickers.add(t));
  }

  // Create research artifact
  const [artifact] = await db.insert(researchArtifacts).values({
    title: opts.title,
    sourceType: opts.sourceType || 'article',
    sourceUrl: opts.sourceUrl || null,
    author: opts.author || null,
    publishedDate: opts.publishedDate || null,
    rawContent,
    contentFormat: 'markdown',
    tags: opts.tags || null,
    status: 'structured',
    ingestedAt: new Date(),
  }).returning();

  console.log(`Artifact created: ${artifact.id}`);

  // Build summary from claims if not provided
  const summary = opts.summary ||
    `Audit extracting ${claimsStructure.main_claims.length} main claims and ${claimsStructure.evidence_claims.length} evidence claims from "${opts.title}".`;

  // Create research insight with claims structure
  const [insight] = await db.insert(researchInsights).values({
    researchArtifactId: artifact.id,
    summary,
    keyThemes: opts.tags || null,
    timeHorizon: null,
    confidenceLevel: null,
    relevantTickers: allTickers.size > 0 ? Array.from(allTickers) : null,
    claimsStructure: claimsStructure as any,
    structuredBy: 'ai',
    structuredAt: new Date(),
    aiModel: claimsStructure.metadata.source_skill || 'process-transcript',
  }).returning();

  console.log(`Insight created: ${insight.id}`);

  // Auto-promote main claims to main_claims table
  const { promotedCount, promotedClaimIds } = await autoPromoteAuditClaims(insight.id);
  console.log(`Promoted ${promotedCount} claims to main_claims table`);

  // Generate thesis linkage suggestions for promoted claims
  let suggestionCount = 0;
  try {
    if (promotedClaimIds.length > 0) {
      const suggestionIds = await generateClaimThesisSuggestions(insight.id, promotedClaimIds);
      suggestionCount = suggestionIds.length;
      console.log(`Generated ${suggestionCount} thesis linkage suggestions`);
    }
  } catch (err) {
    console.warn(`Warning: thesis suggestion generation failed (non-fatal):`, err);
  }

  return {
    artifactId: artifact.id,
    insightId: insight.id,
    promotedCount,
    mainClaimCount: claimsStructure.main_claims.length,
    evidenceClaimCount: claimsStructure.evidence_claims.length,
    suggestionCount,
  };
}
