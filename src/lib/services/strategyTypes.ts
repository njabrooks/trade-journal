import { db } from '@/db';
import { strategyTypes, strategies } from '@/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

export interface CreateStrategyTypeInput {
  name: string;
  description?: string | null;
  defaultDirection?: string | null;
  category?: string | null;
  legCount?: number | null;
  minDte?: number | null;
  maxDte?: number | null;
  riskProfile?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateStrategyTypeInput {
  name?: string;
  description?: string | null;
  defaultDirection?: string | null;
  category?: string | null;
  legCount?: number | null;
  minDte?: number | null;
  maxDte?: number | null;
  riskProfile?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface StrategyTypeWithUsage {
  id: string;
  name: string;
  description: string | null;
  defaultDirection: string | null;
  category: string | null;
  legCount: number | null;
  minDte: number | null;
  maxDte: number | null;
  riskProfile: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  strategyCount: number;
}

/**
 * Get all strategy types, optionally including archived ones.
 */
export async function getAllStrategyTypes(includeArchived = false) {
  const conditions = includeArchived ? [] : [eq(strategyTypes.isActive, true)];
  return db
    .select()
    .from(strategyTypes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(strategyTypes.sortOrder, strategyTypes.name);
}

/**
 * Get all strategy types with usage count (number of strategies using each type).
 */
export async function getStrategyTypesWithUsageCount(
  includeArchived = false
): Promise<StrategyTypeWithUsage[]> {
  const rows = await db
    .select({
      id: strategyTypes.id,
      name: strategyTypes.name,
      description: strategyTypes.description,
      defaultDirection: strategyTypes.defaultDirection,
      category: strategyTypes.category,
      legCount: strategyTypes.legCount,
      minDte: strategyTypes.minDte,
      maxDte: strategyTypes.maxDte,
      riskProfile: strategyTypes.riskProfile,
      sortOrder: strategyTypes.sortOrder,
      isActive: strategyTypes.isActive,
      createdAt: strategyTypes.createdAt,
      updatedAt: strategyTypes.updatedAt,
      strategyCount: sql<number>`count(${strategies.id})::int`,
    })
    .from(strategyTypes)
    .leftJoin(strategies, eq(strategies.strategyTypeId, strategyTypes.id))
    .where(includeArchived ? undefined : eq(strategyTypes.isActive, true))
    .groupBy(strategyTypes.id)
    .orderBy(strategyTypes.sortOrder, strategyTypes.name);

  return rows;
}

/**
 * Get a single strategy type by ID.
 */
export async function getStrategyTypeById(id: string) {
  const [row] = await db
    .select()
    .from(strategyTypes)
    .where(eq(strategyTypes.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Get a single strategy type by name (case-sensitive).
 */
export async function getStrategyTypeByName(name: string) {
  const [row] = await db
    .select()
    .from(strategyTypes)
    .where(eq(strategyTypes.name, name))
    .limit(1);
  return row ?? null;
}

/**
 * Create a new strategy type. Returns the new ID.
 */
export async function createStrategyType(input: CreateStrategyTypeInput): Promise<string> {
  const [row] = await db
    .insert(strategyTypes)
    .values({
      name: input.name,
      description: input.description ?? null,
      defaultDirection: input.defaultDirection ?? null,
      category: input.category ?? null,
      legCount: input.legCount ?? null,
      minDte: input.minDte ?? null,
      maxDte: input.maxDte ?? null,
      riskProfile: input.riskProfile ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning({ id: strategyTypes.id });

  return row.id;
}

/**
 * Update an existing strategy type.
 */
export async function updateStrategyType(id: string, updates: UpdateStrategyTypeInput) {
  const setValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.defaultDirection !== undefined) setValues.defaultDirection = updates.defaultDirection;
  if (updates.category !== undefined) setValues.category = updates.category;
  if (updates.legCount !== undefined) setValues.legCount = updates.legCount;
  if (updates.minDte !== undefined) setValues.minDte = updates.minDte;
  if (updates.maxDte !== undefined) setValues.maxDte = updates.maxDte;
  if (updates.riskProfile !== undefined) setValues.riskProfile = updates.riskProfile;
  if (updates.sortOrder !== undefined) setValues.sortOrder = updates.sortOrder;
  if (updates.isActive !== undefined) setValues.isActive = updates.isActive;

  // Also sync the legacy strategy_type text column when renaming
  if (updates.name !== undefined) {
    const existing = await getStrategyTypeById(id);
    if (existing && existing.name !== updates.name) {
      await db
        .update(strategies)
        .set({ strategyType: updates.name, updatedAt: new Date() })
        .where(eq(strategies.strategyTypeId, id));
    }
  }

  await db.update(strategyTypes).set(setValues).where(eq(strategyTypes.id, id));
}

/**
 * Delete a strategy type. Fails if any strategies reference it.
 */
export async function deleteStrategyType(id: string): Promise<void> {
  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(strategies)
    .where(eq(strategies.strategyTypeId, id));

  if (usage && usage.count > 0) {
    throw new Error(
      `Cannot delete strategy type: ${usage.count} strategy(ies) still reference it. Archive it instead.`
    );
  }

  await db.delete(strategyTypes).where(eq(strategyTypes.id, id));
}

/**
 * Resolve a strategy type name to an ID, creating a new type if needed.
 * Used as a backward-compatibility bridge during the transition from text to FK.
 */
export async function resolveOrCreateStrategyType(name: string): Promise<string> {
  const existing = await getStrategyTypeByName(name);
  if (existing) return existing.id;
  return createStrategyType({ name });
}
