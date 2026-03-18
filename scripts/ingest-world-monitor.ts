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

/**
 * Generate qualitative signal data snapshots from a thesis-monitor report.
 *
 * For each active thesis signal, checks the report's intelligence items for
 * relevant matches (by ticker and keywords from explicit_details.monitorKeywords).
 * Creates a snapshot per signal — even "no_evidence" entries so the timeline is complete.
 */
async function generateQualitativeSnapshots(reportId: string): Promise<number> {
  // Load the report's intelligence items
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
  const activeSignals = activeSignalRows;

  if (activeSignals.length === 0) return 0;

  // Build ticker → signal mapping via asset theses
  const assetThesisIds = activeSignals
    .filter(s => s.thesisType === 'asset')
    .map(s => s.thesisId)
    .filter((id): id is string => id !== null);

  let tickerMap: Record<string, string> = {}; // thesisId → ticker
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

  // Dedup: track which item is best-claimed by which signal (item ID → best signal + score)
  const itemBestSignal = new Map<string, { signalId: string; score: number }>();
  // First pass: score all signals against all items
  const signalResults: Array<{
    signal: typeof activeSignals[number];
    bestMatch: typeof items[number] | null;
    bestScore: number;
    matchStrength: 'no_evidence' | 'emerging' | 'partial' | 'strong';
  }> = [];

  for (const signal of activeSignals) {
    const details = signal.explicitDetails as Record<string, unknown> | null;
    const ticker = signal.thesisType === 'asset' && signal.thesisId
      ? tickerMap[signal.thesisId] || null
      : null;

    // Collect monitor keywords from explicit_details
    const keywords: string[] = [];
    if (details?.monitorKeywords && Array.isArray(details.monitorKeywords)) {
      keywords.push(...(details.monitorKeywords as string[]));
    }
    // Also check conditions array for nested keywords
    if (details?.conditions && Array.isArray(details.conditions)) {
      for (const cond of details.conditions as Record<string, unknown>[]) {
        if (cond.monitorKeywords && Array.isArray(cond.monitorKeywords)) {
          keywords.push(...(cond.monitorKeywords as string[]));
        }
      }
    }

    // Score all items against this signal, tracking the best match
    let bestMatch: typeof items[number] | null = null;
    let bestScore = 0;

    // No-evidence indicator patterns (⚪ emoji or phrases indicating no change)
    const NO_EVIDENCE_PATTERNS = [
      '⚪', 'no evidence', 'no change', 'no new', 'status quo', 'unchanged',
      'no significant', 'no notable', 'no material',
    ];

    for (const item of items) {
      const text = `${item.headline} ${item.body || ''}`.toLowerCase();
      const rawText = `${item.headline} ${item.body || ''}`; // preserve emoji
      const itemTickers = item.relevantTickers || [];

      // Score this item against the signal
      let score = 0;

      // Ticker match (strong signal for asset theses)
      if (ticker && itemTickers.includes(ticker)) {
        score += 3;
      }

      // Keyword matches
      const lowerKeywords = keywords.map(k => k.toLowerCase());
      for (const kw of lowerKeywords) {
        if (text.includes(kw)) {
          score += 1;
        }
      }

      // Signal statement keyword overlap
      const statementWords = signal.statement.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4); // skip short words
      for (const word of statementWords) {
        if (text.includes(word)) {
          score += 0.5;
        }
      }

      if (score > bestScore) {
        bestMatch = item;
        bestScore = score;
      }
    }

    // Determine assessment level from score
    let matchStrength: 'no_evidence' | 'emerging' | 'partial' | 'strong' = 'no_evidence';

    if (bestMatch && bestScore > 0) {
      // Check if the matched evidence actually indicates no evidence / no change
      const matchedText = `${bestMatch.headline} ${bestMatch.body || ''}`;
      const matchedTextLower = matchedText.toLowerCase();
      const hasNoEvidenceIndicator = NO_EVIDENCE_PATTERNS.some(
        pattern => matchedText.includes(pattern) || matchedTextLower.includes(pattern)
      );

      if (hasNoEvidenceIndicator) {
        // Evidence text explicitly signals no change — force no_evidence
        matchStrength = 'no_evidence';
      } else if (bestScore >= 5) {
        matchStrength = 'strong';
      } else if (bestScore >= 3) {
        matchStrength = 'partial';
      } else {
        matchStrength = 'emerging';
      }
    }

    // Track this signal's claim on the best-matched item for dedup
    if (bestMatch && bestScore > 0 && matchStrength !== 'no_evidence') {
      const itemId = bestMatch.id;
      const existing = itemBestSignal.get(itemId);
      if (!existing || bestScore > existing.score) {
        itemBestSignal.set(itemId, { signalId: signal.id, score: bestScore });
      }
    }

    signalResults.push({
      signal,
      bestMatch: bestMatch && bestScore > 0 ? bestMatch : null,
      bestScore,
      matchStrength,
    });
  }

  // Second pass: dedup — only let each item be used by its highest-scoring signal
  for (const result of signalResults) {
    const { signal, bestMatch, bestScore, matchStrength } = result;

    let finalMatch = bestMatch;
    let finalAssessment = matchStrength;

    // If this signal matched an item, check if another signal has a stronger claim on it
    if (finalMatch && bestScore > 0 && finalAssessment !== 'no_evidence') {
      const owner = itemBestSignal.get(finalMatch.id);
      if (owner && owner.signalId !== signal.id) {
        // Another signal has a stronger match on this item — demote to no_evidence
        finalMatch = null;
        finalAssessment = 'no_evidence';
      }
    }

    snapshots.push({
      signalId: signal.id,
      snapshotDate: now,
      assessment: finalAssessment,
      evidenceSummary: finalMatch
        ? `${finalMatch.headline}${finalMatch.body ? ': ' + finalMatch.body.slice(0, 200) : ''}`
        : null,
      intelligenceItemId: finalMatch?.id || null,
      dataSource: 'thesis_monitor',
      reportId: reportId,
    });
  }

  // Insert all snapshots
  if (snapshots.length > 0) {
    await db.insert(signalDataSnapshots).values(snapshots);
  }

  return snapshots.length;
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
