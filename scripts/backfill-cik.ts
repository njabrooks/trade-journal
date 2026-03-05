/**
 * Backfill CIK Numbers for Existing Underlyings
 *
 * One-time script that fetches the SEC company_tickers.json mapping
 * and populates underlyings.cik for any matching tickers.
 *
 * Usage:
 *   npx tsx scripts/backfill-cik.ts
 *   npx tsx scripts/backfill-cik.ts --dry-run
 *
 * SEC rate limit: Includes User-Agent header, 150ms delay between updates.
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, isNull } from 'drizzle-orm';

const { underlyings } = schema;

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'TradeJournal/1.0 (admin@example.com)';

interface SecCompanyEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n=== Backfill CIK Numbers ===');
  if (dryRun) console.log('Mode: DRY-RUN (no database updates)');

  // 1. Fetch SEC company tickers mapping
  console.log('\nFetching SEC company_tickers.json...');
  const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
  }

  const data: Record<string, SecCompanyEntry> = await response.json();
  const entries = Object.values(data);
  console.log(`  Loaded ${entries.length} SEC company entries`);

  // Build ticker -> CIK lookup (uppercase keys)
  const tickerToCik = new Map<string, string>();
  for (const entry of entries) {
    tickerToCik.set(entry.ticker.toUpperCase(), String(entry.cik_str));
  }

  // 2. Get all underlyings without CIK
  const rows = await db
    .select({ id: underlyings.id, ticker: underlyings.ticker, cik: underlyings.cik })
    .from(underlyings);

  const needsCik = rows.filter((r) => !r.cik);
  const alreadyHasCik = rows.filter((r) => r.cik);

  console.log(`\n  Total underlyings: ${rows.length}`);
  console.log(`  Already have CIK: ${alreadyHasCik.length}`);
  console.log(`  Need CIK lookup: ${needsCik.length}`);

  // 3. Match and update
  let matched = 0;
  let unmatched = 0;
  const unmatchedTickers: string[] = [];

  for (const row of needsCik) {
    const cik = tickerToCik.get(row.ticker.toUpperCase());

    if (cik) {
      matched++;
      if (dryRun) {
        console.log(`  [DRY-RUN] Would set ${row.ticker} -> CIK ${cik}`);
      } else {
        await db
          .update(underlyings)
          .set({ cik, updatedAt: new Date() })
          .where(eq(underlyings.id, row.id));
        console.log(`  Updated ${row.ticker} -> CIK ${cik}`);
        await sleep(150);
      }
    } else {
      unmatched++;
      unmatchedTickers.push(row.ticker);
    }
  }

  // 4. Summary
  console.log('\n=== Summary ===');
  console.log(`  Matched & updated: ${matched}`);
  console.log(`  No SEC match: ${unmatched}`);
  if (unmatchedTickers.length > 0) {
    console.log(`  Unmatched tickers: ${unmatchedTickers.join(', ')}`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
