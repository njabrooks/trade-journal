import { db } from '@/db';
import { assetViews, macroTheses, underlyings, strategies } from '@/db/schema';
import { eq, desc, inArray, count } from 'drizzle-orm';
import type { NewAssetView } from '@/db/schema';

export interface AssetViewListItem {
  id: string;
  title: string;
  underlyingId: string | null;
  ticker: string | null;
  macroThesisId: string | null;
  macroThesisTitle: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  strategyCount: number;
}

export async function getAssetViewsList(): Promise<AssetViewListItem[]> {
  const views = await db
    .select({
      id: assetViews.id,
      title: assetViews.title,
      underlyingId: assetViews.underlyingId,
      ticker: underlyings.ticker,
      macroThesisId: assetViews.macroThesisId,
      macroThesisTitle: macroTheses.title,
      timeHorizon: assetViews.timeHorizon,
      confidenceLevel: assetViews.confidenceLevel,
      status: assetViews.status,
      createdAt: assetViews.createdAt,
      updatedAt: assetViews.updatedAt,
    })
    .from(assetViews)
    .leftJoin(underlyings, eq(assetViews.underlyingId, underlyings.id))
    .leftJoin(macroTheses, eq(assetViews.macroThesisId, macroTheses.id))
    .orderBy(desc(assetViews.createdAt));

  if (views.length === 0) {
    return [];
  }

  // Get strategy counts
  const viewIds = views.map((v) => v.id);
  const strategyCounts = await db
    .select({
      assetViewId: strategies.assetViewId,
      count: count(),
    })
    .from(strategies)
    .where(inArray(strategies.assetViewId, viewIds))
    .groupBy(strategies.assetViewId);

  const strategyMap = new Map(
    strategyCounts.map((c) => [c.assetViewId, Number(c.count)])
  );

  return views.map((view) => ({
    ...view,
    strategyCount: strategyMap.get(view.id) ?? 0,
  }));
}

export async function getAssetViewById(id: string) {
  const rows = await db
    .select({
      view: assetViews,
      macroThesis: macroTheses,
      underlying: underlyings,
    })
    .from(assetViews)
    .leftJoin(macroTheses, eq(assetViews.macroThesisId, macroTheses.id))
    .leftJoin(underlyings, eq(assetViews.underlyingId, underlyings.id))
    .where(eq(assetViews.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  return {
    ...rows[0].view,
    macroThesis: rows[0].macroThesis,
    underlying: rows[0].underlying,
  };
}

export async function createAssetView(data: NewAssetView): Promise<string> {
  const [view] = await db
    .insert(assetViews)
    .values(data)
    .returning({ id: assetViews.id });
  return view.id;
}

export async function updateAssetView(
  id: string,
  data: Partial<NewAssetView>
): Promise<void> {
  await db
    .update(assetViews)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assetViews.id, id));
}

export async function deleteAssetView(id: string): Promise<void> {
  await db.delete(assetViews).where(eq(assetViews.id, id));
}
