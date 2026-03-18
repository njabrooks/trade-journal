/**
 * Economic Calendar Ingestion
 *
 * Fetches upcoming and recent economic events from TradingView's economic
 * calendar API (no auth needed, public endpoint with Origin header) and
 * upserts them into the economic_events table.
 *
 * Coverage:
 *   - Past 7 days  (to capture actuals that have just been released)
 *   - Next 30 days (to have upcoming events ready for signal queries)
 *
 * By default only high-impact events are stored (importance = 1 from TV).
 * Pass --all-impact to also ingest medium (0) and low (-1) impact events.
 *
 * Usage:
 *   npx tsx scripts/ingest-economic-calendar.ts
 *   npx tsx scripts/ingest-economic-calendar.ts --all-impact
 *   npx tsx scripts/ingest-economic-calendar.ts --dry-run
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const { economicEvents } = schema;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * TV API endpoint — no auth needed, but requires Origin/Referer headers
 * from the tradingview.com domain to bypass a 403.
 */
const TV_CALENDAR_URL = 'https://economic-calendar.tradingview.com/events';

const TV_HEADERS: Record<string, string> = {
  'Origin': 'https://www.tradingview.com',
  'Referer': 'https://www.tradingview.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

/** Countries to fetch. Add more ISO codes as needed. */
const TARGET_COUNTRIES = ['US'];

/**
 * Event-type normalisation map.
 *
 * TradingView uses human-readable titles which can vary slightly across
 * releases (e.g. "Fed Interest Rate Decision" vs "FOMC Rate Decision").
 * We normalise to a stable key so the unique constraint on (event_type,
 * event_date, country) works correctly across runs and years.
 *
 * Matching is case-insensitive against the full title string.
 */
const EVENT_TYPE_MAP: Array<{ pattern: RegExp; eventType: string }> = [
  // FOMC / Fed
  { pattern: /fed interest rate|fomc rate decision|federal funds rate/i,  eventType: 'FOMC_RATE_DECISION' },
  { pattern: /fomc economic projections/i,                                 eventType: 'FOMC_PROJECTIONS' },
  { pattern: /fomc minutes/i,                                              eventType: 'FOMC_MINUTES' },
  { pattern: /fed press conference/i,                                      eventType: 'FED_PRESS_CONFERENCE' },

  // Inflation (order matters — more specific first)
  { pattern: /core inflation rate.*mom|core cpi.*mom/i,                    eventType: 'CORE_CPI_MM' },
  { pattern: /core inflation rate.*yoy|core cpi.*yoy/i,                    eventType: 'CORE_CPI_YY' },
  { pattern: /^inflation rate.*mom|^cpi.*mom/i,                            eventType: 'CPI_MM' },
  { pattern: /^inflation rate.*yoy|^cpi.*yoy/i,                            eventType: 'CPI_YY' },
  { pattern: /core pce price index.*mom/i,                                 eventType: 'CORE_PCE_MM' },
  { pattern: /core pce price index.*yoy/i,                                 eventType: 'CORE_PCE_YY' },
  { pattern: /pce price index.*mom/i,                                      eventType: 'PCE_MM' },
  { pattern: /pce price index.*yoy/i,                                      eventType: 'PCE_YY' },
  { pattern: /core ppi.*mom|ppi ex food.*mom/i,                            eventType: 'CORE_PPI_MM' },
  { pattern: /^ppi.*mom/i,                                                 eventType: 'PPI_MM' },

  // Labour market
  { pattern: /non.?farm payrolls/i,                                        eventType: 'NFP' },
  { pattern: /unemployment rate/i,                                         eventType: 'UNEMPLOYMENT_RATE' },
  { pattern: /jolts job openings/i,                                        eventType: 'JOLTS_OPENINGS' },
  { pattern: /adp employment change/i,                                     eventType: 'ADP_EMPLOYMENT' },
  { pattern: /average hourly earnings/i,                                   eventType: 'AVG_HOURLY_EARNINGS' },
  { pattern: /initial jobless claims/i,                                    eventType: 'INITIAL_JOBLESS_CLAIMS' },

  // Growth / GDP
  { pattern: /gdp growth rate.*final/i,                                    eventType: 'GDP_FINAL' },
  { pattern: /gdp growth rate.*second/i,                                   eventType: 'GDP_SECOND' },
  { pattern: /gdp growth rate.*adv|gdp.*advance/i,                         eventType: 'GDP_ADVANCE' },

  // Consumer
  { pattern: /retail sales.*mom/i,                                         eventType: 'RETAIL_SALES_MM' },
  { pattern: /michigan consumer sentiment.*prel/i,                         eventType: 'MICHIGAN_SENTIMENT_PREL' },
  { pattern: /michigan consumer sentiment.*final/i,                        eventType: 'MICHIGAN_SENTIMENT_FINAL' },
  { pattern: /personal spending/i,                                         eventType: 'PERSONAL_SPENDING' },
  { pattern: /personal income/i,                                           eventType: 'PERSONAL_INCOME' },

  // Business / activity
  { pattern: /ism manufacturing pmi/i,                                     eventType: 'ISM_MANUFACTURING_PMI' },
  { pattern: /ism services pmi/i,                                          eventType: 'ISM_SERVICES_PMI' },
  { pattern: /s&p global.*manufacturing pmi/i,                             eventType: 'SP_GLOBAL_MANUFACTURING_PMI' },
  { pattern: /s&p global.*services pmi/i,                                  eventType: 'SP_GLOBAL_SERVICES_PMI' },

  // Housing
  { pattern: /existing home sales/i,                                       eventType: 'EXISTING_HOME_SALES' },
  { pattern: /new home sales/i,                                            eventType: 'NEW_HOME_SALES' },
  { pattern: /housing starts/i,                                            eventType: 'HOUSING_STARTS' },
];

/** Map TV importance integer to our text enum */
function importanceToLevel(importance: number): 'high' | 'medium' | 'low' {
  if (importance >= 1) return 'high';
  if (importance === 0) return 'medium';
  return 'low';
}

/** Derive a stable event_type key from the TV title */
function deriveEventType(title: string): string {
  for (const { pattern, eventType } of EVENT_TYPE_MAP) {
    if (pattern.test(title)) return eventType;
  }
  // Fallback: uppercase-snake the title, strip punctuation, cap at 60 chars
  return title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/** Derive a unit string from TV's scale + unit fields */
function deriveUnit(tvEvent: TvEvent): string | null {
  if (tvEvent.unit) return tvEvent.unit;
  if (tvEvent.scale) return tvEvent.scale;
  if (tvEvent.currency) return tvEvent.currency;
  return null;
}

// ---------------------------------------------------------------------------
// TV API types
// ---------------------------------------------------------------------------

interface TvEvent {
  id: string;
  title: string;
  indicator?: string;
  category?: string;
  country: string;
  date: string;           // ISO timestamp e.g. "2026-03-18T18:00:00.000Z"
  importance: number;     // 1 = high, 0 = medium, -1 = low
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  currency?: string;
  scale?: string;         // 'K', 'M', 'B'
  unit?: string;          // '%', etc.
  source?: string;
  source_url?: string;
  period?: string;
}

interface TvResponse {
  status: string;
  result: TvEvent[];
}

// ---------------------------------------------------------------------------
// Fetch logic
// ---------------------------------------------------------------------------

async function fetchCalendarEvents(
  from: Date,
  to: Date,
  countries: string[]
): Promise<TvEvent[]> {
  const fromStr = from.toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const toStr   = to.toISOString().replace(/\.\d{3}Z$/, '.000Z');

  // TV expects comma-separated country codes as a single query param value
  const params = new URLSearchParams({
    from: fromStr,
    to:   toStr,
    countries: countries.join(','),
  });
  const url = `${TV_CALENDAR_URL}?${params}`;

  const res = await fetch(url, { headers: TV_HEADERS });
  if (!res.ok) {
    throw new Error(`TradingView calendar API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as TvResponse;
  if (data.status !== 'ok') {
    throw new Error(`Unexpected API status: ${data.status}`);
  }

  return data.result ?? [];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun    = process.argv.includes('--dry-run');
  const allImpact = process.argv.includes('--all-impact');

  const now  = new Date();
  const from = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);  // -7 days
  const to   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);  // +30 days

  console.log(`Economic Calendar Ingestion — ${now.toISOString()}`);
  console.log(`  Window   : ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);
  console.log(`  Countries: ${TARGET_COUNTRIES.join(', ')}`);
  console.log(`  Impact   : ${allImpact ? 'all' : 'high only (importance=1)'}`);
  if (dryRun) console.log('  DRY RUN  : nothing will be written');
  console.log('');

  // Fetch events from TradingView API
  const allEvents = await fetchCalendarEvents(from, to, TARGET_COUNTRIES);
  console.log(`Fetched ${allEvents.length} total events from TradingView`);

  // Filter by impact: TV importance 1 = high, 0 = medium, -1 = low
  const minImportance = allImpact ? -1 : 1;
  const filtered = allEvents.filter(e => e.importance >= minImportance);
  console.log(`After impact filter: ${filtered.length} events\n`);

  // Upsert
  let upserted = 0;
  let errors   = 0;

  for (const ev of filtered) {
    try {
      const eventType   = deriveEventType(ev.title);
      const impactLevel = importanceToLevel(ev.importance);
      const unit        = deriveUnit(ev);
      const eventDate   = new Date(ev.date);

      const record = {
        tvEventId:   ev.id,
        eventType,
        title:       ev.title,
        indicator:   ev.indicator  ?? null,
        category:    ev.category   ?? null,
        country:     ev.country,
        eventDate,
        impactLevel,
        actual:      ev.actual   != null ? String(ev.actual)   : null,
        forecast:    ev.forecast != null ? String(ev.forecast) : null,
        previous:    ev.previous != null ? String(ev.previous) : null,
        unit:        unit ?? null,
        source:      ev.source     ?? null,
        sourceUrl:   ev.source_url ?? null,
        period:      ev.period     ?? null,
        updatedAt:   new Date(),
      };

      if (dryRun) {
        const mark = ev.actual != null ? ' ✓' : '';
        console.log(`  [${impactLevel.padEnd(6)}] ${ev.date.slice(0, 10)} ${ev.title}${mark} → ${eventType}`);
        upserted++;
        continue;
      }

      await db
        .insert(economicEvents)
        .values(record)
        .onConflictDoUpdate({
          target: [economicEvents.eventType, economicEvents.eventDate, economicEvents.country],
          set: {
            // Refresh mutable fields on re-ingestion (actuals arrive post-release)
            tvEventId:   sql`excluded.tv_event_id`,
            title:       sql`excluded.title`,
            indicator:   sql`excluded.indicator`,
            category:    sql`excluded.category`,
            impactLevel: sql`excluded.impact_level`,
            actual:      sql`excluded.actual`,
            forecast:    sql`excluded.forecast`,
            previous:    sql`excluded.previous`,
            unit:        sql`excluded.unit`,
            source:      sql`excluded.source`,
            sourceUrl:   sql`excluded.source_url`,
            period:      sql`excluded.period`,
            updatedAt:   sql`NOW()`,
          },
        });

      upserted++;
    } catch (err) {
      console.error(`  ERROR on "${ev.title}" (${ev.date}): ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  // Summary
  console.log(`\nSummary:`);
  console.log(`  Upserted : ${upserted}`);
  console.log(`  Errors   : ${errors}`);

  if (!dryRun) {
    // Show upcoming high-impact events in the next 30 days
    const upcoming = await db.execute<{
      event_type: string;
      title: string;
      event_date: string;
      impact_level: string;
      actual: string | null;
      forecast: string | null;
    }>(sql`
      SELECT event_type, title, event_date::text, impact_level, actual, forecast
      FROM economic_events
      WHERE event_date >= NOW()
        AND event_date <= NOW() + interval '30 days'
        AND impact_level = 'high'
        AND country = 'US'
      ORDER BY event_date ASC
    `);

    console.log(`\nUpcoming high-impact US events (next 30 days): ${upcoming.length}`);
    for (const row of upcoming) {
      const dateStr     = new Date(row.event_date).toISOString().slice(0, 16).replace('T', ' ');
      const forecastStr = row.forecast != null ? ` [forecast: ${row.forecast}]` : '';
      console.log(`  ${dateStr}  ${row.title}${forecastStr}`);
    }
  }

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
