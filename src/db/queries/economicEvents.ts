import { db } from '@/db';
import { economicEvents } from '@/db/schema';
import { desc, gte, lte, and, eq, sql } from 'drizzle-orm';

export async function getUpcomingEconomicEvents(days = 7) {
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return db
    .select()
    .from(economicEvents)
    .where(
      and(
        gte(economicEvents.eventDate, today),
        lte(economicEvents.eventDate, futureDate)
      )
    )
    .orderBy(
      economicEvents.eventDate,
      sql`CASE impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`
    );
}

export async function getEconomicEvents(filters: {
  from?: string;
  to?: string;
  category?: string;
  impact?: string;
}) {
  const conditions = [];
  if (filters.from) conditions.push(gte(economicEvents.eventDate, filters.from));
  if (filters.to) conditions.push(lte(economicEvents.eventDate, filters.to));
  if (filters.category) conditions.push(eq(economicEvents.category, filters.category));
  if (filters.impact) conditions.push(eq(economicEvents.impact, filters.impact));

  return db
    .select()
    .from(economicEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      economicEvents.eventDate,
      sql`CASE impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`
    );
}
