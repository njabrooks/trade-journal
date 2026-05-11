#!/usr/bin/env tsx

/**
 * Add a ticker to the options scanner watchlist.
 *
 * Auto-creates the underlying row if missing (with --name optional).
 * Idempotent — if the ticker is already on the watchlist, reports and exits 0.
 *
 * Usage:
 *   npx tsx scripts/ops/add-to-watchlist.ts --ticker VXX --reason "vol hedge"
 *   npx tsx scripts/ops/add-to-watchlist.ts --ticker ETHA --reason "ETH proxy" --priority high
 *   npx tsx scripts/ops/add-to-watchlist.ts --ticker SPACEX --name "SpaceX" --reason "manual"
 */

import { db, closeDb, schema } from '../lib/db.js';
import { eq } from 'drizzle-orm';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      args[key] = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { ticker, reason, name, notes } = args;
  const priority = (args.priority || 'normal') as 'high' | 'normal' | 'low';

  if (!ticker) {
    console.error('Required: --ticker');
    console.error('Optional: --reason, --priority {high|normal|low}, --name, --notes');
    process.exit(1);
  }
  if (!['high', 'normal', 'low'].includes(priority)) {
    console.error(`Invalid --priority: ${priority}. Must be high|normal|low.`);
    process.exit(1);
  }

  const normTicker = ticker.toUpperCase();

  // Find or create underlying
  const existing = await db
    .select({ id: schema.underlyings.id, name: schema.underlyings.name })
    .from(schema.underlyings)
    .where(eq(schema.underlyings.ticker, normTicker));

  let underlyingId: string;
  if (existing.length > 0) {
    underlyingId = existing[0].id;
  } else {
    const [inserted] = await db
      .insert(schema.underlyings)
      .values({ ticker: normTicker, name: name || null })
      .returning({ id: schema.underlyings.id });
    underlyingId = inserted.id;
    console.log(`Created new underlying: ${normTicker} (${underlyingId})`);
  }

  // Upsert watchlist entry
  const result = await db
    .insert(schema.watchlistEntries)
    .values({
      underlyingId,
      addedReason: reason || null,
      priority,
      isActive: true,
      notes: notes || null,
    })
    .onConflictDoUpdate({
      target: schema.watchlistEntries.underlyingId,
      set: {
        isActive: true,
        priority,
        ...(reason ? { addedReason: reason } : {}),
        ...(notes ? { notes } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({
      id: schema.watchlistEntries.id,
      isActive: schema.watchlistEntries.isActive,
      priority: schema.watchlistEntries.priority,
      addedReason: schema.watchlistEntries.addedReason,
    });

  console.log(
    JSON.stringify(
      {
        success: true,
        ticker: normTicker,
        underlyingId,
        watchlistEntry: result[0],
      },
      null,
      2
    )
  );

  await closeDb();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Error:', e);
  await closeDb();
  process.exit(1);
});
