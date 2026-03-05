/**
 * SEC Filing Ingestion Script
 *
 * Fetches recent SEC filings for all open portfolio holdings that have CIK values.
 * Classifies filings by type and upserts into sec_filings table.
 *
 * Usage:
 *   npx tsx scripts/ingest-sec-filings.ts              # Last 30 days
 *   npx tsx scripts/ingest-sec-filings.ts --days 60    # Last 60 days
 *   npx tsx scripts/ingest-sec-filings.ts --dry-run    # Preview without writing
 *   npx tsx scripts/ingest-sec-filings.ts --verbose    # Detailed logging
 *
 * SEC rate limit: 150ms delay between requests, User-Agent header required.
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, sql } from 'drizzle-orm';

const { secFilings, positions, underlyings } = schema;

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'TradeJournal/1.0 (admin@example.com)';

// ============================================================================
// Types
// ============================================================================

interface SecSubmissions {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

interface FilingRecord {
  underlyingId: string;
  ticker: string;
  cik: string;
  accessionNumber: string;
  filingType: string;
  filingCategory: string;
  filedDate: string;
  filingUrl: string;
  description: string | null;
  isMaterial: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { days: number; dryRun: boolean; verbose: boolean } {
  const args = process.argv.slice(2);
  let days = 30;
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  const daysIdx = args.indexOf('--days');
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    const parsed = parseInt(args[daysIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      days = parsed;
    }
  }

  return { days, dryRun, verbose };
}

/**
 * Classify a SEC form type into a category.
 */
function classifyFiling(formType: string): { category: string; isMaterial: boolean } {
  const form = formType.toUpperCase().trim();

  if (form === '10-K' || form === '10-K/A') {
    return { category: 'annual', isMaterial: true };
  }
  if (form === '10-Q' || form === '10-Q/A') {
    return { category: 'quarterly', isMaterial: true };
  }
  if (form.startsWith('8-K')) {
    return { category: 'current', isMaterial: true };
  }
  if (form === 'DEF 14A' || form === 'DEFA14A' || form === 'PRE 14A') {
    return { category: 'proxy', isMaterial: false };
  }
  if (form === '4' || form === '4/A' || form === 'FORM 4') {
    return { category: 'insider', isMaterial: false };
  }

  return { category: 'other', isMaterial: false };
}

/**
 * Build the filing URL from SEC components.
 * Accession numbers come as "0000320193-24-000081" (with dashes).
 */
function buildFilingUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const accessionNoDashes = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${primaryDocument}`;
}

/**
 * Pad CIK to 10 digits for the SEC submissions API.
 */
function padCik(cik: string): string {
  return cik.padStart(10, '0');
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Get distinct tickers with CIK from open positions joined to underlyings.
 */
async function getHoldingsWithCik(): Promise<Array<{ underlyingId: string; ticker: string; cik: string }>> {
  const rows = await db
    .selectDistinctOn([underlyings.ticker], {
      underlyingId: underlyings.id,
      ticker: underlyings.ticker,
      cik: underlyings.cik,
    })
    .from(positions)
    .innerJoin(underlyings, eq(positions.underlyingId, underlyings.id))
    .where(
      and(
        eq(positions.isOpen, true),
        sql`${underlyings.cik} IS NOT NULL`
      )
    );

  return rows.filter((r) => r.cik !== null) as Array<{ underlyingId: string; ticker: string; cik: string }>;
}

/**
 * Fetch recent filings from SEC EDGAR for a given CIK.
 */
async function fetchFilings(cik: string): Promise<SecSubmissions | null> {
  const paddedCik = padCik(cik);
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': SEC_USER_AGENT },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`SEC API ${response.status}: ${response.statusText}`);
    }

    return await response.json() as SecSubmissions;
  } catch (error) {
    console.error(`  Error fetching CIK ${cik}: ${error}`);
    return null;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { days, dryRun, verbose } = parseArgs();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  console.log('\n=== SEC Filing Ingestion ===');
  console.log(`  Lookback: ${days} days (since ${cutoffStr})`);
  if (dryRun) console.log('  Mode: DRY-RUN (no database writes)');

  // 1. Get holdings with CIK
  const holdings = await getHoldingsWithCik();
  console.log(`\n  Found ${holdings.length} open holdings with CIK values`);

  if (holdings.length === 0) {
    console.log('  No holdings with CIK. Run backfill-cik.ts first.');
    await closeDb();
    process.exit(0);
  }

  // 2. Fetch and process filings for each holding
  let totalFilings = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let errors = 0;

  for (const holding of holdings) {
    if (verbose) {
      console.log(`\n  Processing ${holding.ticker} (CIK: ${holding.cik})...`);
    }

    const submissions = await fetchFilings(holding.cik);
    if (!submissions) {
      if (verbose) console.log(`    No submissions found`);
      errors++;
      await sleep(150);
      continue;
    }

    const recent = submissions.filings.recent;
    const filingCount = recent.accessionNumber.length;

    // Filter to filings within our date range
    const records: FilingRecord[] = [];

    for (let i = 0; i < filingCount; i++) {
      const filingDate = recent.filingDate[i];

      // Stop scanning once we're past our cutoff (filings are sorted newest-first)
      if (filingDate < cutoffStr) break;

      const formType = recent.form[i];
      const { category, isMaterial } = classifyFiling(formType);

      records.push({
        underlyingId: holding.underlyingId,
        ticker: holding.ticker,
        cik: holding.cik,
        accessionNumber: recent.accessionNumber[i],
        filingType: formType,
        filingCategory: category,
        filedDate: filingDate,
        filingUrl: buildFilingUrl(holding.cik, recent.accessionNumber[i], recent.primaryDocument[i]),
        description: recent.primaryDocDescription[i] || null,
        isMaterial,
      });
    }

    totalFilings += records.length;

    if (verbose) {
      console.log(`    Found ${records.length} filings since ${cutoffStr}`);
    }

    // Upsert each filing
    for (const record of records) {
      if (dryRun) {
        console.log(`    [DRY-RUN] ${record.filedDate} ${record.filingType} (${record.filingCategory})${record.isMaterial ? ' [MATERIAL]' : ''}`);
        totalInserted++;
        continue;
      }

      try {
        const result = await db
          .insert(secFilings)
          .values(record)
          .onConflictDoNothing({ target: [secFilings.accessionNumber] })
          .returning({ id: secFilings.id });

        if (result.length > 0) {
          totalInserted++;
          if (verbose) {
            console.log(`    Inserted: ${record.filedDate} ${record.filingType} (${record.filingCategory})`);
          }
        } else {
          totalSkipped++;
          if (verbose) {
            console.log(`    Skipped (exists): ${record.filedDate} ${record.filingType}`);
          }
        }
      } catch (error) {
        console.error(`    Error inserting ${record.accessionNumber}: ${error}`);
        errors++;
      }
    }

    // Rate limit between ticker requests
    await sleep(150);
  }

  // 3. Summary
  console.log('\n=== Summary ===');
  console.log(`  Holdings processed: ${holdings.length}`);
  console.log(`  Filings found: ${totalFilings}`);
  console.log(`  New filings inserted: ${totalInserted}`);
  console.log(`  Already existed (skipped): ${totalSkipped}`);
  if (errors > 0) {
    console.log(`  Errors: ${errors}`);
  }

  await closeDb();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
