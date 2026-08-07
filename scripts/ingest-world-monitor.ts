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
import { fileURLToPath } from 'url';
import { join, resolve } from 'path';
import { parseWorldMonitor, type ParsedReport } from '../src/lib/intelligence/parseWorldMonitor.js';
import { type Assessment } from '../src/lib/intelligence/scoring.js';
import { emitIntelItems, type IntelItemInput } from '../src/lib/intelligence/emitIntelItems.js';
import { parsePriceWatch, parseThesisRelevantNews } from '../src/lib/intelligence/parseObserveReport.js';
import { upsertCandidateSignal } from '../src/lib/intelligence/candidateSignals.js';

const { signals, signalDataSnapshots, signalEntityLinks } = schema;

// Virtual source table name for intel_items emitted from monitor reports.
// (Pre-v2 rows used 'intelligence_items' with the now-dropped table's row uuids.)
const SOURCE_TABLE = 'world_monitor_report';

export async function ingestReport(
  filePath: string,
  options: { thesisObserveOnly?: boolean } = {},
): Promise<{ itemCount: number; emitted: number; skipped: boolean; candidates: { written: number; bumped: number; skipped: number } }> {
  const markdown = readFileSync(filePath, 'utf-8');
  const parsed = parseWorldMonitor(markdown);
  let candidates = { written: 0, bumped: 0, skipped: 0 };

  // thesis-observe (docs/v2/14, the tracking-evidence producer) and the legacy
  // thesis-monitor share one directive report shape; both generate qualitative signal
  // snapshots. The data_source label keeps their provenance distinct in the stream.
  const isThesisMonitor = parsed.reportType === 'thesis-monitor' || parsed.reportType === 'thesis-observe';
  const signalDataSource = parsed.reportType === 'thesis-observe' ? 'thesis_observe' : 'thesis_monitor';
  if (options.thesisObserveOnly && parsed.reportType !== 'thesis-observe') {
    throw new Error('--thesis-observe-only requires a report with type: thesis-observe');
  }

  // Emit intel items with deterministic record ids — (source_table, source_record_id)
  // uniqueness makes re-ingestion of the same report a no-op.
  let emitted = 0;
  if (parsed.items.length > 0 && !options.thesisObserveOnly) {
    const intelItems: IntelItemInput[] = parsed.items.map((item, idx) => ({
      sourceKey: isThesisMonitor ? signalDataSource : 'world_monitor',
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
  const skipped = !options.thesisObserveOnly && parsed.items.length > 0 && emitted === 0;

  // Post-ingestion hook: generate qualitative signal snapshots for thesis-monitor /
  // thesis-observe reports.
  if (isThesisMonitor && !skipped) {
    const snapshotCount = await generateQualitativeSnapshots(parsed, signalDataSource);
    console.log(`  Signal snapshots (${signalDataSource}): ${snapshotCount} generated`);

    // PRICE & DATA WATCH (P4 #1) — observability only; parsed + surfaced, not persisted.
    const priceRows = parsePriceWatch(parsed.fullMarkdown ?? '');
    if (priceRows.length > 0) {
      const priced = priceRows.filter((r) => r.live != null);
      const drift = priced
        .filter((r) => r.deltaVsStoredPct != null)
        .sort((a, b) => Math.abs(b.deltaVsStoredPct as number) - Math.abs(a.deltaVsStoredPct as number))[0];
      const driftStr = drift
        ? `; largest drift ${drift.ticker} ${(drift.deltaVsStoredPct as number) > 0 ? '+' : ''}${drift.deltaVsStoredPct}% vs stored`
        : '';
      console.log(`  PRICE & DATA WATCH: ${priceRows.length} rows (${priced.length} priced, ${priceRows.length - priced.length} gap)${driftStr}`);
    }

    // Candidate-signal harvesting is part of the legacy general-ingestion path. The
    // governed thesis-observe-only path is limited to signal evidence + audit history.
    if (!options.thesisObserveOnly) {
      candidates = await harvestCandidateSignals(parsed, filePath);
      if (candidates.written + candidates.bumped + candidates.skipped > 0) {
        console.log(`  Candidate signals: ${candidates.written} new, ${candidates.bumped} bumped, ${candidates.skipped} unresolved`);
      }
    }
  }

  return { itemCount: parsed.items.length, emitted, skipped, candidates };
}

/**
 * Normalize a signal statement for fuzzy matching.
 * Strips punctuation, collapses whitespace, lowercases.
 */
function normalizeStatement(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

interface SignalScore { assessment: Assessment; evidenceText: string; }

/**
 * Parse per-signal Score blocks from a thesis-monitor / thesis-observe directive report.
 *
 * Canonical block shape (the /thesis-observe + /thesis-monitor template):
 *   #### {emoji} {signal statement}
 *   - **Signal ID:** <uuid>
 *   - **Score:** <neutral|strengthening|confirmed|weakening|invalidated>
 *   - **Evidence:** <text>
 *   - **Assessment:** <text>
 *   - **Change from prior:** <text>
 *
 * Returns scores keyed BOTH by Signal ID (authoritative — ingest keys off this, docs/v2/14
 * §3.4) and by normalized statement (fallback for legacy reports predating the Signal ID
 * line). Tolerates the old `- {emoji} **statement**` bullet form and bold-wrapped labels
 * (`**Score:**`). The previous parser matched neither the `####` header form nor `**Score:**`,
 * so it silently scored everything neutral — this is the fix.
 */
function parseSignalScores(markdown: string): { byId: Map<string, SignalScore>; byStatement: Map<string, SignalScore> } {
  const byId = new Map<string, SignalScore>();
  const byStatement = new Map<string, SignalScore>();

  const sectionMatch = markdown.match(/## SIGNAL ASSESSMENT\n([\s\S]*?)(?=\n## [A-Z]|\n---\s*$|$)/);
  if (!sectionMatch) return { byId, byStatement };
  const section = sectionMatch[1];

  const EMOJI = '🟢|🟡|⚪|🟠|🔴|✅';
  // Split into per-signal blocks: prefer the `####` header form, fall back to the bullet form.
  const headerBlocks = section.split(new RegExp(`(?=^#### (?:${EMOJI}))`, 'm'));
  const useHeader = headerBlocks.some((b) => /^#### /.test(b.trim()));
  const blocks = useHeader ? headerBlocks : section.split(new RegExp(`(?=^- (?:${EMOJI}))`, 'm'));

  const SCORE_RE = /\*{0,2}Score:?\*{0,2}\s*(neutral|strengthening|confirmed|weakening|invalidated)/i;
  const ID_RE = /\*{0,2}Signal ID:?\*{0,2}\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  const EVID_RE = /\*{0,2}Evidence:?\*{0,2}\s*([^\n]+)/i;
  const ASSESS_RE = /\*{0,2}Assessment:?\*{0,2}\s*([^\n]+)/i;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const scoreMatch = trimmed.match(SCORE_RE);
    if (!scoreMatch) continue;
    const assessment = scoreMatch[1].toLowerCase() as Assessment;

    // Statement = the header/bullet line with the emoji + markdown stripped.
    const firstLine = trimmed.split('\n')[0]
      .replace(/^####\s*/, '')
      .replace(/^-\s*/, '')
      .replace(new RegExp(`^(?:${EMOJI})\\s*`), '')
      .replace(/\*\*/g, '')
      .trim();

    // Prefer the direct Evidence line for evidenceSummary; fall back to the Assessment prose.
    const evidenceText = trimmed.match(EVID_RE)?.[1]?.trim()
      || trimmed.match(ASSESS_RE)?.[1]?.trim()
      || '';
    const entry: SignalScore = { assessment, evidenceText };

    const idMatch = trimmed.match(ID_RE);
    if (idMatch) byId.set(idMatch[1].toLowerCase(), entry);
    if (firstLine) byStatement.set(normalizeStatement(firstLine), entry);
  }

  return { byId, byStatement };
}

/**
 * Generate qualitative signal data snapshots from a parsed thesis-monitor / thesis-observe
 * report.
 *
 * Scoping (docs/v2/14 §3.4): reports that carry Signal IDs — thesis-observe and the current
 * thesis-monitor template — write a snapshot for EXACTLY the signals they reported. This is
 * what lets a tiered/partial observe run (Tier-1 only) write evidence for just the signals it
 * actually observed, without minting phantom `neutral` rows for unobserved theses. Legacy
 * reports without IDs fall back to all active thesis signals, matched by statement.
 *
 * @param dataSource snapshot provenance label — 'thesis_observe' or 'thesis_monitor'.
 */
async function generateQualitativeSnapshots(parsed: ParsedReport, dataSource: string): Promise<number> {
  if (!parsed.fullMarkdown) return 0;

  const scores = parseSignalScores(parsed.fullMarkdown);
  const reportedIds = [...scores.byId.keys()];

  if (scores.byId.size > 0) {
    console.log(`  Signal scores: ${scores.byId.size} by ID, ${scores.byStatement.size} by statement`);
  } else if (scores.byStatement.size > 0) {
    console.log(`  Signal scores: ${scores.byStatement.size} by statement (no Signal IDs in report)`);
  } else {
    console.log(`  No Score: labels found — nothing to snapshot`);
    return 0;
  }

  // Target signal set: scope to reported IDs when present, else all active thesis signals.
  const targetSignals = await db
    .select({
      id: signals.id,
      type: signals.type,
      statement: signals.statement,
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
    })
    .from(signals)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(
      reportedIds.length > 0
        ? and(eq(signalEntityLinks.entityType, 'thesis'), inArray(signals.id, reportedIds))
        : and(eq(signalEntityLinks.entityType, 'thesis'), eq(signals.status, 'active'))
    );

  if (targetSignals.length === 0) return 0;

  const snapshots: Array<typeof signalDataSnapshots.$inferInsert> = [];
  const now = new Date();

  for (const signal of targetSignals) {
    const entry = scores.byId.get(signal.id)
      ?? scores.byStatement.get(normalizeStatement(signal.statement));
    snapshots.push({
      signalId: signal.id,
      snapshotDate: now,
      assessment: entry?.assessment ?? 'neutral',
      evidenceSummary: entry?.evidenceText || null,
      dataSource,
      status: 'pending',
    });
  }

  if (snapshots.length > 0) {
    await db.insert(signalDataSnapshots).values(snapshots);
  }

  // Journal non-neutral assessments as thesis-level signal_evidence_received events.
  const nonNeutralSnapshots = snapshots.filter(s => s.assessment !== 'neutral');
  if (nonNeutralSnapshots.length > 0) {
    const thesisIds = new Set<string>();
    for (const snap of nonNeutralSnapshots) {
      const signal = targetSignals.find(s => s.id === snap.signalId);
      if (signal?.thesisId) thesisIds.add(signal.thesisId);
    }

    const thesisTitleMap: Record<string, string> = {};
    const macroIds = [...thesisIds].filter(id => targetSignals.find(s => s.thesisId === id)?.thesisType === 'macro');
    const assetIds = [...thesisIds].filter(id => targetSignals.find(s => s.thesisId === id)?.thesisType === 'asset');

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
      const signal = targetSignals.find(s => s.id === snap.signalId);
      if (!signal?.thesisId || !signal.thesisType) continue;

      const objectType = signal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
      const thesisTitle = thesisTitleMap[signal.thesisId] || 'Unknown thesis';
      const shortStatement = signal.statement.slice(0, 80);
      const sourceLabel = dataSource === 'thesis_observe' ? 'thesis observe' : 'thesis monitor';

      await logToJournal({
        objectType,
        objectId: signal.thesisId,
        objectTitle: thesisTitle,
        actionType: 'signal_evidence_received',
        actionDescription: `Signal "${shortStatement}" received ${snap.assessment} evidence from ${sourceLabel}`,
        source: 'automation',
        metadata: {
          signalId: snap.signalId,
          assessment: snap.assessment,
          dataSource,
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

/**
 * Harvest THESIS-RELEVANT NEWS items into `candidate_signal` journal rows (docs/v2/16 §1b):
 * the producer side of the contract Lane B's re-underwrite consumes. Resolves each item's
 * thesis title within the active monitoring set, then writes one active `candidate_signal`
 * row per (thesis, proposed statement), deduped per (object_id, normalized statement) —
 * bump occurrenceCount/lastSeenAt rather than duplicate (mirrors raise-decision §8.2).
 * We only PROPOSE candidates; promotion into real signals is the re-underwrite's judgment.
 */
async function harvestCandidateSignals(
  parsed: ParsedReport,
  filePath: string,
): Promise<{ written: number; bumped: number; skipped: number }> {
  const items = parseThesisRelevantNews(parsed.fullMarkdown ?? '');
  if (items.length === 0) return { written: 0, bumped: 0, skipped: 0 };

  // Resolve titles within the active monitoring set (the set the observe bundle drew from).
  const [monMacros, monAssets] = await Promise.all([
    db.select({ id: schema.macroTheses.id, title: schema.macroTheses.title })
      .from(schema.macroTheses).where(eq(schema.macroTheses.status, 'monitoring')),
    db.select({ id: schema.assetTheses.id, title: schema.assetTheses.title })
      .from(schema.assetTheses).where(eq(schema.assetTheses.status, 'monitoring')),
  ]);
  const byTitle = new Map<string, { id: string; type: 'macro_thesis' | 'asset_thesis'; title: string }>();
  for (const a of monAssets) byTitle.set(a.title.toLowerCase(), { id: a.id, type: 'asset_thesis', title: a.title });
  for (const mt of monMacros) byTitle.set(mt.title.toLowerCase(), { id: mt.id, type: 'macro_thesis', title: mt.title });

  let written = 0, bumped = 0, skipped = 0;
  for (const item of items) {
    const thesis = byTitle.get(item.thesisTitle.toLowerCase());
    if (!thesis) { skipped++; continue; } // unresolved title — leave it, don't guess

    // Shared writer (src/lib/intelligence/candidateSignals.ts) owns the dedup + metadata
    // shape, so observe and relate-bookmark (docs/v2/17) produce identical candidate rows.
    const result = await upsertCandidateSignal(db, {
      objectType: thesis.type,
      objectId: thesis.id,
      objectTitle: thesis.title,
      statement: item.headline,
      sourceUrl: item.sourceUrl,
      observedAt: parsed.generatedAt,
      fromReport: filePath,
      rationale: item.body || null,
    });
    if (result === 'written') written++;
    else if (result === 'bumped') bumped++;
    else skipped++; // 'skipped' = empty statement
  }
  return { written, bumped, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const backfill = args.includes('--backfill');
  const thesisObserveOnly = args.includes('--thesis-observe-only');

  if (!backfill && fileIdx === -1) {
    console.error('Usage: npx tsx scripts/ingest-world-monitor.ts --file <path> [--thesis-observe-only] | --backfill');
    process.exit(1);
  }

  if (fileIdx !== -1) {
    const filePath = resolve(args[fileIdx + 1]);
    console.log(`Ingesting: ${filePath}`);
    const result = await ingestReport(filePath, { thesisObserveOnly });
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
}
