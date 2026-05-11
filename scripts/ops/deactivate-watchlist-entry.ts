#!/usr/bin/env tsx

/**
 * Deactivate (or reactivate) a ticker in the scanner watchlist.
 *
 * Deactivation leaves the row in place for audit; the scanner only reads
 * is_active = true rows. To reactivate, pass --activate.
 *
 * Usage:
 *   npx tsx scripts/ops/deactivate-watchlist-entry.ts --ticker VXX
 *   npx tsx scripts/ops/deactivate-watchlist-entry.ts --ticker VXX --activate
 */

import { db, closeDb, schema } from '../lib/db.js';
import { and, eq } from 'drizzle-orm';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ticker = typeof args.ticker === 'string' ? args.ticker : '';
  const activate = args.activate === true;

  if (!ticker) {
    console.error('Required: --ticker');
    console.error('Optional: --activate (to reactivate instead of deactivate)');
    process.exit(1);
  }

  const normTicker = ticker.toUpperCase();

  const rows = await db
    .select({
      watchlistId: schema.watchlistEntries.id,
      underlyingId: schema.underlyings.id,
      ticker: schema.underlyings.ticker,
      isActive: schema.watchlistEntries.isActive,
    })
    .from(schema.watchlistEntries)
    .innerJoin(
      schema.underlyings,
      eq(schema.underlyings.id, schema.watchlistEntries.underlyingId)
    )
    .where(eq(schema.underlyings.ticker, normTicker));

  if (rows.length === 0) {
    console.error(`No watchlist entry found for ticker: ${normTicker}`);
    await closeDb();
    process.exit(1);
  }

  const updated = await db
    .update(schema.watchlistEntries)
    .set({ isActive: activate, updatedAt: new Date() })
    .where(eq(schema.watchlistEntries.id, rows[0].watchlistId))
    .returning({
      id: schema.watchlistEntries.id,
      isActive: schema.watchlistEntries.isActive,
    });

  console.log(
    JSON.stringify(
      {
        success: true,
        ticker: normTicker,
        action: activate ? 'reactivated' : 'deactivated',
        entry: updated[0],
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
