import { db } from '@/db';
import { thesisNewsItems, thesisTriageRecords } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export interface ThesisNewsItem {
  id: string;
  thesisId: string;
  thesisType: string;
  url: string;
  title: string;
  snippet: string | null;
  sourceDomain: string | null;
  publishedDate: string | null;
  fetchedAt: Date;
  matchScore: number | null;
  matchedKeywords: string[] | null;
  queryType: string | null;
  triageRecordId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThesisNewsItemWithTriage extends ThesisNewsItem {
  triageRecord: {
    id: string;
    triggerType: string;
    severity: string;
    urgency: string;
    status: string;
    createdAt: Date;
  } | null;
}

export async function getNewsItemsForThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset',
  options?: {
    limit?: number;
    includeTriage?: boolean;
  }
): Promise<ThesisNewsItemWithTriage[]> {
  const { limit = 50, includeTriage = true } = options ?? {};

  if (includeTriage) {
    // Join with triage records to get analysis info
    const items = await db
      .select({
        newsItem: thesisNewsItems,
        triageRecord: {
          id: thesisTriageRecords.id,
          triggerType: thesisTriageRecords.triggerType,
          severity: thesisTriageRecords.severity,
          urgency: thesisTriageRecords.urgency,
          status: thesisTriageRecords.status,
          createdAt: thesisTriageRecords.createdAt,
        },
      })
      .from(thesisNewsItems)
      .leftJoin(thesisTriageRecords, eq(thesisNewsItems.triageRecordId, thesisTriageRecords.id))
      .where(
        and(
          eq(thesisNewsItems.thesisId, thesisId),
          eq(thesisNewsItems.thesisType, thesisType)
        )
      )
      .orderBy(desc(thesisNewsItems.fetchedAt))
      .limit(limit);

    return items.map((row) => ({
      ...row.newsItem,
      triageRecord: row.triageRecord?.id ? row.triageRecord : null,
    }));
  }

  // Simple query without triage join
  const items = await db
    .select()
    .from(thesisNewsItems)
    .where(
      and(
        eq(thesisNewsItems.thesisId, thesisId),
        eq(thesisNewsItems.thesisType, thesisType)
      )
    )
    .orderBy(desc(thesisNewsItems.fetchedAt))
    .limit(limit);

  return items.map((item) => ({
    ...item,
    triageRecord: null,
  }));
}

export async function getNewsItemById(id: string): Promise<ThesisNewsItemWithTriage | null> {
  const items = await db
    .select({
      newsItem: thesisNewsItems,
      triageRecord: {
        id: thesisTriageRecords.id,
        triggerType: thesisTriageRecords.triggerType,
        severity: thesisTriageRecords.severity,
        urgency: thesisTriageRecords.urgency,
        status: thesisTriageRecords.status,
        createdAt: thesisTriageRecords.createdAt,
      },
    })
    .from(thesisNewsItems)
    .leftJoin(thesisTriageRecords, eq(thesisNewsItems.triageRecordId, thesisTriageRecords.id))
    .where(eq(thesisNewsItems.id, id))
    .limit(1);

  if (items.length === 0) return null;

  const row = items[0];
  return {
    ...row.newsItem,
    triageRecord: row.triageRecord?.id ? row.triageRecord : null,
  };
}

export async function getNewsItemCountForThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<number> {
  const result = await db
    .select({ count: thesisNewsItems.id })
    .from(thesisNewsItems)
    .where(
      and(
        eq(thesisNewsItems.thesisId, thesisId),
        eq(thesisNewsItems.thesisType, thesisType)
      )
    );

  return result.length;
}
