import { db } from '@/db';
import { aiPrompts } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { NewAIPrompt } from '@/db/schema';

export type PromptType = 'insight_extraction' | 'hierarchy_analysis' | 'recommendation_generation';
export type PromptStatus = 'active' | 'draft' | 'archived';

/**
 * Get all prompts, optionally filtered by type and status
 */
export async function getPrompts(filters?: {
  promptType?: PromptType;
  status?: PromptStatus;
}) {
  const conditions = [];
  if (filters?.promptType) {
    conditions.push(eq(aiPrompts.promptType, filters.promptType));
  }
  if (filters?.status) {
    conditions.push(eq(aiPrompts.status, filters.status));
  }

  const query = db.select().from(aiPrompts).orderBy(desc(aiPrompts.createdAt));

  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }

  return await query;
}

/**
 * Get active prompt for a specific type
 */
export async function getActivePrompt(promptType: PromptType) {
  const prompts = await db
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.promptType, promptType), eq(aiPrompts.status, 'active')))
    .limit(1);

  if (prompts.length > 0) {
    return prompts[0];
  }

  // Fallback to default prompt if no active prompt found
  const defaults = await db
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.promptType, promptType), eq(aiPrompts.isDefault, true)))
    .limit(1);

  return defaults[0] ?? null;
}

/**
 * Get default prompt for a specific type
 */
export async function getDefaultPrompt(promptType: PromptType) {
  const prompts = await db
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.promptType, promptType), eq(aiPrompts.isDefault, true)))
    .limit(1);

  return prompts[0] ?? null;
}

/**
 * Get prompt by ID
 */
export async function getPromptById(id: string) {
  const prompts = await db.select().from(aiPrompts).where(eq(aiPrompts.id, id)).limit(1);
  return prompts[0] ?? null;
}

/**
 * Get version history for a prompt (by name and type)
 */
export async function getPromptVersions(promptType: PromptType, name: string) {
  return await db
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.promptType, promptType), eq(aiPrompts.name, name)))
    .orderBy(desc(aiPrompts.version));
}

/**
 * Create a new prompt
 */
export async function createPrompt(data: NewAIPrompt): Promise<string> {
  const [prompt] = await db.insert(aiPrompts).values(data).returning({ id: aiPrompts.id });
  return prompt.id;
}

/**
 * Update a prompt (creates new version)
 */
export async function updatePrompt(
  id: string,
  data: Partial<Omit<NewAIPrompt, 'id' | 'createdAt'>>
): Promise<void> {
  await db
    .update(aiPrompts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(aiPrompts.id, id));
}

/**
 * Set a prompt as active (deactivates other active prompts of same type)
 */
export async function setPromptAsActive(id: string, promptType: PromptType): Promise<void> {
  // First, deactivate all other active prompts of this type
  await db
    .update(aiPrompts)
    .set({ status: 'archived' })
    .where(and(eq(aiPrompts.promptType, promptType), eq(aiPrompts.status, 'active')));

  // Then activate this prompt
  await db
    .update(aiPrompts)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(aiPrompts.id, id));
}

/**
 * Increment usage count for a prompt
 */
export async function incrementPromptUsage(id: string): Promise<void> {
  await db
    .update(aiPrompts)
    .set({
      usageCount: sql`${aiPrompts.usageCount} + 1`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiPrompts.id, id));
}

/**
 * Delete a prompt (soft delete by archiving)
 */
export async function deletePrompt(id: string): Promise<void> {
  await db
    .update(aiPrompts)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(aiPrompts.id, id));
}

