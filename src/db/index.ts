import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Get connection string from environment
// For Supabase, use the direct Postgres connection string from:
// Dashboard > Settings > Database > Connection string > URI
// Or set DATABASE_URL in .env.local
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL must be set in .env.local. ' +
    'Get it from Supabase Dashboard > Settings > Database > Connection string (URI mode)'
  );
}

// Disable prefetch as it's not supported in serverless environments
// Connection pooling is handled by Supabase
const client = postgres(connectionString, { 
  prepare: false,
  max: 1, // Single connection for serverless
});

export const db = drizzle(client);

