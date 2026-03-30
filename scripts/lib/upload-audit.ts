/**
 * Reusable audit upload helper
 *
 * Handles the full flow: parse audit markdown → create artifact →
 * create insight → auto-promote claims to main_claims table.
 *
 * Includes deduplication with replace-on-failure: if an artifact with the
 * same source_url exists but is deficient (incomplete processing chain),
 * the original is replaced and the pipeline re-runs.
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
import {
  autoPromoteAuditClaims,
  checkArtifactCompleteness,
  replaceDeficientArtifact,
} from '../../src/db/queries/research.js';

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
  /** Set when a deficient artifact was replaced */
  replacedArtifactId?: string;
}

export async function uploadAudit(opts: UploadAuditOptions): Promise<UploadAuditResult> {
  // Deduplication + replace-on-failure check
  if (opts.sourceUrl) {
    const completeness = await checkArtifactCompleteness(opts.sourceUrl);

    if (completeness) {
      if (completeness.isComplete) {
        // Existing artifact is complete — skip upload
        console.warn(`[upload-audit] Duplicate source_url detected — existing artifact is complete. Skipping upload.`);
        console.warn(`[upload-audit] Existing artifact: ${completeness.artifactId}`);
        console.warn(`[upload-audit] Source: ${opts.sourceUrl}`);
        throw new Error(`DUPLICATE_SOURCE_URL:${completeness.artifactId}`);
      }

      // Existing artifact is deficient — replace it
      const failedChecks: string[] = [];
      if (!completeness.checks.hasInsight) failedChecks.push('missing insight');
      if (!completeness.checks.hasValidClaimsStructure) failedChecks.push('invalid/missing claims_structure');
      if (!completeness.checks.hasPromotedClaims) failedChecks.push('no promoted claims');
      if (!completeness.checks.hasLinkageSuggestions && !completeness.checks.linkageSuggestionsWaived) {
        failedChecks.push('no linkage suggestions');
      }

      console.warn(`[upload-audit] Deficient artifact detected: ${completeness.artifactId}`);
      console.warn(`[upload-audit] Failed checks: ${failedChecks.join(', ')}`);
      console.warn(`[upload-audit] Replacing deficient artifact and re-running pipeline...`);

      const { deletedClaimCount, deletedInsightId } = await replaceDeficientArtifact(completeness.artifactId);
      console.warn(`[upload-audit] Replaced: artifact=${completeness.artifactId}, insight=${deletedInsightId}, claims=${deletedClaimCount}`);

      // Proceed with upload, recording provenance
      return doUpload(opts, completeness.artifactId);
    }
  }

  // No existing artifact — fresh upload
  return doUpload(opts);
}

async function doUpload(opts: UploadAuditOptions, replacedArtifactId?: string): Promise<UploadAuditResult> {
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

  // Build metadata (includes provenance if replacing)
  const metadata: Record<string, unknown> = {};
  if (replacedArtifactId) {
    metadata.replaced_artifact_id = replacedArtifactId;
    metadata.replaced_at = new Date().toISOString();
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
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    ingestedAt: new Date(),
  }).returning();

  console.log(`Artifact created: ${artifact.id}${replacedArtifactId ? ` (replaced ${replacedArtifactId})` : ''}`);

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
  const { promotedCount } = await autoPromoteAuditClaims(insight.id);
  console.log(`Promoted ${promotedCount} claims to main_claims table`);

  return {
    artifactId: artifact.id,
    insightId: insight.id,
    promotedCount,
    mainClaimCount: claimsStructure.main_claims.length,
    evidenceClaimCount: claimsStructure.evidence_claims.length,
    ...(replacedArtifactId ? { replacedArtifactId } : {}),
  };
}
