import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dns from 'dns';
import * as schema from './schema';

// Debug: Log connection info on initialization
const poolerUrl = process.env.DATABASE_URL_POOLER || '';
console.log(`[db/index.ts] DATABASE_URL_POOLER set: ${poolerUrl ? 'YES' : 'NO'}`);
console.log(`[db/index.ts] URL length: ${poolerUrl.length}`);
console.log(`[db/index.ts] URL host: ${poolerUrl.includes('db.wvukk') ? 'direct' : poolerUrl.includes('pooler.supabase') ? 'pooler' : 'unknown'}`);

// Configure DNS to use Google DNS for better resolution
// This helps with IPv6-only hostnames like Supabase direct connections
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Get connection type preference (defaults to 'pooler' for better compatibility)
// Set USE_DIRECT_CONNECTION=true to use direct connection (requires IPv6)
const useDirectConnection = process.env.USE_DIRECT_CONNECTION === 'true';

// Get connection strings from environment
const directConnectionString = process.env.DATABASE_URL_DIRECT;
const poolerConnectionString = process.env.DATABASE_URL_POOLER;

// Select connection string based on preference
const connectionString = useDirectConnection ? directConnectionString : poolerConnectionString;

if (!connectionString) {
  const missing = useDirectConnection 
    ? 'DATABASE_URL_DIRECT' 
    : 'DATABASE_URL_POOLER';
  throw new Error(
    `${missing} must be set in .env.local. ` +
    `Get connection strings from Supabase Dashboard > Settings > Database > Connection string`
  );
}

// Disable prefetch as it's not supported in serverless environments
// Connection pooling is handled by Supabase
const client = postgres(connectionString, {
  prepare: false,
  max: 10, // Allow multiple connections to prevent blocking (pooler handles pooling)
  connect_timeout: 10, // Connection timeout in seconds
  idle_timeout: 20, // Idle timeout in seconds
  max_lifetime: 60 * 30, // Max connection lifetime in seconds (30 minutes)
  ssl: { rejectUnauthorized: false }, // Required for Supabase direct connections
  onnotice: (notice) => console.log('[postgres] Notice:', notice),
  debug: (connection, query, params) => {
    if (process.env.DEBUG_DB === 'true') {
      console.log('[postgres] Query:', query?.substring(0, 100));
    }
  },
});

export const db = drizzle(client, { schema });

