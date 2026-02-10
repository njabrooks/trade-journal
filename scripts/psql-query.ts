#!/usr/bin/env tsx

/**
 * Helper script to execute PostgreSQL queries via psql
 * Loads DATABASE_URL_POOLER from .env.local and executes SQL
 *
 * Usage:
 *   npx tsx scripts/psql-query.ts "SELECT * FROM macro_theses LIMIT 1"
 *   npx tsx scripts/psql-query.ts "INSERT INTO ..." --format json
 */

import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

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

// Build psql command - use PATH-based psql for version flexibility
const psqlPath = '/opt/homebrew/bin/psql';
let psqlCommand: string;

if (format === 'json') {
  // Return results as JSON (one JSON object per row)
  psqlCommand = `${psqlPath} "${DATABASE_URL}" -c "SELECT row_to_json(t) as data FROM (${query}) t" -t -A`;
} else if (format === 'table') {
  // Return results as formatted table
  psqlCommand = `${psqlPath} "${DATABASE_URL}" -c "${query.replace(/"/g, '\\"')}"`;
} else if (format === 'csv') {
  // Return results as CSV
  psqlCommand = `${psqlPath} "${DATABASE_URL}" -c "${query.replace(/"/g, '\\"')}" -t -A -F','`;
} else {
  // Default: return raw output
  psqlCommand = `${psqlPath} "${DATABASE_URL}" -c "${query.replace(/"/g, '\\"')}" -t -A`;
}

try {
  const result = execSync(psqlCommand, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (format === 'json' && result.trim()) {
    // Parse JSON lines and return as array
    const lines = result.trim().split('\n').filter(line => line.trim());
    const jsonResults = lines.map(line => JSON.parse(line));
    console.log(JSON.stringify(jsonResults, null, 2));
  } else {
    console.log(result);
  }
} catch (error: any) {
  console.error('Error executing query:');
  console.error(error.message);
  if (error.stderr) {
    console.error('PostgreSQL error:', error.stderr.toString());
  }
  process.exit(1);
}
