/**
 * World Monitor Intelligence Report Ingestion Script
 *
 * Ingests World Monitor markdown reports into the database.
 *
 * Usage:
 *   npx tsx scripts/ingest-world-monitor.ts --file <path>        # Ingest a single report
 *   npx tsx scripts/ingest-world-monitor.ts --backfill            # Ingest all reports in notes/intelligence/
 *
 * Environment:
 *   DATABASE_URL_POOLER - Database connection string
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { parseWorldMonitor } from '../src/lib/intelligence/parseWorldMonitor.js';

const { intelligenceReports, intelligenceItems } = schema;

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

  return { reportId: report.id, itemCount: parsed.items.length, skipped: false };
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
      .filter(f => f.endsWith('.md') && f.includes('world-monitor'))
      .sort();

    console.log(`Found ${files.length} World Monitor reports in ${intelDir}`);

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
