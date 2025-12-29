import { db } from '@/db';
import { macroTheses, assetTheses, strategies, accounts, underlyings, mainClaims, claimThesisMappings } from '@/db/schema';
import { eq, desc, inArray, count, sql } from 'drizzle-orm';
import type { NewMacroThesis } from '@/db/schema';

export interface MacroThesisListItem {
  id: string;
  title: string;
  thesisType: string;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  assetViewCount: number;
  strategyCount: number;
}

export async function getMacroThesesList(): Promise<MacroThesisListItem[]> {
  const theses = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      thesisType: macroTheses.thesisType,
      timeHorizon: macroTheses.timeHorizon,
      confidenceLevel: macroTheses.confidenceLevel,
      status: macroTheses.status,
      createdAt: macroTheses.createdAt,
      updatedAt: macroTheses.updatedAt,
    })
    .from(macroTheses)
    .orderBy(desc(macroTheses.createdAt));

  if (theses.length === 0) {
    return [];
  }

  // Get counts for each thesis
  const thesisIds = theses.map((t) => t.id);

  const assetViewCounts = await db
    .select({
      macroThesisId: assetTheses.macroThesisId,
      count: count(),
    })
    .from(assetTheses)
    .where(inArray(assetTheses.macroThesisId, thesisIds))
    .groupBy(assetTheses.macroThesisId);

  const strategyCounts = await db
    .select({
      macroThesisId: strategies.macroThesisId,
      count: count(),
    })
    .from(strategies)
    .where(inArray(strategies.macroThesisId, thesisIds))
    .groupBy(strategies.macroThesisId);

  const assetViewMap = new Map(
    assetViewCounts.map((c) => [c.macroThesisId, Number(c.count)])
  );
  const strategyMap = new Map(
    strategyCounts.map((c) => [c.macroThesisId, Number(c.count)])
  );

  return theses.map((thesis) => ({
    ...thesis,
    assetViewCount: assetViewMap.get(thesis.id) ?? 0,
    strategyCount: strategyMap.get(thesis.id) ?? 0,
  }));
}

export async function getMacroThesisById(id: string) {
  const rows = await db
    .select()
    .from(macroTheses)
    .where(eq(macroTheses.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function createMacroThesis(data: NewMacroThesis): Promise<string> {
  const [thesis] = await db
    .insert(macroTheses)
    .values(data)
    .returning({ id: macroTheses.id });
  return thesis.id;
}

export async function updateMacroThesis(
  id: string,
  data: Partial<NewMacroThesis>
): Promise<void> {
  await db
    .update(macroTheses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(macroTheses.id, id));
}

export async function deleteMacroThesis(id: string): Promise<void> {
  await db.delete(macroTheses).where(eq(macroTheses.id, id));
}

export async function getLinkedAssetThesesForThesis(thesisId: string) {
  const views = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      underlyingTicker: underlyings.ticker,
      status: assetTheses.status,
      confidenceLevel: assetTheses.confidenceLevel,
      createdAt: assetTheses.createdAt,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(eq(assetTheses.macroThesisId, thesisId))
    .orderBy(desc(assetTheses.createdAt));

  return views;
}

export async function getLinkedStrategiesForThesis(thesisId: string) {
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
    .where(eq(strategies.macroThesisId, thesisId))
    .orderBy(desc(strategies.openedAt));

  return strats;
}

export async function getLinkedMainClaimsForThesis(thesisId: string) {
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
    .where(eq(claimThesisMappings.macroThesisId, thesisId))
    .orderBy(desc(mainClaims.createdAt));

  return claims;
}
