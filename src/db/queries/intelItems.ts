import { db } from '@/db';
import {
  intelItems,
  assetTheses,
  assetThesisRelatedMacroTheses,
  underlyings,
} from '@/db/schema';
import { eq, desc, sql, inArray } from 'drizzle-orm';

export interface IntelItemForDisplay {
  id: string;
  sourceKey: string;
  headline: string;
  body: string | null;
  severity: string;
  tickers: string[];
  occurredAt: Date;
  processingStatus: string;
  processingResult: string | null;
}

export async function getIntelItemsForThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset',
  options?: { limit?: number; offset?: number }
): Promise<IntelItemForDisplay[]> {
  const tickers = await getTickersForThesis(thesisId, thesisType);

  if (tickers.length === 0) {
    return [];
  }

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  // Find intel_items where any of the tickers matches the tickers array
  const rows = await db
    .select({
      id: intelItems.id,
      sourceKey: intelItems.sourceKey,
      headline: intelItems.headline,
      body: intelItems.body,
      severity: intelItems.severity,
      tickers: intelItems.tickers,
      occurredAt: intelItems.occurredAt,
      processingStatus: intelItems.processingStatus,
      processingResult: intelItems.processingResult,
    })
    .from(intelItems)
    .where(sql`${intelItems.tickers} && ${sql`ARRAY[${sql.join(tickers.map(t => sql`${t}`), sql`, `)}]::text[]`}`)
    .orderBy(desc(intelItems.occurredAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...row,
    tickers: row.tickers ?? [],
  }));
}

export async function getIntelItemCountForThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset',
): Promise<number> {
  const tickers = await getTickersForThesis(thesisId, thesisType);

  if (tickers.length === 0) {
    return 0;
  }

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(intelItems)
    .where(sql`${intelItems.tickers} && ${sql`ARRAY[${sql.join(tickers.map(t => sql`${t}`), sql`, `)}]::text[]`}`);

  return result[0]?.count ?? 0;
}

async function getTickersForThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset',
): Promise<string[]> {
  if (thesisType === 'asset') {
    // Get the ticker via underlying join
    const rows = await db
      .select({
        ticker: underlyings.ticker,
      })
      .from(assetTheses)
      .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .where(eq(assetTheses.id, thesisId))
      .limit(1);

    const ticker = rows[0]?.ticker;
    return ticker ? [ticker] : [];
  }

  // Macro thesis: get all linked asset thesis tickers
  const rows = await db
    .select({
      ticker: underlyings.ticker,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetThesisRelatedMacroTheses.assetThesisId, assetTheses.id))
    .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, thesisId));

  const tickers = rows
    .map((r) => r.ticker)
    .filter((t): t is string => t !== null);

  // Dedupe
  return [...new Set(tickers)];
}
