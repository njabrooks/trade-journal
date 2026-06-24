/**
 * Intelligence Report Ingestion Script
 *
 * Ingests World Monitor and Thesis Monitor markdown reports.
 *
 * v2 (2026-06): the intelligence_reports / intelligence_items tables were dropped
 * in the v2 prune. Reports are no longer stored — instead each report item is
 * emitted directly to intel_items (with a deterministic source_record_id for
 * idempotency), and thesis-monitor reports generate qualitative
 * signal_data_snapshots straight from the parsed markdown.
 *
 * Usage:
 *   npx tsx scripts/ingest-world-monitor.ts --file <path>        # Ingest a single report
 *   npx tsx scripts/ingest-world-monitor.ts --backfill            # Ingest all reports in notes/intelligence/
 *
 * Environment:
 *   DATABASE_URL_POOLER - Database connection string
 */

import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { eq, and, inArray } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { parseWorldMonitor, type ParsedReport } from '../src/lib/intelligence/parseWorldMonitor.js';
import { findBestMatch, type Assessment, type ContentForScoring } from '../src/lib/intelligence/scoring.js';
import { emitIntelItems, type IntelItemInput } from '../src/lib/intelligence/emitIntelItems.js';

const { signals, signalDataSnapshots, signalEntityLinks } = schema;

// Virtual source table name for intel_items emitted from monitor reports.
// (Pre-v2 rows used 'intelligence_items' with the now-dropped table's row uuids.)
const SOURCE_TABLE = 'world_monitor_report';

async function ingestReport(filePath: string): Promise<{ itemCount: number; emitted: number; skipped: boolean }> {
  const markdown = readFileSync(filePath, 'utf-8');
  const parsed = parseWorldMonitor(markdown);

  const isThesisMonitor = parsed.reportType === 'thesis-monitor';

  // Emit intel items with deterministic record ids — (source_table, source_record_id)
  // uniqueness makes re-ingestion of the same report a no-op.
  let emitted = 0;
  if (parsed.items.length > 0) {
    const intelItems: IntelItemInput[] = parsed.items.map((item, idx) => ({
      sourceKey: isThesisMonitor ? 'thesis_monitor' : 'world_monitor',
      sourceTable: SOURCE_TABLE,
      sourceRecordId: `${parsed.reportType}:${parsed.reportDate}:${parsed.generatedAt}:${idx}`,
      occurredAt: new Date(parsed.generatedAt),
      headline: item.headline,
      body: item.body || null,
      severity: item.severity,
      tickers: item.relevantTickers || [],
      metadata: {
        reportType: parsed.reportType,
        reportDate: parsed.reportDate,
        section: item.section,
        sector: item.sector,
        sourceUrls: item.sourceUrls,
      },
    }));
    emitted = await emitIntelItems(db, intelItems);
    console.log(`  Intel items emitted: ${emitted}`);
  }

  // If nothing was newly emitted, the report was already ingested — skip snapshots.
  const skipped = parsed.items.length > 0 && emitted === 0;

  // Post-ingestion hook: generate qualitative signal snapshots for thesis-monitor reports
  if (isThesisMonitor && !skipped) {
    const snapshotCount = await generateQualitativeSnapshots(parsed);
    console.log(`  Signal snapshots: ${snapshotCount} generated`);
  }

  return { itemCount: parsed.items.length, emitted, skipped };
}

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
 * Generate qualitative signal data snapshots from a parsed thesis-monitor report.
 *
 * Primary path: parses explicit Score: labels from the report markdown.
 * Fallback path: heuristic keyword matching (for reports without Score: labels).
 * Creates a snapshot per signal — even "neutral" entries so the timeline is complete.
 */
async function generateQualitativeSnapshots(parsed: ParsedReport): Promise<number> {
  if (!parsed.fullMarkdown) return 0;

  // Parse Score: labels from report markdown (primary path)
  const scoreLabels = parseScoreLabels(parsed.fullMarkdown);
  const hasScoreLabels = scoreLabels.size > 0;

  if (hasScoreLabels) {
    console.log(`  Score labels found: ${scoreLabels.size} signals with explicit scores`);
  } else {
    console.log(`  No Score: labels found — using heuristic fallback`);
  }

  // Report items (in memory — give each an index id for findBestMatch)
  const items = parsed.items.map((item, idx) => ({ id: String(idx), ...item }));

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

  // Helper to convert a report item to the shared ContentForScoring format
  const itemToContent = (item: { id: string; headline: string; body: string | null; relevantTickers: string[] | null }): ContentForScoring => ({
    text: `${item.headline} ${item.body || ''}`,
    tickers: item.relevantTickers || [],
  });

  for (const signal of activeSignalRows) {
    const normalizedStatement = normalizeStatement(signal.statement);
    const thesisTicker = signal.thesisType === 'asset' && signal.thesisId
      ? tickerMap[signal.thesisId] || null
      : null;

    // --- Primary path: look up Score: label by signal statement ---
    const scoreEntry = scoreLabels.get(normalizedStatement);

    if (scoreEntry) {
      // Find the best-matching report item for evidence context
      const match = findBestMatch(items, itemToContent, signal, thesisTicker);

      snapshots.push({
        signalId: signal.id,
        snapshotDate: now,
        assessment: scoreEntry.assessment,
        evidenceSummary: scoreEntry.evidenceText || (match
          ? `${match.item.headline}${match.item.body ? ': ' + match.item.body.slice(0, 200) : ''}`
          : null),
        dataSource: 'thesis_monitor',
        status: 'pending',
      });
      continue;
    }

    // --- Fallback path (reports without explicit Score: labels) ---
    // A keyword match establishes only that a report item is TOPICAL to the signal — not
    // whether it advances or contradicts the signal's criterion, and (for invalidation
    // signals) NOT the thesis-centric direction, which is the inverse of the criterion's.
    // So ABSTAIN: record the matched evidence text with a `neutral` assessment instead of
    // guessing a polarity. (The old code forced `strengthening` on any non-neutral match,
    // type-blind — wrong for invalidation signals, unfounded for the rest.) Mirrors the
    // relate-research assessSignal fix; direction comes from the explicit Score: path.
    const match = findBestMatch(items, itemToContent, signal, thesisTicker);

    snapshots.push({
      signalId: signal.id,
      snapshotDate: now,
      assessment: 'neutral',
      evidenceSummary: match
        ? `${match.item.headline}${match.item.body ? ': ' + match.item.body.slice(0, 200) : ''}`
        : null,
      dataSource: 'thesis_monitor',
      status: 'pending',
    });
  }

  // Insert all snapshots
  if (snapshots.length > 0) {
    await db.insert(signalDataSnapshots).values(snapshots);
  }

  // Journal non-neutral assessments as thesis-level events
  const nonNeutralSnapshots = snapshots.filter(s => s.assessment !== 'neutral');
  if (nonNeutralSnapshots.length > 0) {
    // Build thesis title map
    const thesisIds = new Set<string>();
    for (const snap of nonNeutralSnapshots) {
      const signal = activeSignalRows.find(s => s.id === snap.signalId);
      if (signal?.thesisId) thesisIds.add(signal.thesisId);
    }

    const thesisTitleMap: Record<string, string> = {};
    const macroIds = [...thesisIds].filter(id => {
      const sig = activeSignalRows.find(s => s.thesisId === id);
      return sig?.thesisType === 'macro';
    });
    const assetIds = [...thesisIds].filter(id => {
      const sig = activeSignalRows.find(s => s.thesisId === id);
      return sig?.thesisType === 'asset';
    });

    if (macroIds.length > 0) {
      const rows = await db.select({ id: schema.macroTheses.id, title: schema.macroTheses.title })
        .from(schema.macroTheses).where(inArray(schema.macroTheses.id, macroIds));
      for (const r of rows) thesisTitleMap[r.id] = r.title;
    }
    if (assetIds.length > 0) {
      const rows = await db.select({ id: schema.assetTheses.id, title: schema.assetTheses.title })
        .from(schema.assetTheses).where(inArray(schema.assetTheses.id, assetIds));
      for (const r of rows) thesisTitleMap[r.id] = r.title;
    }

    const batchId = crypto.randomUUID();
    let journalCount = 0;

    for (const snap of nonNeutralSnapshots) {
      const signal = activeSignalRows.find(s => s.id === snap.signalId);
      if (!signal?.thesisId || !signal.thesisType) continue;

      const objectType = signal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
      const thesisTitle = thesisTitleMap[signal.thesisId] || 'Unknown thesis';
      const shortStatement = signal.statement.slice(0, 80);

      await logToJournal({
        objectType,
        objectId: signal.thesisId,
        objectTitle: thesisTitle,
        actionType: 'signal_evidence_received',
        actionDescription: `Signal "${shortStatement}" received ${snap.assessment} evidence from thesis monitor`,
        source: 'automation',
        metadata: {
          signalId: snap.signalId,
          assessment: snap.assessment,
          dataSource: 'thesis_monitor',
          reportDate: parsed.reportDate,
          reportGeneratedAt: parsed.generatedAt,
        },
        batchId,
      });
      journalCount++;
    }

    if (journalCount > 0) {
      console.log(`  Journal entries: ${journalCount} thesis-level signal_evidence_received entries`);
    }
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
      console.log(`  Skipped (already ingested)`);
    } else {
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
          console.log(`  Skipped (already ingested)`);
          skipped++;
        } else {
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
