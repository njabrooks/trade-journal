#!/usr/bin/env tsx

/**
 * Create a new underlying asset
 *
 * Usage:
 *   npx tsx scripts/ops/create-underlying.ts \
 *     --ticker KWEB \
 *     --name "KraneShares CSI China Internet ETF"
 *
 * Required: --ticker, --name
 */

import { db, closeDb, schema } from '../lib/db.js';
import { eq } from 'drizzle-orm';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      args[key] = argv[i + 1] || '';
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { ticker, name } = args;

  if (!ticker || !name) {
    console.error('Required: --ticker, --name');
    process.exit(1);
  }

  const normalizedTicker = ticker.toUpperCase();

  // Check if it already exists
  const existing = await db.select({ id: schema.underlyings.id })
    .from(schema.underlyings)
    .where(eq(schema.underlyings.ticker, normalizedTicker));

  if (existing.length > 0) {
    console.error(`Underlying already exists: ${normalizedTicker} (id: ${existing[0].id})`);
    process.exit(1);
  }

  const [inserted] = await db.insert(schema.underlyings).values({
    ticker: normalizedTicker,
    name,
  }).returning({ id: schema.underlyings.id, ticker: schema.underlyings.ticker, name: schema.underlyings.name });

  console.log(JSON.stringify({
    success: true,
    ...inserted,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
