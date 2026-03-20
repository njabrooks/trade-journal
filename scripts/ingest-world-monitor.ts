/**
 * Intelligence Report Ingestion Script
 *
 * Ingests World Monitor and Thesis Monitor markdown reports into the database.
 *
 * Usage:
 *   npx tsx scripts/ingest-world-monitor.ts --file <path>        # Ingest a single report
 *   npx tsx scripts/ingest-world-monitor.ts --backfill            # Ingest all reports in notes/intelligence/
 *
 * Environment:
 *   DATABASE_URL_POOLER - Database connection string
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, inArray } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { parseWorldMonitor } from '../src/lib/intelligence/parseWorldMonitor.js';

const { intelligenceReports, intelligenceItems, signals, signalDataSnapshots, signalEntityLinks } = schema;

async function ingestReport(filePath: string): Promise<{ reportId: string; itemCount: number; skipped: boolean }> {
  const markdown = readFileSync(filePath, 'utf-8');
  const parsed = parseWorldMonitor(markdown);

  // Check for existing report
  const existing = await db
    .select({ id: intelligenceReports.id })
    .from(intelligenceReports)
    .where(
      and(
        eq(intelligenceReports.reportDate, parsed.reportDate),
        eq(intelligenceReports.generatedAt, new Date(parsed.generatedAt))
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { reportId: existing[0].id, itemCount: 0, skipped: true };
  }

  // Insert report
  const [report] = await db
    .insert(intelligenceReports)
    .values({
      reportDate: parsed.reportDate,
      generatedAt: new Date(parsed.generatedAt),
      timeWindow: parsed.timeWindow,
      version: parsed.version,
      reportType: parsed.reportType,
      executiveSummary: parsed.executiveSummary,
      keyThemes: parsed.keyThemes,
      fullMarkdown: parsed.fullMarkdown,
      criticalCount: parsed.items.filter(i => i.severity === 'critical').length,
      highCount: parsed.items.filter(i => i.severity === 'high').length,
      mediumCount: parsed.items.filter(i => i.severity === 'medium').length,
      infoCount: parsed.items.filter(i => i.severity === 'info').length,
      sectors: parsed.sectors,
    })
    .returning({ id: intelligenceReports.id });

  // Insert items
  if (parsed.items.length > 0) {
    await db.insert(intelligenceItems).values(
      parsed.items.map(item => ({
        reportId: report.id,
        severity: item.severity,
        sector: item.sector,
        headline: item.headline,
        body: item.body,
        sourceUrls: item.sourceUrls,
        relevantTickers: item.relevantTickers,
        section: item.section,
      }))
    );
  }

  // Post-ingestion hook: generate qualitative signal snapshots for thesis-monitor reports
  if (parsed.reportType === 'thesis-monitor') {
    const snapshotCount = await generateQualitativeSnapshots(report.id);
    console.log(`  Signal snapshots: ${snapshotCount} generated`);
  }

  return { reportId: report.id, itemCount: parsed.items.length, skipped: false };
}

const VALID_ASSESSMENTS = ['neutral', 'strengthening', 'confirmed', 'weakening', 'invalidated'] as const;
type Assessment = typeof VALID_ASSESSMENTS[number];

/**
 * Normalize a signal statement for fuzzy matching.
 * Strips punctuation, collapses whitespace, lowercases.
 */
function normalizeStatement(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse Score: labels from thesis-monitor report markdown.
 * Returns a map from normalized signal statement → { assessment, evidenceText }.
 */
function parseScoreLabels(markdown: string): Map<string, { assessment: Assessment; evidenceText: string }> {
  const scores = new Map<string, { assessment: Assessment; evidenceText: string }>();

  // Find SIGNAL ASSESSMENT section
  const sectionMatch = markdown.match(/## SIGNAL ASSESSMENT\n([\s\S]*?)(?=\n## [A-Z]|\n---\s*$)/);
  if (!sectionMatch) return scores;

  const sectionText = sectionMatch[1];

  // Match signal blocks: - {emoji} **[statement]** followed by Score: and Assessment: lines
  const signalBlockRegex = /- (?:🟢|🟡|⚪|🟠|🔴|✅)\s*\*\*(.+?)\*\*([\s\S]*?)(?=\n- (?:🟢|🟡|⚪|🟠|🔴|✅)|\n\*\*(?:Confirmation|Invalidation|Completion)|$)/g;

  let match;
  while ((match = signalBlockRegex.exec(sectionText)) !== null) {
    const statement = match[1].trim();
    const blockBody = match[2];

    // Extract Score: line
    const scoreMatch = blockBody.match(/Score:\s*(neutral|strengthening|confirmed|weakening|invalidated)/i);
    if (!scoreMatch) continue;

    const score = scoreMatch[1].toLowerCase() as Assessment;

    // Extract Assessment: prose for evidenceSummary
    const assessmentMatch = blockBody.match(/Assessment:\s*(.+?)(?:\n|$)/);
    const evidenceText = assessmentMatch ? assessmentMatch[1].trim() : '';

    scores.set(normalizeStatement(statement), { assessment: score, evidenceText });
  }

  return scores;
}

/**
 * Generate qualitative signal data snapshots from a thesis-monitor report.
 *
 * Primary path: parses explicit Score: labels from the report markdown.
 * Fallback path: heuristic keyword matching (for reports without Score: labels).
 * Creates a snapshot per signal — even "neutral" entries so the timeline is complete.
 */
async function generateQualitativeSnapshots(reportId: string): Promise<number> {
  // Load the report markdown for Score: label parsing
  const [report] = await db
    .select({ fullMarkdown: intelligenceReports.fullMarkdown })
    .from(intelligenceReports)
    .where(eq(intelligenceReports.id, reportId))
    .limit(1);

  if (!report?.fullMarkdown) return 0;

  // Parse Score: labels from report markdown (primary path)
  const scoreLabels = parseScoreLabels(report.fullMarkdown);
  const hasScoreLabels = scoreLabels.size > 0;

  if (hasScoreLabels) {
    console.log(`  Score labels found: ${scoreLabels.size} signals with explicit scores`);
  } else {
    console.log(`  No Score: labels found — using heuristic fallback`);
  }

  // Load the report's intelligence items (needed for evidence linking + fallback)
  const items = await db
    .select()
    .from(intelligenceItems)
    .where(eq(intelligenceItems.reportId, reportId));

  if (items.length === 0) return 0;

  // Load all active thesis signals with their linked thesis info (via junction table)
  const activeSignalRows = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(
      and(
        eq(signalEntityLinks.entityType, 'thesis'),
        eq(signals.status, 'active')
      )
    );

  if (activeSignalRows.length === 0) return 0;

  // Build ticker → signal mapping via asset theses
  const assetThesisIds = activeSignalRows
    .filter(s => s.thesisType === 'asset')
    .map(s => s.thesisId)
    .filter((id): id is string => id !== null);

  const tickerMap: Record<string, string> = {}; // thesisId → ticker
  if (assetThesisIds.length > 0) {
    const thesisRows = await db
      .select({
        thesisId: schema.assetTheses.id,
        ticker: schema.underlyings.ticker,
      })
      .from(schema.assetTheses)
      .innerJoin(schema.underlyings, eq(schema.assetTheses.underlyingId, schema.underlyings.id))
      .where(inArray(schema.assetTheses.id, assetThesisIds));

    for (const row of thesisRows) {
      tickerMap[row.thesisId] = row.ticker;
    }
  }

  const snapshots: Array<typeof signalDataSnapshots.$inferInsert> = [];
  const now = new Date();

  // No-evidence indicator patterns for heuristic fallback
  const NO_EVIDENCE_PATTERNS = [
    '⚪', 'no evidence', 'no change', 'no new', 'status quo', 'unchanged',
    'no significant', 'no notable', 'no material',
  ];

  for (const signal of activeSignalRows) {
    const normalizedStatement = normalizeStatement(signal.statement);

    // --- Primary path: look up Score: label by signal statement ---
    const scoreEntry = scoreLabels.get(normalizedStatement);

    if (scoreEntry) {
      // Find the best-matching intelligence item for evidence linking
      const bestItem = findBestMatchingItem(signal, items, tickerMap);

      snapshots.push({
        signalId: signal.id,
        snapshotDate: now,
        assessment: scoreEntry.assessment,
        evidenceSummary: scoreEntry.evidenceText || (bestItem
          ? `${bestItem.headline}${bestItem.body ? ': ' + bestItem.body.slice(0, 200) : ''}`
          : null),
        intelligenceItemId: bestItem?.id || null,
        dataSource: 'thesis_monitor',
        reportId: reportId,
        status: 'pending',
      });
      continue;
    }

    // --- Fallback path: heuristic keyword scoring (backwards compat) ---
    const bestItem = findBestMatchingItem(signal, items, tickerMap);
    let assessment: Assessment = 'neutral';

    if (bestItem) {
      const matchedText = `${bestItem.headline} ${bestItem.body || ''}`;
      const matchedTextLower = matchedText.toLowerCase();
      const hasNoEvidenceIndicator = NO_EVIDENCE_PATTERNS.some(
        pattern => matchedText.includes(pattern) || matchedTextLower.includes(pattern)
      );
      if (!hasNoEvidenceIndicator) {
        assessment = 'strengthening';
      }
    }

    snapshots.push({
      signalId: signal.id,
      snapshotDate: now,
      assessment,
      evidenceSummary: bestItem
        ? `${bestItem.headline}${bestItem.body ? ': ' + bestItem.body.slice(0, 200) : ''}`
        : null,
      intelligenceItemId: bestItem?.id || null,
      dataSource: 'thesis_monitor',
      reportId: reportId,
      status: 'pending',
    });
  }

  // Insert all snapshots
  if (snapshots.length > 0) {
    await db.insert(signalDataSnapshots).values(snapshots);
  }

  return snapshots.length;
}

/**
 * Find the best-matching intelligence item for a signal (by ticker + keyword scoring).
 * Used for evidence linking regardless of whether Score: labels are available.
 */
function findBestMatchingItem(
  signal: { statement: string; thesisId: string | null; thesisType: string | null; explicitDetails: unknown },
  items: Array<{ id: string; headline: string; body: string | null; relevantTickers: string[] | null }>,
  tickerMap: Record<string, string>,
): typeof items[number] | null {
  const details = signal.explicitDetails as Record<string, unknown> | null;
  const ticker = signal.thesisType === 'asset' && signal.thesisId
    ? tickerMap[signal.thesisId] || null
    : null;

  // Collect monitor keywords
  const keywords: string[] = [];
  if (details?.monitorKeywords && Array.isArray(details.monitorKeywords)) {
    keywords.push(...(details.monitorKeywords as string[]));
  }
  if (details?.conditions && Array.isArray(details.conditions)) {
    for (const cond of details.conditions as Record<string, unknown>[]) {
      if (cond.monitorKeywords && Array.isArray(cond.monitorKeywords)) {
        keywords.push(...(cond.monitorKeywords as string[]));
      }
    }
  }

  let bestMatch: typeof items[number] | null = null;
  let bestScore = 0;

  for (const item of items) {
    const text = `${item.headline} ${item.body || ''}`.toLowerCase();
    const itemTickers = item.relevantTickers || [];
    let score = 0;

    if (ticker && itemTickers.includes(ticker)) score += 3;

    const lowerKeywords = keywords.map(k => k.toLowerCase());
    for (const kw of lowerKeywords) {
      if (text.includes(kw)) score += 1;
    }

    const statementWords = signal.statement.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);
    for (const word of statementWords) {
      if (text.includes(word)) score += 0.5;
    }

    if (score > bestScore) {
      bestMatch = item;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const backfill = args.includes('--backfill');

  if (!backfill && fileIdx === -1) {
    console.error('Usage: npx tsx scripts/ingest-world-monitor.ts --file <path> | --backfill');
    process.exit(1);
  }

  if (fileIdx !== -1) {
    const filePath = resolve(args[fileIdx + 1]);
    console.log(`Ingesting: ${filePath}`);
    const result = await ingestReport(filePath);
    if (result.skipped) {
      console.log(`  Skipped (already exists): ${result.reportId}`);
    } else {
      console.log(`  Report ID: ${result.reportId}`);
      console.log(`  Items: ${result.itemCount}`);
    }
  }

  if (backfill) {
    // Look for reports in notes/intelligence/
    const intelDir = resolve(__dirname, '../../notes/intelligence');
    const files = readdirSync(intelDir)
      .filter(f => f.endsWith('.md') && (f.includes('world-monitor') || f.includes('thesis-monitor')))
      .sort();

    console.log(`Found ${files.length} intelligence reports in ${intelDir}`);

    let ingested = 0;
    let skipped = 0;

    for (const file of files) {
      const filePath = join(intelDir, file);
      console.log(`\nIngesting: ${file}`);
      try {
        const result = await ingestReport(filePath);
        if (result.skipped) {
          console.log(`  Skipped (already exists)`);
          skipped++;
        } else {
          console.log(`  Report ID: ${result.reportId}`);
          console.log(`  Items: ${result.itemCount}`);
          ingested++;
        }
      } catch (err) {
        console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`\nBackfill complete: ${ingested} ingested, ${skipped} skipped`);
  }

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
