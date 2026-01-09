/**
 * Database helper for standalone scripts
 *
 * IMPORTANT: This module uses top-level await to ensure dotenv loads
 * BEFORE creating the database client. This avoids the ES module
 * import hoisting issue where imports run before dotenv.config().
 *
 * Usage in scripts:
 *   import { db, closeDb } from './lib/db.js';
 *
 *   // Use db normally
 *   const results = await db.select().from(someTable);
 *
 *   // Always close connection when done
 *   await closeDb();
 *   process.exit(0);
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get project root (scripts/lib -> scripts -> project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Load dotenv FIRST - before any other imports that might need env vars
config({ path: join(projectRoot, '.env.local') });

// Now safe to import postgres and drizzle
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/db/schema.js';

// Validate env var exists
const connectionString = process.env.DATABASE_URL_POOLER;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL_POOLER must be set in .env.local.\n' +
    'Get connection strings from Supabase Dashboard > Settings > Database > Connection string'
  );
}

// Create postgres client with script-appropriate settings
const client = postgres(connectionString, {
  prepare: false,           // Required for Supabase pooler
  max: 1,                   // Scripts typically need only 1 connection
  connect_timeout: 10,      // 10 second timeout
  idle_timeout: 5,          // Close idle connections quickly
});

// Export drizzle db instance with full schema
export const db = drizzle(client, { schema });

// Export close function for clean script exit
export async function closeDb(): Promise<void> {
  await client.end();
}

// Re-export schema for convenience
export { schema };

/**
 * Log an action to the journal (script-compatible version)
 *
 * This is a copy of the logToJournal function from src/lib/workflow/lifecycleDetection.ts
 * that uses the script's db connection instead of the app's db connection.
 */
export async function logToJournal(entry: {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType: string;
  actionDescription: string;
  triageRecordId?: string;
  skillInvoked?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  rationale?: string;
  source: 'user' | 'skill' | 'automation';
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const result = await db
    .insert(schema.journalEntries)
    .values(entry)
    .returning({ id: schema.journalEntries.id });

  return result[0].id;
}
