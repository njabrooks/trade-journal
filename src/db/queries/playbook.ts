import { db } from '@/db';
import { playbookItems } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export interface PlaybookItem {
  id: string;
  code: string;
  label: string;
  description: string | null;
  category: string;
  strategyType: string;
  criteria: string | null;
  appliesToContext: string | null;
  checklistItems: Array<{ order: number; type: string; text: string }> | null;
  linkedTriageRuleSet: string | null;
  defaultSeverity: string | null;
  isActive: boolean;
}

/**
 * Get all playbook items for a strategy type
 */
export async function getPlaybookItemsByStrategyType(
  strategyType: string
): Promise<PlaybookItem[]> {
  const rows = await db
    .select()
    .from(playbookItems)
    .where(and(eq(playbookItems.strategyType, strategyType), eq(playbookItems.isActive, true)))
    .orderBy(playbookItems.code);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    category: row.category,
    strategyType: row.strategyType,
    criteria: row.criteria,
    appliesToContext: row.appliesToContext,
    checklistItems: row.checklistItems as Array<{ order: number; type: string; text: string }> | null,
    linkedTriageRuleSet: row.linkedTriageRuleSet,
    defaultSeverity: row.defaultSeverity,
    isActive: row.isActive,
  }));
}

/**
 * Get a single playbook item by code
 */
export async function getPlaybookItemByCode(code: string): Promise<PlaybookItem | null> {
  const rows = await db
    .select()
    .from(playbookItems)
    .where(and(eq(playbookItems.code, code), eq(playbookItems.isActive, true)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    category: row.category,
    strategyType: row.strategyType,
    criteria: row.criteria,
    appliesToContext: row.appliesToContext,
    checklistItems: row.checklistItems as Array<{ order: number; type: string; text: string }> | null,
    linkedTriageRuleSet: row.linkedTriageRuleSet,
    defaultSeverity: row.defaultSeverity,
    isActive: row.isActive,
  };
}

/**
 * Get playbook items by category
 */
export async function getPlaybookItemsByCategory(category: string): Promise<PlaybookItem[]> {
  const rows = await db
    .select()
    .from(playbookItems)
    .where(and(eq(playbookItems.category, category), eq(playbookItems.isActive, true)))
    .orderBy(playbookItems.code);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    category: row.category,
    strategyType: row.strategyType,
    criteria: row.criteria,
    appliesToContext: row.appliesToContext,
    checklistItems: row.checklistItems as Array<{ order: number; type: string; text: string }> | null,
    linkedTriageRuleSet: row.linkedTriageRuleSet,
    defaultSeverity: row.defaultSeverity,
    isActive: row.isActive,
  }));
}

/**
 * Get all distinct strategy types from playbook items
 */
export async function getDistinctStrategyTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ strategyType: playbookItems.strategyType })
    .from(playbookItems)
    .where(eq(playbookItems.isActive, true))
    .orderBy(playbookItems.strategyType);

  return rows.map((row) => row.strategyType).filter((type): type is string => type !== null);
}

