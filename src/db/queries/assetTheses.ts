import { db } from '@/db';
import { assetTheses, macroTheses, underlyings, strategies, accounts, mainClaims, claimThesisMappings } from '@/db/schema';
import { eq, desc, inArray, count } from 'drizzle-orm';
import type { NewAssetThesis } from '@/db/schema';

export interface AssetThesisListItem {
  id: string;
  title: string;
  description: string | null;
  underlyingId: string | null;
  ticker: string | null;
  underlyingName: string | null;
  macroThesisId: string | null;
  macroThesisTitle: string | null;
  direction: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  notes: any;
  createdAt: Date;
  updatedAt: Date;
  strategyCount: number;
}

export async function getAssetThesesList(): Promise<AssetThesisListItem[]> {
  const views = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      description: assetTheses.description,
      underlyingId: assetTheses.underlyingId,
      ticker: underlyings.ticker,
      underlyingName: underlyings.name,
      macroThesisId: assetTheses.macroThesisId,
      macroThesisTitle: macroTheses.title,
      direction: assetTheses.direction,
      timeHorizon: assetTheses.timeHorizon,
      confidenceLevel: assetTheses.confidenceLevel,
      status: assetTheses.status,
      notes: assetTheses.notes,
      createdAt: assetTheses.createdAt,
      updatedAt: assetTheses.updatedAt,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .leftJoin(macroTheses, eq(assetTheses.macroThesisId, macroTheses.id))
    .orderBy(desc(assetTheses.createdAt));

  if (views.length === 0) {
    return [];
  }

  // Get strategy counts
  const viewIds = views.map((v) => v.id);
  const strategyCounts = await db
    .select({
      assetThesisId: strategies.assetThesisId,
      count: count(),
    })
    .from(strategies)
    .where(inArray(strategies.assetThesisId, viewIds))
    .groupBy(strategies.assetThesisId);

  const strategyMap = new Map(
    strategyCounts.map((c) => [c.assetThesisId, Number(c.count)])
  );

  return views.map((view) => ({
    ...view,
    strategyCount: strategyMap.get(view.id) ?? 0,
  }));
}

export async function getAssetThesisById(id: string) {
  const rows = await db
    .select({
      view: assetTheses,
      macroThesis: macroTheses,
      underlying: underlyings,
    })
    .from(assetTheses)
    .leftJoin(macroTheses, eq(assetTheses.macroThesisId, macroTheses.id))
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(eq(assetTheses.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  return {
    ...rows[0].view,
    macroThesis: rows[0].macroThesis,
    underlying: rows[0].underlying,
  };
}

export async function createAssetThesis(data: NewAssetThesis): Promise<string> {
  const [view] = await db
    .insert(assetTheses)
    .values(data)
    .returning({ id: assetTheses.id });
  return view.id;
}

export async function updateAssetThesis(
  id: string,
  data: Partial<NewAssetThesis>
): Promise<void> {
  await db
    .update(assetTheses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assetTheses.id, id));
}

export async function deleteAssetThesis(id: string): Promise<void> {
  await db.delete(assetTheses).where(eq(assetTheses.id, id));
}

export async function getLinkedStrategiesForAssetThesis(assetThesisId: string) {
  const strats = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
      strategyType: strategies.strategyType,
      accountLabel: accounts.label,
      accountBrokerId: accounts.brokerAccountId,
      openedAt: strategies.openedAt,
    })
    .from(strategies)
    .leftJoin(accounts, eq(strategies.accountId, accounts.id))
    .where(eq(strategies.assetThesisId, assetThesisId))
    .orderBy(desc(strategies.openedAt));

  return strats;
}

export async function getLinkedMainClaimsForAssetThesis(assetThesisId: string) {
  const claims = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      category: mainClaims.category,
      claim: mainClaims.claim,
      qualifier: mainClaims.qualifier,
      timeHorizon: mainClaims.timeHorizon,
      relevantTickers: mainClaims.relevantTickers,
      status: mainClaims.status,
      mappingType: claimThesisMappings.mappingType,
      createdAt: mainClaims.createdAt,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
    .where(eq(claimThesisMappings.assetThesisId, assetThesisId))
    .orderBy(desc(mainClaims.createdAt));

  return claims;
}
