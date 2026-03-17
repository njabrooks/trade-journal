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

const { intelligenceReports, intelligenceItems, signals, signalDataSnapshots } = schema;

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

  // Load all active thesis signals with explicit_details
  const activeSignals = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      thesisId: signals.thesisId,
      thesisType: signals.thesisType,
      explicitDetails: signals.explicitDetails,
    })
    .from(signals)
    .where(
      and(
        eq(signals.entityType, 'thesis'),
        eq(signals.status, 'active')
      )
    );

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

    // Find matching intelligence items
    let bestMatch: typeof items[number] | null = null;
    let matchStrength: 'no_evidence' | 'emerging' | 'partial' | 'strong' = 'no_evidence';

    for (const item of items) {
      const text = `${item.headline} ${item.body || ''}`.toLowerCase();
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

      if (score > 0 && (!bestMatch || score > (bestMatch as Record<string, unknown>).__score as number)) {
        bestMatch = item;
        (bestMatch as Record<string, unknown>).__score = score;

        if (score >= 5) matchStrength = 'strong';
        else if (score >= 3) matchStrength = 'partial';
        else matchStrength = 'emerging';
      }
    }

    snapshots.push({
      signalId: signal.id,
      snapshotDate: now,
      assessment: matchStrength,
      evidenceSummary: bestMatch
        ? `${bestMatch.headline}${bestMatch.body ? ': ' + bestMatch.body.slice(0, 200) : ''}`
        : null,
      intelligenceItemId: bestMatch?.id || null,
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
