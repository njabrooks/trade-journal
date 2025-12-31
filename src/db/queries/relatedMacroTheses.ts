/**
 * Database queries for related macro theses (junction table)
 * Sprint 1: Schema & Backend
 */

import { db } from '@/db';
import { assetThesisRelatedMacroTheses, macroTheses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Get all related macro theses for an asset thesis
 */
export async function getRelatedMacroThesesForAssetThesis(assetThesisId: string) {
  return await db
    .select({
      id: assetThesisRelatedMacroTheses.id,
      macroThesisId: macroTheses.id,
      macroThesisTitle: macroTheses.title,
      thesisType: macroTheses.thesisType,
      direction: macroTheses.direction,
      timeHorizon: macroTheses.timeHorizon,
      status: macroTheses.status,
      relationshipNote: assetThesisRelatedMacroTheses.relationshipNote,
      addedAt: assetThesisRelatedMacroTheses.addedAt,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
    .where(eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId))
    .orderBy(assetThesisRelatedMacroTheses.addedAt);
}

/**
 * Get all asset theses linked to a related macro thesis
 */
export async function getAssetThesesForRelatedMacroThesis(macroThesisId: string) {
  return await db
    .select({
      id: assetThesisRelatedMacroTheses.id,
      assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
      relationshipNote: assetThesisRelatedMacroTheses.relationshipNote,
      addedAt: assetThesisRelatedMacroTheses.addedAt,
    })
    .from(assetThesisRelatedMacroTheses)
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId))
    .orderBy(assetThesisRelatedMacroTheses.addedAt);
}

/**
 * Add a related macro thesis to an asset thesis
 */
export async function addRelatedMacroThesis(
  assetThesisId: string,
  macroThesisId: string,
  relationshipNote?: string,
  addedBy?: string
) {
  const [result] = await db
    .insert(assetThesisRelatedMacroTheses)
    .values({
      assetThesisId,
      macroThesisId,
      relationshipNote: relationshipNote || null,
      addedBy: addedBy || null,
    })
    .returning();

  return result;
}

/**
 * Remove a related macro thesis from an asset thesis
 */
export async function removeRelatedMacroThesis(
  assetThesisId: string,
  macroThesisId: string
) {
  const [result] = await db
    .delete(assetThesisRelatedMacroTheses)
    .where(
      and(
        eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId),
        eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId)
      )
    )
    .returning();

  return result;
}

/**
 * Update relationship note for a related macro thesis
 */
export async function updateRelatedMacroThesisNote(
  assetThesisId: string,
  macroThesisId: string,
  relationshipNote: string
) {
  const [result] = await db
    .update(assetThesisRelatedMacroTheses)
    .set({ relationshipNote })
    .where(
      and(
        eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId),
        eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId)
      )
    )
    .returning();

  return result;
}

/**
 * Check if a macro thesis is already related to an asset thesis
 */
export async function isRelatedMacroThesis(
  assetThesisId: string,
  macroThesisId: string
): Promise<boolean> {
  const result = await db
    .select({ id: assetThesisRelatedMacroTheses.id })
    .from(assetThesisRelatedMacroTheses)
    .where(
      and(
        eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId),
        eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get count of related macro theses for an asset thesis
 */
export async function getRelatedMacroThesesCount(assetThesisId: string): Promise<number> {
  const result = await db
    .select({ count: assetThesisRelatedMacroTheses.id })
    .from(assetThesisRelatedMacroTheses)
    .where(eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId));

  return result.length;
}

