import { db } from '@/db';
import { economicEvents } from '@/db/schema';
import { gte, lte, and, eq, sql } from 'drizzle-orm';

const impactOrder = sql`CASE impact_level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

// Maps new schema shape → legacy component interface expected by EconomicCalendar
const eventSelect = {
  id: economicEvents.id,
  eventName: economicEvents.title,
  eventDate: sql<string>`DATE(${economicEvents.eventDate})::text`,
  eventTime: sql<string | null>`NULLIF(TO_CHAR(${economicEvents.eventDate} AT TIME ZONE 'UTC', 'HH24:MI'), '00:00')`,
  category: economicEvents.category,
  impact: economicEvents.impactLevel,
  country: economicEvents.country,
  actualValue: sql<string | null>`${economicEvents.actual}::text`,
  forecastValue: sql<string | null>`${economicEvents.forecast}::text`,
  previousValue: sql<string | null>`${economicEvents.previous}::text`,
};

export async function getUpcomingEconomicEvents(days = 7) {
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return db
    .select(eventSelect)
    .from(economicEvents)
    .where(and(
      gte(economicEvents.eventDate, new Date()),
      lte(economicEvents.eventDate, futureDate),
    ))
    .orderBy(economicEvents.eventDate, impactOrder);
}

export async function getEconomicEvents(filters: {
  from?: string;
  to?: string;
  category?: string;
  impactLevel?: string;
}) {
  const conditions = [];
  if (filters.from) conditions.push(gte(economicEvents.eventDate, new Date(filters.from)));
  if (filters.to) conditions.push(lte(economicEvents.eventDate, new Date(filters.to)));
  if (filters.category) conditions.push(eq(economicEvents.category, filters.category));
  if (filters.impactLevel) conditions.push(eq(economicEvents.impactLevel, filters.impactLevel));

  return db
    .select(eventSelect)
    .from(economicEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(economicEvents.eventDate, impactOrder);
}
