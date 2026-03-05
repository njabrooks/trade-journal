import { db } from '@/db';
import { secFilings } from '@/db/schema';
import { desc, gte, and, eq } from 'drizzle-orm';

export async function getRecentFilings(days = 7) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return db
    .select()
    .from(secFilings)
    .where(gte(secFilings.filedDate, cutoffDate))
    .orderBy(desc(secFilings.filedDate));
}

export async function getFilings(filters: {
  ticker?: string;
  filingType?: string;
  materialOnly?: boolean;
  days?: number;
}) {
  const conditions = [];
  if (filters.ticker) conditions.push(eq(secFilings.ticker, filters.ticker));
  if (filters.filingType) conditions.push(eq(secFilings.filingType, filters.filingType));
  if (filters.materialOnly) conditions.push(eq(secFilings.isMaterial, true));
  if (filters.days) {
    const cutoffDate = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    conditions.push(gte(secFilings.filedDate, cutoffDate));
  }

  return db
    .select()
    .from(secFilings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(secFilings.filedDate));
}
