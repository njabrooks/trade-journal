/**
 * FRED Historical Data Ingestion Script
 *
 * Fetches economic data from the FRED API and stores it in the database.
 * Supports both full backfill and incremental daily updates.
 *
 * Usage:
 *   npx tsx scripts/ingest-fred-historical.ts                    # Update all configured series
 *   npx tsx scripts/ingest-fred-historical.ts --series DGS10     # Update specific series
 *   npx tsx scripts/ingest-fred-historical.ts --backfill         # Full historical backfill
 *   npx tsx scripts/ingest-fred-historical.ts --backfill-years 5 # Backfill last 5 years
 *   npx tsx scripts/ingest-fred-historical.ts --list             # List configured series
 *
 * Environment:
 *   FRED_API_KEY - Your FRED API key (required)
 *   DATABASE_URL_POOLER - Database connection string
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, sql, desc, and, gte, isNotNull } from 'drizzle-orm';

const { fredSeriesMetadata, fredObservations, thesisFredIndicators } = schema;

// FRED API configuration
const FRED_API_BASE = 'https://api.stlouisfed.org/fred';
const FRED_API_KEY = process.env.FRED_API_KEY;

// Rate limiting: FRED allows 120 requests/minute
const RATE_LIMIT_DELAY_MS = 600; // ~100 requests/minute to be safe

// Default series to track (aligned with docs/reference/fred-indicators-by-thesis.md)
const DEFAULT_SERIES: FredSeriesConfig[] = [
  // Interest Rates
  { seriesId: 'DGS2', category: 'interest_rates', title: '2-Year Treasury Constant Maturity Rate' },
  { seriesId: 'DGS10', category: 'interest_rates', title: '10-Year Treasury Constant Maturity Rate' },
  { seriesId: 'DGS30', category: 'interest_rates', title: '30-Year Treasury Constant Maturity Rate' },
  { seriesId: 'FEDFUNDS', category: 'interest_rates', title: 'Federal Funds Effective Rate' },
  { seriesId: 'DFEDTARU', category: 'interest_rates', title: 'Federal Funds Target Range - Upper Limit' },
  { seriesId: 'MORTGAGE30US', category: 'interest_rates', title: '30-Year Fixed Rate Mortgage Average' },

  // Yield Curve
  { seriesId: 'T10Y2Y', category: 'interest_rates', title: '10-Year Treasury Minus 2-Year Treasury' },
  { seriesId: 'T10Y3M', category: 'interest_rates', title: '10-Year Treasury Minus 3-Month Treasury' },

  // Inflation
  { seriesId: 'CPIAUCSL', category: 'inflation', title: 'Consumer Price Index for All Urban Consumers' },
  { seriesId: 'CPILFESL', category: 'inflation', title: 'Core CPI (All Items Less Food and Energy)' },
  { seriesId: 'PCEPI', category: 'inflation', title: 'Personal Consumption Expenditures: Price Index' },
  { seriesId: 'PCEPILFE', category: 'inflation', title: 'Core PCE Price Index (Excluding Food and Energy)' },
  { seriesId: 'T5YIE', category: 'inflation', title: '5-Year Breakeven Inflation Rate' },
  { seriesId: 'T10YIE', category: 'inflation', title: '10-Year Breakeven Inflation Rate' },
  { seriesId: 'PPIACO', category: 'inflation', title: 'Producer Price Index: All Commodities' },

  // Labor Market
  { seriesId: 'UNRATE', category: 'labor', title: 'Unemployment Rate' },
  { seriesId: 'PAYEMS', category: 'labor', title: 'All Employees, Total Nonfarm' },
  { seriesId: 'ICSA', category: 'labor', title: 'Initial Claims' },
  { seriesId: 'AHETPI', category: 'labor', title: 'Average Hourly Earnings: Total Private' },
  { seriesId: 'MANEMP', category: 'labor', title: 'All Employees: Manufacturing' },

  // Output & Activity
  { seriesId: 'GDPC1', category: 'output', title: 'Real Gross Domestic Product' },
  { seriesId: 'INDPRO', category: 'output', title: 'Industrial Production Index' },
  { seriesId: 'TCU', category: 'output', title: 'Capacity Utilization: Total Industry' },
  { seriesId: 'DGORDER', category: 'output', title: 'Durable Goods Orders' },
  { seriesId: 'RSAFS', category: 'output', title: 'Advance Retail Sales: Food Services' },

  // Credit & Spreads
  { seriesId: 'BAMLH0A0HYM2', category: 'credit', title: 'ICE BofA US High Yield Option-Adjusted Spread' },
  { seriesId: 'BAMLC0A0CM', category: 'credit', title: 'ICE BofA US Corporate Index Option-Adjusted Spread' },
  { seriesId: 'TEDRATE', category: 'credit', title: 'TED Spread' },
  { seriesId: 'DRTSCILM', category: 'credit', title: 'Net % of Domestic Banks Tightening C&I Loans' },
  { seriesId: 'BUSLOANS', category: 'credit', title: 'Commercial and Industrial Loans' },
  { seriesId: 'TOTLL', category: 'credit', title: 'Total Loans and Leases of Commercial Banks' },

  // Money & Liquidity
  { seriesId: 'M2SL', category: 'money', title: 'M2 Money Stock' },
  { seriesId: 'WALCL', category: 'money', title: 'Federal Reserve Total Assets' },
  { seriesId: 'RRPONTSYD', category: 'money', title: 'Overnight Reverse Repurchase Agreements' },
  { seriesId: 'BOGMBASE', category: 'money', title: 'Monetary Base' },
  { seriesId: 'WRESBAL', category: 'money', title: 'Reserve Balances with Federal Reserve Banks' },

  // Currency
  { seriesId: 'DTWEXBGS', category: 'currency', title: 'Trade Weighted US Dollar Index: Broad' },
  { seriesId: 'DTWEXAFEGS', category: 'currency', title: 'Trade Weighted US Dollar: Advanced Foreign Economies' },
  { seriesId: 'DTWEXEMEGS', category: 'currency', title: 'Trade Weighted US Dollar: Emerging Market Economies' },
  { seriesId: 'DEXJPUS', category: 'currency', title: 'Japanese Yen to US Dollar Spot Exchange Rate' },

  // Housing
  { seriesId: 'HOUST', category: 'housing', title: 'Housing Starts' },
  { seriesId: 'PERMIT', category: 'housing', title: 'Building Permits' },
  { seriesId: 'CSUSHPINSA', category: 'housing', title: 'S&P/Case-Shiller U.S. National Home Price Index' },
  { seriesId: 'HSN1F', category: 'housing', title: 'New One Family Houses Sold' },

  // Fiscal
  { seriesId: 'GFDEBTN', category: 'fiscal', title: 'Federal Debt: Total Public Debt' },
  { seriesId: 'FYFSD', category: 'fiscal', title: 'Federal Surplus or Deficit' },
  { seriesId: 'FDHBFIN', category: 'fiscal', title: 'Federal Debt Held by Foreign Investors' },

  // Sentiment
  { seriesId: 'UMCSENT', category: 'sentiment', title: 'University of Michigan: Consumer Sentiment' },

  // Energy
  { seriesId: 'DCOILWTICO', category: 'energy', title: 'Crude Oil Prices: West Texas Intermediate (WTI)' },
];

interface FredSeriesConfig {
  seriesId: string;
  category: string;
  title: string;
}

interface FredSeriesInfo {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonal_adjustment: string;
  observation_start: string;
  observation_end: string;
  notes: string;
}

interface FredObservation {
  date: string;
  value: string;
}

// Helper to sleep for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch series metadata from FRED API
async function fetchSeriesInfo(seriesId: string): Promise<FredSeriesInfo | null> {
  const url = `${FRED_API_BASE}/series?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch series info for ${seriesId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.seriess || data.seriess.length === 0) {
      console.error(`No series found for ${seriesId}`);
      return null;
    }

    return data.seriess[0];
  } catch (error) {
    console.error(`Error fetching series info for ${seriesId}:`, error);
    return null;
  }
}

// Fetch observations from FRED API
async function fetchObservations(
  seriesId: string,
  startDate?: string,
  endDate?: string
): Promise<FredObservation[]> {
  let url = `${FRED_API_BASE}/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json`;

  if (startDate) url += `&observation_start=${startDate}`;
  if (endDate) url += `&observation_end=${endDate}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch observations for ${seriesId}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.observations || [];
  } catch (error) {
    console.error(`Error fetching observations for ${seriesId}:`, error);
    return [];
  }
}

// Upsert series metadata
async function upsertSeriesMetadata(
  seriesId: string,
  info: FredSeriesInfo,
  category: string
): Promise<void> {
  await db
    .insert(fredSeriesMetadata)
    .values({
      seriesId,
      title: info.title,
      frequency: info.frequency.toLowerCase(),
      units: info.units,
      seasonalAdjustment: info.seasonal_adjustment,
      observationStart: info.observation_start,
      observationEnd: info.observation_end,
      notes: info.notes?.substring(0, 2000), // Truncate long notes
      category,
    })
    .onConflictDoUpdate({
      target: fredSeriesMetadata.seriesId,
      set: {
        title: info.title,
        frequency: info.frequency.toLowerCase(),
        units: info.units,
        seasonalAdjustment: info.seasonal_adjustment,
        observationStart: info.observation_start,
        observationEnd: info.observation_end,
        notes: info.notes?.substring(0, 2000),
        category,
        updatedAt: new Date(),
      },
    });
}

// Parse FRED value (handles '.' for missing data)
function parseValue(value: string): number | null {
  if (value === '.' || value === '' || value === 'NA') {
    return null;
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

// Insert observations with computed change fields
async function insertObservations(
  seriesId: string,
  observations: FredObservation[]
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  // Sort observations by date ascending
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));

  // Build a map of date -> value for computing changes
  const valueMap = new Map<string, number | null>();
  for (const obs of sorted) {
    valueMap.set(obs.date, parseValue(obs.value));
  }

  // Prepare insert batch
  const batchSize = 100;
  const toInsert: Array<{
    seriesId: string;
    observationDate: string;
    value: string | null;
    value1dChange: string | null;
    value1dPctChange: string | null;
    value5dChange: string | null;
    value20dChange: string | null;
  }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const obs = sorted[i];
    const currentValue = parseValue(obs.value);

    // Compute changes (look back in the sorted array)
    let value1dChange: number | null = null;
    let value1dPctChange: number | null = null;
    let value5dChange: number | null = null;
    let value20dChange: number | null = null;

    if (currentValue !== null && i > 0) {
      // 1-day change (previous observation)
      const prev1d = sorted[i - 1] ? parseValue(sorted[i - 1].value) : null;
      if (prev1d !== null) {
        value1dChange = currentValue - prev1d;
        value1dPctChange = prev1d !== 0 ? (value1dChange / prev1d) * 100 : null;
      }

      // 5-day change (5 observations back)
      if (i >= 5) {
        const prev5d = parseValue(sorted[i - 5].value);
        if (prev5d !== null) {
          value5dChange = currentValue - prev5d;
        }
      }

      // 20-day change (20 observations back)
      if (i >= 20) {
        const prev20d = parseValue(sorted[i - 20].value);
        if (prev20d !== null) {
          value20dChange = currentValue - prev20d;
        }
      }
    }

    toInsert.push({
      seriesId,
      observationDate: obs.date,
      value: currentValue?.toString() ?? null,
      value1dChange: value1dChange?.toString() ?? null,
      value1dPctChange: value1dPctChange?.toString() ?? null,
      value5dChange: value5dChange?.toString() ?? null,
      value20dChange: value20dChange?.toString() ?? null,
    });

    // Insert in batches
    if (toInsert.length >= batchSize || i === sorted.length - 1) {
      try {
        await db
          .insert(fredObservations)
          .values(toInsert)
          .onConflictDoNothing(); // Skip duplicates

        inserted += toInsert.length;
      } catch (error) {
        console.error(`Error inserting batch for ${seriesId}:`, error);
        skipped += toInsert.length;
      }
      toInsert.length = 0; // Clear batch
    }
  }

  return { inserted, skipped };
}

// Get the latest observation date for a series
async function getLatestObservationDate(seriesId: string): Promise<string | null> {
  const [latest] = await db
    .select({ date: fredObservations.observationDate })
    .from(fredObservations)
    .where(eq(fredObservations.seriesId, seriesId))
    .orderBy(desc(fredObservations.observationDate))
    .limit(1);

  return latest?.date || null;
}

// Get all series that are linked to theses
async function getLinkedSeries(): Promise<string[]> {
  const linked = await db
    .selectDistinct({ seriesId: thesisFredIndicators.seriesId })
    .from(thesisFredIndicators)
    .where(eq(thesisFredIndicators.enabled, true));

  return linked.map(l => l.seriesId);
}

// Main ingestion function
async function ingestFredData(options: {
  series?: string[];
  backfill?: boolean;
  backfillYears?: number;
  list?: boolean;
}): Promise<void> {
  if (!FRED_API_KEY) {
    console.error('❌ FRED_API_KEY environment variable is required');
    process.exit(1);
  }

  // List mode: just show configured series
  if (options.list) {
    console.log('\n📊 Configured FRED Series:\n');
    const grouped = DEFAULT_SERIES.reduce((acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    }, {} as Record<string, FredSeriesConfig[]>);

    for (const [category, series] of Object.entries(grouped)) {
      console.log(`\n${category.toUpperCase()}:`);
      for (const s of series) {
        console.log(`  ${s.seriesId.padEnd(15)} ${s.title}`);
      }
    }
    return;
  }

  // Determine which series to fetch
  let seriesToFetch: FredSeriesConfig[];

  if (options.series && options.series.length > 0) {
    // Specific series requested
    seriesToFetch = options.series.map(seriesId => {
      const config = DEFAULT_SERIES.find(s => s.seriesId === seriesId);
      return config || { seriesId, category: 'other', title: seriesId };
    });
  } else {
    // Use default series + any linked series not in defaults
    const linkedSeries = await getLinkedSeries();
    const defaultIds = new Set(DEFAULT_SERIES.map(s => s.seriesId));
    const additionalSeries = linkedSeries
      .filter(id => !defaultIds.has(id))
      .map(seriesId => ({ seriesId, category: 'linked', title: seriesId }));

    seriesToFetch = [...DEFAULT_SERIES, ...additionalSeries];
  }

  console.log(`\n📊 FRED Data Ingestion Starting`);
  console.log(`   Series to fetch: ${seriesToFetch.length}`);
  console.log(`   Mode: ${options.backfill ? `Backfill (${options.backfillYears || 10} years)` : 'Incremental update'}\n`);

  // Calculate backfill start date
  let backfillStartDate: string | undefined;
  if (options.backfill) {
    const years = options.backfillYears || 10;
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    backfillStartDate = date.toISOString().split('T')[0];
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const series of seriesToFetch) {
    console.log(`\n📈 Processing ${series.seriesId}...`);

    // Fetch and store metadata
    const info = await fetchSeriesInfo(series.seriesId);
    if (info) {
      await upsertSeriesMetadata(series.seriesId, info, series.category);
      console.log(`   ✅ Metadata updated: ${info.title.substring(0, 50)}...`);
    } else {
      console.log(`   ⚠️ Could not fetch metadata`);
    }

    await sleep(RATE_LIMIT_DELAY_MS);

    // Determine start date for observations
    let startDate: string | undefined;

    if (options.backfill) {
      startDate = backfillStartDate;
    } else {
      // Incremental: start from day after latest observation
      const latest = await getLatestObservationDate(series.seriesId);
      if (latest) {
        const nextDay = new Date(latest);
        nextDay.setDate(nextDay.getDate() + 1);
        startDate = nextDay.toISOString().split('T')[0];
        console.log(`   📅 Fetching since ${startDate} (latest: ${latest})`);
      } else {
        // No existing data - do a 2-year backfill by default
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        startDate = twoYearsAgo.toISOString().split('T')[0];
        console.log(`   📅 No existing data, fetching since ${startDate}`);
      }
    }

    // Fetch observations
    const observations = await fetchObservations(series.seriesId, startDate);
    console.log(`   📥 Fetched ${observations.length} observations`);

    await sleep(RATE_LIMIT_DELAY_MS);

    if (observations.length > 0) {
      const { inserted, skipped } = await insertObservations(series.seriesId, observations);
      console.log(`   ✅ Inserted: ${inserted}, Skipped: ${skipped}`);
      totalInserted += inserted;
      totalSkipped += skipped;
    }
  }

  console.log(`\n✅ FRED Ingestion Complete`);
  console.log(`   Total inserted: ${totalInserted}`);
  console.log(`   Total skipped: ${totalSkipped}`);
}

// Parse command line arguments
function parseArgs(): { series?: string[]; backfill?: boolean; backfillYears?: number; list?: boolean } {
  const args = process.argv.slice(2);
  const options: { series?: string[]; backfill?: boolean; backfillYears?: number; list?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--series':
        options.series = args[++i]?.split(',').map(s => s.trim().toUpperCase());
        break;
      case '--backfill':
        options.backfill = true;
        break;
      case '--backfill-years':
        options.backfillYears = parseInt(args[++i], 10);
        options.backfill = true;
        break;
      case '--list':
        options.list = true;
        break;
    }
  }

  return options;
}

// Main entry point
async function main() {
  const options = parseArgs();

  try {
    await ingestFredData(options);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
