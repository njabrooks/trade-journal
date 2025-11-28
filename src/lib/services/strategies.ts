import { db } from '@/db';
import {
  strategies,
  strategyTemplates,
  underlyings,
  accounts,
  positions,
  trades,
  strategyMetricsSnapshots,
  triageRecords,
  NewStrategy,
  NewStrategyTemplate,
} from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

export interface CreateStrategyInput {
  strategyKey: string;
  strategyTemplateId?: string;
  accountId?: string;
  brokerAccountId?: string;
  underlyingId?: string;
  underlyingTicker?: string;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  status?: string;
  label?: string;
  strategyType?: string;
  entrySpot?: number;
  entryIv30?: number;
  netPremium?: number;
  entryNotional?: number;
  timeHorizon?: string;
  thesis?: string;
  entryContext?: string;
  profitRules?: string;
  defenseRules?: string;
  timeRules?: string;
  exitCriteria?: string;
  isAuto?: boolean;
  autoSource?: string;
}

/**
 * Resolves or creates strategy template
 */
async function resolveOrCreateTemplate(
  strategyKey: string,
  label: string | undefined,
  underlyingId: string | null
): Promise<string> {
  // Check if template exists
  const existing = await db
    .select()
    .from(strategyTemplates)
    .where(eq(strategyTemplates.strategyKey, strategyKey))
    .limit(1);

  if (existing.length > 0) {
    if (label && existing[0].label !== label) {
      await db
        .update(strategyTemplates)
        .set({
          label,
          updatedAt: new Date(),
        })
        .where(eq(strategyTemplates.id, existing[0].id));
    }
    return existing[0].id;
  }

  // Create new template
  if (!underlyingId) {
    throw new Error('underlyingId is required when creating a new template');
  }

  const [newTemplate] = await db
    .insert(strategyTemplates)
    .values({
      strategyKey,
      label: label || strategyKey,
      underlyingId,
    })
    .returning();

  return newTemplate.id;
}

/**
 * Resolves account ID from broker account ID if needed
 */
async function resolveAccountId(
  accountId?: string,
  brokerAccountId?: string
): Promise<string | null> {
  if (accountId) return accountId;
  if (!brokerAccountId) return null;

  const { resolveAccountId: resolveAccount } = await import('@/lib/ingestion/flex/account');
  try {
    return await resolveAccount(brokerAccountId);
  } catch {
    return null;
  }
}

/**
 * Resolves underlying ID from ticker if needed
 */
async function resolveUnderlyingId(
  underlyingId?: string,
  ticker?: string
): Promise<string | null> {
  if (underlyingId) return underlyingId;
  if (!ticker) return null;

  const result = await db
    .select()
    .from(underlyings)
    .where(eq(underlyings.ticker, ticker))
    .limit(1);

  return result[0]?.id ?? null;
}

/**
 * Creates a new strategy
 */
export async function createStrategy(input: CreateStrategyInput): Promise<string> {
  // Resolve account
  const accountId = await resolveAccountId(input.accountId, input.brokerAccountId);

  // Resolve underlying
  const underlyingId = await resolveUnderlyingId(input.underlyingId, input.underlyingTicker);
  if (!underlyingId) {
    throw new Error('Unable to resolve underlying. Provide either underlyingId or underlyingTicker.');
  }

  // Resolve or create template
  const templateId = input.strategyTemplateId
    ? input.strategyTemplateId
    : await resolveOrCreateTemplate(
        input.strategyKey,
        input.label || input.strategyKey,
        underlyingId
      );

  // Parse dates
  const openedAt = input.openedAt instanceof Date ? input.openedAt : new Date(input.openedAt);
  const closedAt = input.closedAt
    ? input.closedAt instanceof Date
      ? input.closedAt
      : new Date(input.closedAt)
    : null;

  // Create strategy
  const [newStrategy] = await db
    .insert(strategies)
    .values({
      strategyTemplateId: templateId,
      strategyKey: input.strategyKey,
      accountId,
      openedAt,
      closedAt,
      status: input.status || 'open',
      entrySpot: input.entrySpot?.toString() ?? null,
      entryIv30: input.entryIv30?.toString() ?? null,
      netPremium: input.netPremium?.toString() ?? null,
      entryNotional: input.entryNotional?.toString() ?? null,
      timeHorizon: input.timeHorizon ?? null,
      thesis: input.thesis ?? null,
      entryContext: input.entryContext ?? null,
      profitRules: input.profitRules ?? null,
      defenseRules: input.defenseRules ?? null,
      timeRules: input.timeRules ?? null,
      exitCriteria: input.exitCriteria ?? null,
      isAuto: input.isAuto ?? false,
      autoSource: input.autoSource ?? null,
      autoDerivedLabel: input.label ?? null,
      strategyType: input.strategyType ?? null,
      confirmedAt: input.isAuto ? null : new Date(),
    })
    .returning();

  return newStrategy.id;
}

/**
 * Updates a strategy
 */
export async function updateStrategy(
  strategyId: string,
  updates: Partial<CreateStrategyInput> & { confirm?: boolean }
): Promise<void> {
  const updateData: any = {};
  let strategyRow:
    | {
        strategyTemplateId: string | null;
      }
    | null = null;

  if (updates.strategyKey !== undefined || updates.label !== undefined) {
    const existing = await db
      .select({ strategyTemplateId: strategies.strategyTemplateId })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);
    strategyRow = existing[0] ?? null;
  }

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.closedAt !== undefined) {
    updateData.closedAt = updates.closedAt
      ? updates.closedAt instanceof Date
        ? updates.closedAt
        : new Date(updates.closedAt)
      : null;
  }
  if (updates.thesis !== undefined) updateData.thesis = updates.thesis;
  if (updates.entryContext !== undefined) updateData.entryContext = updates.entryContext;
  if (updates.profitRules !== undefined) updateData.profitRules = updates.profitRules;
  if (updates.defenseRules !== undefined) updateData.defenseRules = updates.defenseRules;
  if (updates.timeRules !== undefined) updateData.timeRules = updates.timeRules;
  if (updates.exitCriteria !== undefined) updateData.exitCriteria = updates.exitCriteria;
  if (updates.entrySpot !== undefined) updateData.entrySpot = updates.entrySpot?.toString() ?? null;
  if (updates.entryIv30 !== undefined) updateData.entryIv30 = updates.entryIv30?.toString() ?? null;
  if (updates.netPremium !== undefined)
    updateData.netPremium = updates.netPremium?.toString() ?? null;
  if (updates.entryNotional !== undefined)
    updateData.entryNotional = updates.entryNotional?.toString() ?? null;
  if (updates.timeHorizon !== undefined) updateData.timeHorizon = updates.timeHorizon ?? null;
  if (updates.strategyKey !== undefined) updateData.strategyKey = updates.strategyKey;
  if (updates.label !== undefined) updateData.autoDerivedLabel = updates.label;

  if (updates.confirm) {
    updateData.isAuto = false;
    updateData.confirmedAt = new Date();
  }
  // Check if strategyType is being changed (for state code recomputation) - do this BEFORE update
  let strategyTypeChanged = false;
  if (updates.strategyType !== undefined) {
    const strategyBefore = await db
      .select({ strategyType: strategies.strategyType })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);
    const previousStrategyType = strategyBefore[0]?.strategyType;
    strategyTypeChanged = previousStrategyType !== updates.strategyType;
  }

  if (updates.strategyType !== undefined) {
    updateData.strategyType = updates.strategyType ?? null;
  }
  if (updates.thesis !== undefined) {
    updateData.thesis = updates.thesis ?? null;
  }
  if (updates.profitRules !== undefined) {
    updateData.profitRules = updates.profitRules ?? null;
  }
  if (updates.defenseRules !== undefined) {
    updateData.defenseRules = updates.defenseRules ?? null;
  }
  if (updates.timeRules !== undefined) {
    updateData.timeRules = updates.timeRules ?? null;
  }

  updateData.updatedAt = new Date();

  await db.update(strategies).set(updateData).where(eq(strategies.id, strategyId));

  // If strategy was confirmed with a strategyType, or strategyType was changed, compute state code
  if ((updates.confirm && updates.strategyType) || (strategyTypeChanged && updates.strategyType)) {
    const { recomputeStateCodeForStrategy } = await import('@/lib/services/strategyStateCode');
    recomputeStateCodeForStrategy(strategyId).catch((error) => {
      console.error(`Failed to recompute state code for strategy ${strategyId}:`, error);
    });
  }

  if (
    strategyRow?.strategyTemplateId &&
    (updates.strategyKey !== undefined || updates.label !== undefined)
  ) {
    const templateUpdates: any = {};
    if (updates.strategyKey !== undefined) templateUpdates.strategyKey = updates.strategyKey;
    if (updates.label !== undefined) templateUpdates.label = updates.label;
    templateUpdates.updatedAt = new Date();

    await db
      .update(strategyTemplates)
      .set(templateUpdates)
      .where(eq(strategyTemplates.id, strategyRow.strategyTemplateId));
  }
}

export interface MergeStrategiesInput {
  targetId: string;
  sourceIds: string[];
}

export async function mergeStrategies(input: MergeStrategiesInput): Promise<{
  positionsUpdated: number;
  tradesUpdated: number;
  sourcesMerged: number;
}> {
  const { targetId } = input;
  const sourceIds = Array.from(new Set(input.sourceIds.filter((id) => id !== targetId)));

  if (!targetId || sourceIds.length === 0) {
    throw new Error('Provide a target strategy and at least one source strategy to merge.');
  }

  const strategiesToFetch = [targetId, ...sourceIds];
  const rows = await db
    .select()
    .from(strategies)
    .where(inArray(strategies.id, strategiesToFetch));

  if (!rows.find((row) => row.id === targetId)) {
    throw new Error('Target strategy not found.');
  }

  const now = new Date();

  const updatedPositions = await db
    .update(positions)
    .set({ strategyId: targetId, updatedAt: now })
    .where(inArray(positions.strategyId, sourceIds))
    .returning({ id: positions.id });

  const updatedTrades = await db
    .update(trades)
    .set({ strategyId: targetId })
    .where(inArray(trades.strategyId, sourceIds))
    .returning({ id: trades.id });

  await db
    .delete(strategyMetricsSnapshots)
    .where(inArray(strategyMetricsSnapshots.strategyId, sourceIds));

  await db.delete(triageRecords).where(inArray(triageRecords.strategyId, sourceIds));

  await db
    .update(strategies)
    .set({
      status: 'merged',
      isAuto: false,
      updatedAt: now,
    })
    .where(inArray(strategies.id, sourceIds));

  return {
    positionsUpdated: updatedPositions.length,
    tradesUpdated: updatedTrades.length,
    sourcesMerged: sourceIds.length,
  };
}

/**
 * Gets strategy by ID
 */
export async function getStrategyById(strategyId: string) {
  const result = await db
    .select()
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Gets strategies with filters
 */
export async function getStrategies(filters: {
  accountId?: string;
  status?: string;
  strategyKey?: string;
}) {
  const conditions = [];
  if (filters.accountId) {
    conditions.push(eq(strategies.accountId, filters.accountId));
  }
  if (filters.status) {
    conditions.push(eq(strategies.status, filters.status));
  }
  if (filters.strategyKey) {
    conditions.push(eq(strategies.strategyKey, filters.strategyKey));
  }

  return await db
    .select()
    .from(strategies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(strategies.openedAt);
}

