# Database Setup

This document covers the operational setup for database connectivity. For the complete schema specification, see [`db_schema_v1.md`](./db_schema_v1.md).

## Connection Configuration

Drizzle ORM is configured to connect to Supabase Postgres for runtime queries.

### Environment Variables

Add to `.env.local`:

```bash
# Direct Postgres connection string (for Drizzle)
# Get this from: Supabase Dashboard > Settings > Database > Connection string > URI
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres

# Supabase client (for client-side queries if needed)
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
```

### Getting the Connection String

1. Go to Supabase Dashboard
2. Select your project
3. Settings > Database
4. Scroll to "Connection string"
5. Select "URI" mode
6. Copy the connection string (replace `[YOUR-PASSWORD]` with your database password)

## Architecture

- **Schema Design**: Defined in [`db_schema_v1.md`](./db_schema_v1.md) - comprehensive table specifications
- **Schema Management**: Handled via Supabase MCP (migrations, type generation)
- **Runtime Queries**: Use Drizzle ORM from `src/db/`

## Usage

```typescript
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Example query
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, 1));
```

## Schema Definition Workflow

1. **Design**: Schema is specified in [`db_schema_v1.md`](./db_schema_v1.md)
2. **Create Tables**: Use Supabase MCP to create migrations based on the schema spec
3. **Generate Types**: Use MCP to generate TypeScript types from the database
4. **Define Drizzle Schemas**: Populate `src/db/schema.ts` with Drizzle table definitions that match your database structure
5. **Use in Code**: Import from `@/db` and `@/db/schema` for type-safe queries

The `src/db/schema.ts` file will be populated with Drizzle table definitions that match your database structure. Types can be generated via MCP and imported here for full type safety.

See [`db_schema_v1.md`](./db_schema_v1.md) Section 7 for implementation notes on creating tables via MCP and defining Drizzle schemas.

