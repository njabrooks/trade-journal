#!/usr/bin/env tsx
/**
 * ingest-regime-scan — run radon's IB-only regime scanners (CRI + VCG) and store
 * one snapshot row each in regime_snapshots (docs/v2/21 Phase 1).
 *
 * Radon owns the scanner math (scripts/{cri_scan,vcg_scan}.py, run via radon's venv
 * with --json); trade-journal owns scheduling, storage, and consumption. Both scanners
 * are IB-primary with keyless fallbacks (Cboe/Yahoo) — no UW/MenthorQ needed; a dead
 * gateway degrades to fallback data rather than failing, so we always record what the
 * scanner reports.
 *
 * Consumers: morning-brief-data.ts (regime section), dashboard regime strip,
 * options-advisor scenario ranking.
 *
 * Usage: npx tsx scripts/ingest-regime-scan.ts [--source cri|vcg]  (default: both)
 */
import { closeDb, db } from './lib/db.js';
import { regimeSnapshots } from '../src/db/schema';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const RADON_ROOT = '/Users/home-hub/projects/radon';
const RADON_PY = `${RADON_ROOT}/.venv/bin/python3`;
const SCAN_TIMEOUT_MS = 8 * 60 * 1000; // IB pacing can make these slow

interface SnapshotRow {
  source: 'cri' | 'vcg';
  scan_time: string;
  market_open: boolean | null;
  score: number | null;
  band: string;
  components: Record<string, unknown>;
}

async function runScanner(script: string): Promise<Record<string, unknown>> {
  const { stdout } = await execFileP(RADON_PY, [`scripts/${script}`, '--json', '--no-open'], {
    cwd: RADON_ROOT,
    timeout: SCAN_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function toCriRow(raw: Record<string, unknown>): SnapshotRow {
  const cri = raw.cri as { score: number; level: string; components: unknown };
  // Drop the bulky rolling-history array; keep everything the consumers read.
  const { history: _history, ...payload } = raw;
  return {
    source: 'cri',
    scan_time: String(raw.scan_time),
    market_open: typeof raw.market_open === 'boolean' ? raw.market_open : null,
    score: cri?.score ?? null,
    band: cri?.level ?? 'UNKNOWN',
    components: payload,
  };
}

function toVcgRow(raw: Record<string, unknown>): SnapshotRow {
  const signal = raw.signal as Record<string, unknown>;
  return {
    source: 'vcg',
    scan_time: String(raw.scan_time),
    market_open: typeof raw.market_open === 'boolean' ? raw.market_open : null,
    score: typeof signal?.vcg === 'number' ? (signal.vcg as number) : null,
    band: String(signal?.interpretation ?? 'UNKNOWN'),
    components: { ...signal, credit_proxy: raw.credit_proxy },
  };
}

async function main() {
  const sourceArg = process.argv.indexOf('--source');
  const only = sourceArg > -1 ? process.argv[sourceArg + 1] : null;

  const jobs: Array<{ source: 'cri' | 'vcg'; script: string; toRow: (r: Record<string, unknown>) => SnapshotRow }> = [
    { source: 'cri', script: 'cri_scan.py', toRow: toCriRow },
    { source: 'vcg', script: 'vcg_scan.py', toRow: toVcgRow },
  ].filter((j) => !only || j.source === only) as never;

  const results: Record<string, string> = {};
  let failures = 0;

  for (const job of jobs) {
    try {
      const raw = await runScanner(job.script);
      const row = job.toRow(raw);
      await db.insert(regimeSnapshots).values({
        source: row.source,
        scanTime: new Date(row.scan_time),
        marketOpen: row.market_open,
        score: row.score !== null ? String(row.score) : null,
        band: row.band,
        components: row.components,
      });
      results[job.source] = `${row.band} (score=${row.score})`;
      console.log(`✓ ${job.source}: ${results[job.source]}`);
    } catch (err) {
      failures++;
      results[job.source] = `FAILED: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`;
      console.error(`✗ ${job.source}: ${results[job.source]}`);
    }
  }

  await closeDb();
  console.log(JSON.stringify({ ok: failures === 0, results }));
  if (failures === jobs.length) process.exit(1); // total failure → cron-health streak
}

main();
