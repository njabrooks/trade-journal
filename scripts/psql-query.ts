#!/usr/bin/env tsx

/**
 * Helper script to execute PostgreSQL queries via postgres.js (no psql binary needed)
 * Loads DATABASE_URL_POOLER from .env.local and executes SQL
 *
 * Usage:
 *   npx tsx scripts/psql-query.ts "SELECT * FROM macro_theses LIMIT 1"
 *   npx tsx scripts/psql-query.ts "SELECT ..." --format json
 *   npx tsx scripts/psql-query.ts "SELECT ..." --format table
 *   npx tsx scripts/psql-query.ts "SELECT ..." --format csv
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL_POOLER;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL_POOLER not found in .env.local');
  process.exit(1);
}

// Get SQL query from command line args
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Error: No SQL query provided');
  console.error('Usage: npx tsx scripts/psql-query.ts "SELECT ..."');
  process.exit(1);
}

const query = args[0];
const format = args.includes('--format')
  ? args[args.indexOf('--format') + 1]
  : 'json';

const sql = postgres(DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
});

async function main() {
  const rows = await sql.unsafe(query);

  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
  } else if (format === 'table') {
    if (rows.length === 0) {
      console.log('(0 rows)');
    } else {
      const cols = Object.keys(rows[0]);
      // Calculate column widths
      const widths = cols.map((c: string) =>
        Math.max(c.length, ...rows.map((r: any) => String(r[c] ?? '').length))
      );
      // Header
      console.log(cols.map((c: string, i: number) => c.padEnd(widths[i])).join(' | '));
      console.log(widths.map((w: number) => '-'.repeat(w)).join('-+-'));
      // Rows
      for (const row of rows) {
        console.log(cols.map((c: string, i: number) => String(row[c] ?? '').padEnd(widths[i])).join(' | '));
      }
      console.log(`(${rows.length} rows)`);
    }
  } else if (format === 'csv') {
    if (rows.length > 0) {
      for (const row of rows) {
        console.log(Object.values(row).join(','));
      }
    }
  } else {
    // Raw: one value per line
    for (const row of rows) {
      console.log(Object.values(row).join('|'));
    }
  }

  await sql.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Error executing query:');
  console.error(e.message);
  await sql.end();
  process.exit(1);
});
