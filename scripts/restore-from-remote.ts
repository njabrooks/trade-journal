#!/usr/bin/env tsx
/**
 * Restore all data from Remote Supabase to Local Supabase (disaster recovery)
 *
 * USE THIS ONLY WHEN:
 * - Mac Mini was down and you need to restore from backup
 * - Setting up a new local environment
 * - Local database was corrupted
 *
 * ⚠️  WARNING: This will OVERWRITE all local data with remote data!
 *
 * Strategy: Full table replacement (TRUNCATE + INSERT)
 * - Pulls everything from remote
 * - Replaces all local data
 * - Use --dry-run first to preview
 *
 * Usage:
 *   npx tsx scripts/restore-from-remote.ts --dry-run   # Preview (RECOMMENDED FIRST)
 *   npx tsx scripts/restore-from-remote.ts --confirm   # Actually restore
 *   npx tsx scripts/restore-from-remote.ts --confirm --tables trades,positions
 *
 * Environment:
 *   DATABASE_URL_POOLER  - Local Supabase connection (destination)
 *   DATABASE_URL_REMOTE  - Remote Supabase connection (source)
 */

import { execSync, spawnSync } from 'child_process';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// Load environment - use script directory to find .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '..', '.env.local') });

// Use PostgreSQL 17 to match local Supabase server version (17.6)
const PSQL_PATH = '/opt/homebrew/opt/postgresql@17/bin/psql';
const PG_DUMP_PATH = '/opt/homebrew/opt/postgresql@17/bin/pg_dump';

// Connection strings
const LOCAL_DB = process.env.DATABASE_URL_POOLER;
const REMOTE_DB = process.env.DATABASE_URL_REMOTE;

// All tables to restore (in dependency order - parents before children)
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
  'thesis_monitoring_configs',
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

  // Logging
  'ingestion_runs',
];

interface RestoreOptions {
  tables?: string[];
  dryRun?: boolean;
  verbose?: boolean;
  confirmed?: boolean;
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
    return -1;
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

function restoreTable(table: string, options: RestoreOptions): { success: boolean; rows: number; error?: string } {
  const { dryRun, verbose } = options;

  // Check if table exists on remote
  if (!tableExists(REMOTE_DB!, table)) {
    if (verbose) log(`  [${table}] Skipped - doesn't exist on remote`);
    return { success: true, rows: 0 };
  }

  const remoteCount = getTableCount(REMOTE_DB!, table);
  const localCountBefore = getTableCount(LOCAL_DB!, table);

  if (verbose) {
    log(`  [${table}] Remote: ${remoteCount} rows, Local: ${localCountBefore} rows`);
  }

  if (dryRun) {
    log(`  [${table}] Would restore ${remoteCount} rows (replacing ${localCountBefore} local rows)`);
    return { success: true, rows: remoteCount };
  }

  const tempFile = `/tmp/restore_${table}_${Date.now()}.sql`;

  try {
    // Dump from remote with INSERT statements (use public schema explicitly)
    const dumpResult = spawnSync(
      PG_DUMP_PATH,
      [
        REMOTE_DB!,
        `--table=public.${table}`,
        '--data-only',
        '--column-inserts',
        '--no-owner',
        '--no-privileges',
        `-f${tempFile}`,
      ],
      { encoding: 'utf-8' }
    );

    if (dumpResult.status !== 0) {
      throw new Error(dumpResult.stderr || 'pg_dump failed');
    }

    // Truncate local table
    execPsql(LOCAL_DB!, `TRUNCATE "${table}" CASCADE`);

    // Restore to local - prepend search_path to the file
    execSync(`echo 'SET search_path TO public;' | cat - ${tempFile} > ${tempFile}.tmp && mv ${tempFile}.tmp ${tempFile}`);
    const restoreResult = spawnSync(PSQL_PATH, [LOCAL_DB!, '-f', tempFile], {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    });

    if (restoreResult.status !== 0) {
      throw new Error(restoreResult.stderr || 'psql restore failed');
    }

    // Cleanup temp file
    execSync(`rm -f ${tempFile}`);

    const localCountAfter = getTableCount(LOCAL_DB!, table);

    if (verbose) {
      log(`  [${table}] ✅ Restored ${localCountAfter} rows`);
    }

    return { success: true, rows: localCountAfter };
  } catch (error: any) {
    execSync(`rm -f ${tempFile}`);
    return { success: false, rows: 0, error: error.message };
  }
}

async function promptConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Type "RESTORE" to confirm: ', (answer) => {
      rl.close();
      resolve(answer === 'RESTORE');
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  const options: RestoreOptions = {
    tables: undefined,
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('--dry-run'),
    confirmed: args.includes('--confirm'),
  };

  // Parse --tables
  const tablesIdx = args.indexOf('--tables');
  if (tablesIdx >= 0 && args[tablesIdx + 1]) {
    options.tables = args[tablesIdx + 1].split(',');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📥 Restore Remote → Local Supabase');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Validate connections
  if (!LOCAL_DB) {
    console.error('❌ DATABASE_URL_POOLER not set (local connection)');
    process.exit(1);
  }

  if (!REMOTE_DB) {
    console.error('❌ DATABASE_URL_REMOTE not set');
    process.exit(1);
  }

  // Test connections
  log('Testing connections...');
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

  const tablesToRestore = options.tables || ALL_TABLES;

  if (options.dryRun) {
    console.log('');
    log('🔍 DRY RUN MODE - No changes will be made');
    console.log('');
    log(`Would restore ${tablesToRestore.length} tables...`);
    console.log('');
  } else {
    // Require explicit confirmation for destructive operation
    if (!options.confirmed) {
      console.log('');
      console.log('⚠️  WARNING: This will OVERWRITE all local data!');
      console.log('');
      console.log('Use --dry-run first to preview changes.');
      console.log('Use --confirm to actually restore.');
      console.log('');
      process.exit(1);
    }

    console.log('');
    console.log('⚠️  WARNING: This will OVERWRITE all local data with remote data!');
    console.log('');

    const confirmed = await promptConfirmation();
    if (!confirmed) {
      console.log('');
      log('Aborted.');
      process.exit(0);
    }

    console.log('');
    log(`Restoring ${tablesToRestore.length} tables...`);
    console.log('');
  }

  let totalRows = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors: { table: string; error: string }[] = [];

  for (const table of tablesToRestore) {
    const result = restoreTable(table, options);

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
  console.log('  📊 Restore Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Tables restored: ${successCount}/${tablesToRestore.length}`);
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
