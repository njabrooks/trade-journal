/**
 * Economic Calendar Ingestion Script
 *
 * Fetches upcoming economic events from two sources:
 *   1. FRED releases/dates API — US data release schedule
 *   2. Finnhub economic calendar — global events with impact ratings
 *
 * Merges both sources and upserts into the `economic_events` table.
 * Re-running updates actual values when past events have been published.
 *
 * Usage:
 *   npx tsx scripts/ingest-economic-calendar.ts           # Next 30 days
 *   npx tsx scripts/ingest-economic-calendar.ts --days 60 # Custom range
 *
 * Environment:
 *   FRED_API_KEY    - FRED API key (required for FRED source)
 *   FINNHUB_API_KEY - Finnhub API key (required for Finnhub source)
 *   DATABASE_URL_POOLER - Database connection string
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const { economicEvents } = schema;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FRED_API_BASE = 'https://api.stlouisfed.org/fred';
const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_RATE_LIMIT_MS = 600; // ~100 req/min to stay within 120/min limit

const FINNHUB_API_BASE = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_RATE_LIMIT_MS = 200; // 30 calls/sec free tier

// Maximum days per Finnhub request — we query in weekly chunks to keep
// response sizes manageable and ensure proper date attribution.
const FINNHUB_CHUNK_DAYS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FredRelease {
  id: number;
  name: string;
  link?: string;
}

interface FredReleaseDate {
  release_id: number;
  release_name?: string;
  date: string;
}

/**
 * Finnhub economic calendar event.
 * The `time` field is "HH:MM:SS" or empty string.
 * The `impact` field may be a word ("low"/"medium"/"high") or a number ("1"/"2"/"3").
 * Note: The API response may or may not include a per-event `date` field.
 * We handle both cases defensively — when missing, we query day-by-day.
 */
interface FinnhubEconomicEvent {
  actual?: number | null;
  country: string;
  estimate?: number | null;
  event: string;
  impact: string;
  prev?: number | null;
  time: string;
  unit?: string;
  // Not in official docs but may be present in practice
  date?: string;
}

interface EventRecord {
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  category: string | null;
  impact: string | null;
  country: string;
  actualValue: string | null;
  forecastValue: string | null;
  previousValue: string | null;
  unit: string | null;
  source: string;
  sourceId: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Add N days to a date and return a new Date. */
function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/** Map a FRED release name to a category via keyword matching. */
function categorizeFredRelease(name: string): string {
  const lower = name.toLowerCase();

  // Interest rates / monetary policy
  if (/fomc|federal funds|interest rate|treasury|discount rate|monetary policy/.test(lower)) {
    return 'interest_rates';
  }
  // Inflation
  if (/\bcpi\b|consumer price|pce|producer price|ppi|import.+price|export.+price|inflation/.test(lower)) {
    return 'inflation';
  }
  // Labor market
  if (/employment|nonfarm|payroll|jobless|unemployment|labor|initial claims|jolts|job openings/.test(lower)) {
    return 'labor';
  }
  // Output / activity
  if (/gdp|gross domestic|industrial production|capacity utilization|durable goods|retail sales|ism|pmi|manufacturing/.test(lower)) {
    return 'output';
  }
  // Housing
  if (/housing|home.+sale|building permit|construction|mortgage|case.shiller|existing home|new home|pending home/.test(lower)) {
    return 'housing';
  }
  // Consumer / sentiment
  if (/consumer confidence|consumer sentiment|michigan/.test(lower)) {
    return 'other';
  }
  // Trade
  if (/trade balance|import|export|current account/.test(lower)) {
    return 'other';
  }

  return 'other';
}

/** Map Finnhub impact to our schema. Finnhub uses both words and numbers. */
function mapFinnhubImpact(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const lower = String(raw).toLowerCase();
  if (lower === 'high' || lower === '3') return 'high';
  if (lower === 'medium' || lower === '2') return 'medium';
  if (lower === 'low' || lower === '1') return 'low';
  return null;
}

/** Map a Finnhub event name to a category via keyword matching. */
function categorizeFinnhubEvent(eventName: string): string {
  const lower = eventName.toLowerCase();

  if (/interest rate|fomc|fed fund|central bank|repo rate|base rate|bank rate|monetary policy|rate decision/.test(lower)) {
    return 'interest_rates';
  }
  if (/\bcpi\b|inflation|pce|ppi|consumer price|producer price|import price/.test(lower)) {
    return 'inflation';
  }
  if (/employment|nonfarm|payroll|unemployment|jobless|labor|claimant|job/.test(lower)) {
    return 'labor';
  }
  if (/gdp|industrial|manufacturing|pmi|ism|retail sales|durable goods|capacity/.test(lower)) {
    return 'output';
  }
  if (/housing|home sale|building permit|construction|mortgage/.test(lower)) {
    return 'housing';
  }

  return 'other';
}

// ---------------------------------------------------------------------------
// FRED: fetch release dates
// ---------------------------------------------------------------------------

/**
 * Fetches all FRED releases (paginated). Returns a map of release_id -> release.
 */
async function fetchFredReleases(): Promise<Map<number, FredRelease>> {
  const releases = new Map<number, FredRelease>();
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const url = `${FRED_API_BASE}/releases?api_key=${FRED_API_KEY}&file_type=json&limit=${limit}&offset=${offset}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`  FRED releases fetch failed (status ${resp.status})`);
      break;
    }
    const data = await resp.json();
    const items: FredRelease[] = data.releases || [];
    for (const r of items) {
      releases.set(r.id, r);
    }
    hasMore = items.length === limit;
    offset += limit;
    await sleep(FRED_RATE_LIMIT_MS);
  }

  return releases;
}

/**
 * Fetches upcoming FRED release dates within the given window.
 * Uses include_release_dates_with_no_data=true to get future scheduled dates.
 */
async function fetchFredReleaseDates(
  from: string,
  to: string,
): Promise<FredReleaseDate[]> {
  const allDates: FredReleaseDate[] = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const url =
      `${FRED_API_BASE}/releases/dates` +
      `?api_key=${FRED_API_KEY}` +
      `&file_type=json` +
      `&include_release_dates_with_no_data=true` +
      `&realtime_start=${from}` +
      `&realtime_end=${to}` +
      `&limit=${limit}` +
      `&offset=${offset}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`  FRED release dates fetch failed (status ${resp.status})`);
      break;
    }
    const data = await resp.json();
    const items: FredReleaseDate[] = data.release_dates || [];
    allDates.push(...items);
    hasMore = items.length === limit;
    offset += limit;
    await sleep(FRED_RATE_LIMIT_MS);
  }

  return allDates;
}

/**
 * Fetch and build FRED economic event records.
 */
async function buildFredEvents(from: string, to: string): Promise<EventRecord[]> {
  console.log('\n--- FRED Releases ---');
  console.log(`  Fetching releases catalog...`);
  const releasesMap = await fetchFredReleases();
  console.log(`  Found ${releasesMap.size} releases total`);

  console.log(`  Fetching release dates ${from} to ${to}...`);
  const releaseDates = await fetchFredReleaseDates(from, to);
  console.log(`  Found ${releaseDates.length} release dates`);

  const events: EventRecord[] = [];

  for (const rd of releaseDates) {
    const release = releasesMap.get(rd.release_id);
    const name = release?.name || rd.release_name || `FRED Release #${rd.release_id}`;

    events.push({
      eventName: name,
      eventDate: rd.date,
      eventTime: null, // FRED doesn't provide times
      category: categorizeFredRelease(name),
      impact: null, // FRED doesn't provide impact; could be derived later
      country: 'US',
      actualValue: null,
      forecastValue: null,
      previousValue: null,
      unit: null,
      source: 'fred',
      sourceId: rd.release_id.toString(),
      notes: release?.link || null,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Finnhub: fetch economic calendar
// ---------------------------------------------------------------------------

async function fetchFinnhubEconomicCalendar(
  from: string,
  to: string,
): Promise<FinnhubEconomicEvent[]> {
  const url = `${FINNHUB_API_BASE}/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text();
    console.error(`  Finnhub economic calendar fetch failed (status ${resp.status}): ${body.substring(0, 200)}`);
    return [];
  }
  const data = await resp.json();
  return data.economicCalendar || [];
}

/**
 * Fetch and build Finnhub economic event records.
 *
 * Queries in weekly chunks to keep response sizes manageable.
 * If the API returns a per-event `date` field, we use it.
 * Otherwise, we fall back to single-day queries so each event
 * is correctly attributed to its date.
 */
async function buildFinnhubEvents(from: string, to: string): Promise<EventRecord[]> {
  console.log('\n--- Finnhub Economic Calendar ---');

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const allEvents: EventRecord[] = [];

  // First, do a small probe to check if events include a date field
  const probeEvents = await fetchFinnhubEconomicCalendar(from, from);
  await sleep(FINNHUB_RATE_LIMIT_MS);
  const hasDateField = probeEvents.length > 0 && typeof probeEvents[0].date === 'string';

  if (hasDateField) {
    // API provides per-event dates — query in weekly chunks
    console.log(`  Mode: weekly chunks (API provides per-event dates)`);
    let chunkStart = fromDate;

    while (chunkStart <= toDate) {
      const chunkEnd = new Date(Math.min(
        addDays(chunkStart, FINNHUB_CHUNK_DAYS - 1).getTime(),
        toDate.getTime(),
      ));

      const chunkFrom = formatDate(chunkStart);
      const chunkTo = formatDate(chunkEnd);

      const raw = await fetchFinnhubEconomicCalendar(chunkFrom, chunkTo);
      console.log(`  ${chunkFrom} to ${chunkTo}: ${raw.length} events`);

      for (const e of raw) {
        if (!e.event) continue;
        const eventDate = e.date || chunkFrom;
        const eventTime = e.time && e.time.length > 0 ? e.time : null;

        allEvents.push({
          eventName: e.event,
          eventDate,
          eventTime,
          category: categorizeFinnhubEvent(e.event),
          impact: mapFinnhubImpact(e.impact),
          country: e.country || 'US',
          actualValue: e.actual != null ? String(e.actual) : null,
          forecastValue: e.estimate != null ? String(e.estimate) : null,
          previousValue: e.prev != null ? String(e.prev) : null,
          unit: e.unit || null,
          source: 'finnhub',
          sourceId: null,
          notes: null,
        });
      }

      chunkStart = addDays(chunkEnd, 1);
      await sleep(FINNHUB_RATE_LIMIT_MS);
    }
  } else {
    // No per-event date — query day-by-day so we can attribute events correctly
    console.log(`  Mode: day-by-day (API lacks per-event dates)`);
    let current = fromDate;

    while (current <= toDate) {
      const dayStr = formatDate(current);
      const raw = await fetchFinnhubEconomicCalendar(dayStr, dayStr);

      if (raw.length > 0) {
        console.log(`  ${dayStr}: ${raw.length} events`);
      }

      for (const e of raw) {
        if (!e.event) continue;
        const eventTime = e.time && e.time.length > 0 ? e.time : null;

        allEvents.push({
          eventName: e.event,
          eventDate: dayStr,
          eventTime,
          category: categorizeFinnhubEvent(e.event),
          impact: mapFinnhubImpact(e.impact),
          country: e.country || 'US',
          actualValue: e.actual != null ? String(e.actual) : null,
          forecastValue: e.estimate != null ? String(e.estimate) : null,
          previousValue: e.prev != null ? String(e.prev) : null,
          unit: e.unit || null,
          source: 'finnhub',
          sourceId: null,
          notes: null,
        });
      }

      current = addDays(current, 1);
      await sleep(FINNHUB_RATE_LIMIT_MS);
    }
  }

  console.log(`  Finnhub total: ${allEvents.length} events`);
  return allEvents;
}

// ---------------------------------------------------------------------------
// Upsert to database
// ---------------------------------------------------------------------------

async function upsertEvents(records: EventRecord[]): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (const record of records) {
    try {
      await db
        .insert(economicEvents)
        .values(record)
        .onConflictDoUpdate({
          target: [economicEvents.eventName, economicEvents.eventDate, economicEvents.source],
          set: {
            actualValue: sql`EXCLUDED.actual_value`,
            forecastValue: sql`EXCLUDED.forecast_value`,
            previousValue: sql`EXCLUDED.previous_value`,
            impact: sql`EXCLUDED.impact`,
            category: sql`EXCLUDED.category`,
            eventTime: sql`EXCLUDED.event_time`,
            country: sql`EXCLUDED.country`,
            unit: sql`EXCLUDED.unit`,
            notes: sql`EXCLUDED.notes`,
            updatedAt: sql`NOW()`,
          },
        });
      upserted++;
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  Error upserting "${record.eventName}" (${record.eventDate}): ${msg}`);
    }
  }

  return { upserted, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(): { days: number } {
  const args = process.argv.slice(2);
  let days = 30;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      if (isNaN(days) || days < 1) {
        console.error('--days must be a positive integer');
        process.exit(1);
      }
      i++;
    }
  }

  return { days };
}

async function main() {
  const { days } = parseArgs();

  const now = new Date();
  const from = formatDate(now);
  const to = formatDate(addDays(now, days));

  console.log(`\nEconomic Calendar Ingestion`);
  console.log(`  Range: ${from} to ${to} (${days} days)`);

  const allEvents: EventRecord[] = [];

  // 1. FRED releases
  if (FRED_API_KEY) {
    try {
      const fredEvents = await buildFredEvents(from, to);
      allEvents.push(...fredEvents);
      console.log(`\n  FRED: ${fredEvents.length} events collected`);
    } catch (error) {
      console.error('  FRED ingestion failed:', error);
    }
  } else {
    console.log('  FRED: skipped (FRED_API_KEY not set)');
  }

  // 2. Finnhub economic calendar
  if (FINNHUB_API_KEY) {
    try {
      const finnhubEvents = await buildFinnhubEvents(from, to);
      allEvents.push(...finnhubEvents);
      console.log(`\n  Finnhub: ${finnhubEvents.length} events collected`);
    } catch (error) {
      console.error('  Finnhub ingestion failed:', error);
    }
  } else {
    console.log('  Finnhub: skipped (FINNHUB_API_KEY not set)');
  }

  if (allEvents.length === 0) {
    console.log('\nNo events to upsert.');
    await closeDb();
    process.exit(0);
  }

  // 3. Upsert all events
  console.log(`\n  Upserting ${allEvents.length} total events...`);
  const { upserted, errors } = await upsertEvents(allEvents);

  console.log(`\nDone.`);
  console.log(`  Upserted: ${upserted}`);
  if (errors > 0) {
    console.log(`  Errors: ${errors}`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
