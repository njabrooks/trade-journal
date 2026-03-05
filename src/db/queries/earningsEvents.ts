import { db } from '@/db';
import { earningsEvents } from '@/db/schema';
import { desc, gte, lte, and, eq } from 'drizzle-orm';

export async function getUpcomingEarnings(days = 14) {
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return db
    .select()
    .from(earningsEvents)
    .where(
      and(
        gte(earningsEvents.reportDate, today),
        lte(earningsEvents.reportDate, futureDate)
      )
    )
    .orderBy(earningsEvents.reportDate);
}

export async function getEarningsEvents(filters: {
  from?: string;
  to?: string;
  ticker?: string;
}) {
  const conditions = [];
  if (filters.from) conditions.push(gte(earningsEvents.reportDate, filters.from));
  if (filters.to) conditions.push(lte(earningsEvents.reportDate, filters.to));
  if (filters.ticker) conditions.push(eq(earningsEvents.ticker, filters.ticker));

  return db
    .select()
    .from(earningsEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(earningsEvents.reportDate);
}
