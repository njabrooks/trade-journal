#!/usr/bin/env tsx
/**
 * Push all data from Local Supabase to Remote Supabase (daily backup)
 *
 * This script mirrors your local database to remote Supabase for:
 * - Backup in case Mac Mini goes down
 * - Access when traveling (switch to remote in .env.local)
 *
 * Strategy: Full table replacement (TRUNCATE + INSERT)
 * - Simple and reliable
 * - Remote is a mirror, not a merge target
 * - Run daily after all local activity
 *
 * Usage:
 *   npx tsx scripts/push-to-remote.ts              # Full push (all tables)
 *   npx tsx scripts/push-to-remote.ts --dry-run    # Preview only
 *   npx tsx scripts/push-to-remote.ts --tables trades,positions  # Specific tables
 *
 * Environment:
 *   DATABASE_URL_POOLER  - Local Supabase connection (source)
 *   DATABASE_URL_REMOTE  - Remote Supabase connection (destination)
 */

import { execSync, spawnSync } from 'child_process';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment - use script directory to find .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '..', '.env.local') });

// Use PostgreSQL 17 to match local Supabase server version (17.6)
// Note: pg17's pg_dump generates \restrict commands that remote doesn't support,
// so we filter those out before restoring
const PSQL_PATH = '/opt/homebrew/opt/postgresql@17/bin/psql';
const PG_DUMP_PATH = '/opt/homebrew/opt/postgresql@17/bin/pg_dump';

// Connection strings
const LOCAL_DB = process.env.DATABASE_URL_POOLER;
const REMOTE_DB = process.env.DATABASE_URL_REMOTE;

// Extract password from connection URL for pg_dump (which doesn't parse URLs reliably)
function extractPassword(connUrl: string): string | undefined {
  try {
    const url = new URL(connUrl);
    return url.password || undefined;
  } catch {
    return undefined;
  }
}

// All tables to sync (in dependency order - parents before children)
const ALL_TABLES = [
  // Reference tables (no dependencies)
  'accounts',
  'underlyings',
  'strategy_templates',
  'playbook_items',
  'flex_query_configs',
  'ai_prompts',

  // Thesis hierarchy
  'macro_theses',
  'asset_theses',
  'asset_thesis_related_macro_theses',
  'thesis_articulations',

  // Research
  'research_artifacts',
  'research_insights',
  'research_mappings',
  'research_hierarchy_recommendations',
  'research_processing_runs',

  // Claims
  'main_claims',
  'main_claim_evidence',
  'claim_thesis_mappings',

  // Validation & Monitoring
  'validation_points',
  'validation_status_history',
  'monitoring_specs',
  'monitoring_events',
  'thesis_triage_records',
  'decision_audit_log',

  // Trading data
  'strategies',
  'trades',
  'positions',
  'raw_flex_positions',
  'raw_flex_trades',

  // Market data
  'underlyings_iv_history',
  'options_chain_snapshots',

  // Snapshots
  'mtm_snapshots',
  'nav_snapshots',
  'portfolio_snapshots',
  'strategy_metrics_snapshots',

  // Derived/computed
  'triage_records',
  'blotter_actions',
  'journal_entries',

  // Logging
  'ingestion_runs',
];

interface PushOptions {
  tables?: string[];
  dryRun?: boolean;
  verbose?: boolean;
}

function log(msg: string) {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] ${msg}`);
}

function execPsql(connStr: string, sql: string): string {
  try {
    // Set search_path to public to ensure tables are found
    const fullSql = `SET search_path TO public; ${sql}`;
    const result = spawnSync(PSQL_PATH, [connStr, '-t', '-A', '-c', fullSql], {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'psql failed');
    // Filter out the "SET" line from search_path and return the actual result
    const lines = result.stdout.trim().split('\n').filter((line) => line !== 'SET');
    return lines.join('\n');
  } catch (error: any) {
    throw new Error(`psql error: ${error.message}`);
  }
}

function getTableCount(connStr: string, table: string): number {
  try {
    const result = execPsql(connStr, `SELECT COUNT(*) FROM "${table}"`);
    return parseInt(result) || 0;
  } catch {
    return -1; // Table might not exist
  }
}

function tableExists(connStr: string, table: string): boolean {
  try {
    const result = execPsql(
      connStr,
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}')`
    );
    return result === 't';
  } catch {
    return false;
  }
}

function pushTable(table: string, options: PushOptions): { success: boolean; rows: number; error?: string } {
  const { dryRun, verbose } = options;

  // Check if table exists locally
  if (!tableExists(LOCAL_DB!, table)) {
    if (verbose) log(`  [${table}] Skipped - doesn't exist locally`);
    return { success: true, rows: 0 };
  }

  const localCount = getTableCount(LOCAL_DB!, table);
  const remoteCountBefore = getTableCount(REMOTE_DB!, table);

  if (verbose) {
    log(`  [${table}] Local: ${localCount} rows, Remote: ${remoteCountBefore} rows`);
  }

  if (dryRun) {
    log(`  [${table}] Would push ${localCount} rows`);
    return { success: true, rows: localCount };
  }

  const tempFile = `/tmp/push_${table}_${Date.now()}.sql`;

  try {
    // Extract password for pg_dump (it doesn't reliably parse passwords from URLs)
    const localPassword = extractPassword(LOCAL_DB!);
    const pgEnv = localPassword ? { ...process.env, PGPASSWORD: localPassword } : process.env;

    // Dump from local using COPY format (much faster than INSERT for large tables)
    const dumpResult = spawnSync(
      PG_DUMP_PATH,
      [
        LOCAL_DB!,
        `--table=public.${table}`,
        '--data-only',
        '--no-owner',
        '--no-privileges',
        '--disable-triggers',  // Disable FK triggers during restore
        `-f${tempFile}`,
      ],
      { encoding: 'utf-8', env: pgEnv }
    );

    if (dumpResult.status !== 0) {
      throw new Error(dumpResult.stderr || 'pg_dump failed');
    }

    // Truncate remote table
    execPsql(REMOTE_DB!, `TRUNCATE "${table}" CASCADE`);

    // Restore to remote - prepend search_path and session_replication_role to disable triggers
    // Also filter out pg17's \restrict and \unrestrict commands that remote Supabase doesn't support
    const preamble = `SET search_path TO public;
SET session_replication_role = replica;
`;
    execSync(
      `grep -v '^\\\\restrict\\|^\\\\unrestrict' ${tempFile} > ${tempFile}.filtered && ` +
        `echo '${preamble}' | cat - ${tempFile}.filtered > ${tempFile}.tmp && ` +
        `mv ${tempFile}.tmp ${tempFile} && rm -f ${tempFile}.filtered`
    );

    // Extract password for remote restore
    const remotePassword = extractPassword(REMOTE_DB!);
    const remoteEnv = remotePassword ? { ...process.env, PGPASSWORD: remotePassword } : process.env;

    const restoreResult = spawnSync(PSQL_PATH, [REMOTE_DB!, '-f', tempFile], {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
      env: remoteEnv,
    });

    if (restoreResult.status !== 0) {
      throw new Error(restoreResult.stderr || 'psql restore failed');
    }

    // Cleanup temp file
    execSync(`rm -f ${tempFile}`);

    const remoteCountAfter = getTableCount(REMOTE_DB!, table);

    if (verbose) {
      log(`  [${table}] ✅ Pushed ${remoteCountAfter} rows`);
    }

    return { success: true, rows: remoteCountAfter };
  } catch (error: any) {
    execSync(`rm -f ${tempFile}`);
    return { success: false, rows: 0, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);

  const options: PushOptions = {
    tables: undefined,
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('--dry-run'),
  };

  // Parse --tables
  const tablesIdx = args.indexOf('--tables');
  if (tablesIdx >= 0 && args[tablesIdx + 1]) {
    options.tables = args[tablesIdx + 1].split(',');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📤 Push Local → Remote Supabase');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Validate connections
  if (!LOCAL_DB) {
    console.error('❌ DATABASE_URL_POOLER not set (local connection)');
    process.exit(1);
  }

  if (!REMOTE_DB) {
    console.error('❌ DATABASE_URL_REMOTE not set');
    console.error('');
    console.error('Add to .env.local:');
    console.error('DATABASE_URL_REMOTE=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres');
    process.exit(1);
  }

  // Test connections
  log('Testing connections...');
  log(`  Local URL: ${LOCAL_DB?.substring(0, 50)}...`);
  log(`  Remote URL: ${REMOTE_DB?.substring(0, 50)}...`);

  try {
    execPsql(LOCAL_DB, 'SELECT 1');
    log('  ✅ Local connection OK');
  } catch (error: any) {
    console.error('  ❌ Local connection failed:', error.message);
    process.exit(1);
  }

  try {
    execPsql(REMOTE_DB, 'SELECT 1');
    log('  ✅ Remote connection OK');
  } catch (error: any) {
    console.error('  ❌ Remote connection failed:', error.message);
    process.exit(1);
  }

  if (options.dryRun) {
    console.log('');
    log('🔍 DRY RUN MODE - No changes will be made');
  }

  // Determine tables to push
  const tablesToPush = options.tables || ALL_TABLES;

  console.log('');
  log(`Pushing ${tablesToPush.length} tables...`);
  console.log('');

  let totalRows = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors: { table: string; error: string }[] = [];

  for (const table of tablesToPush) {
    const result = pushTable(table, options);

    if (result.success) {
      successCount++;
      totalRows += result.rows;
      if (!options.verbose && result.rows > 0) {
        process.stdout.write('.');
      }
    } else {
      errorCount++;
      errors.push({ table, error: result.error || 'Unknown error' });
      process.stdout.write('✗');
    }
  }

  console.log('');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 Push Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Tables pushed: ${successCount}/${tablesToPush.length}`);
  console.log(`  Total rows: ${totalRows.toLocaleString()}`);
  console.log(`  Errors: ${errorCount}`);
  if (options.dryRun) {
    console.log('  Mode: DRY RUN (no changes made)');
  }
  console.log('═══════════════════════════════════════════════════════════');

  if (errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const { table, error } of errors) {
      console.log(`  ❌ ${table}: ${error}`);
    }
  }

  console.log('');

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
