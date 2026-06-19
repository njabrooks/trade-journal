/**
 * Canonical asset→macro framing writer (scripts layer) — C5a / docs/v2/09 §7.
 *
 * Upserts an `asset_thesis_related_macro_theses` row (related | gated_by) and journals
 * it on the asset thesis. Shared by `scripts/ops/link-asset-macro.ts` (the framing
 * mode's auto-`related` path) and `scripts/ops/resolve-decision.ts` (the gated_by /
 * confirmed-link resolve path) so the junction write lives in one place.
 *
 * No `main()` — safe to import.
 */
import { db, schema, logToJournal } from './db.js';
import { and, eq } from 'drizzle-orm';

const { assetThesisRelatedMacroTheses, assetTheses, macroTheses } = schema;

export type Relationship = 'related' | 'gated_by';

export async function linkAssetMacro(opts: {
  assetThesisId: string;
  macroThesisId: string;
  relationshipType?: Relationship;
  note?: string;
  /** 'automation' (auto-link) | 'user' (confirmed via decision). */
  addedBy?: string;
}): Promise<{ assetThesisId: string; macroThesisId: string; relationshipType: Relationship }> {
  const relationshipType: Relationship = opts.relationshipType ?? 'related';

  await db
    .insert(assetThesisRelatedMacroTheses)
    .values({
      assetThesisId: opts.assetThesisId,
      macroThesisId: opts.macroThesisId,
      relationshipType,
      relationshipNote: opts.note ?? null,
      addedBy: opts.addedBy ?? 'automation',
    })
    .onConflictDoUpdate({
      target: [assetThesisRelatedMacroTheses.assetThesisId, assetThesisRelatedMacroTheses.macroThesisId],
      set: { relationshipType, relationshipNote: opts.note ?? null },
    });

  const [at] = await db.select({ title: assetTheses.title }).from(assetTheses).where(eq(assetTheses.id, opts.assetThesisId)).limit(1);
  const [mt] = await db.select({ title: macroTheses.title }).from(macroTheses).where(eq(macroTheses.id, opts.macroThesisId)).limit(1);

  await logToJournal({
    objectType: 'asset_thesis',
    objectId: opts.assetThesisId,
    objectTitle: at?.title,
    actionType: 'macro_linked',
    actionDescription: `Framed under macro "${mt?.title ?? opts.macroThesisId}" (${relationshipType})`,
    source: opts.addedBy === 'user' ? 'user' : 'automation',
    metadata: { macroThesisId: opts.macroThesisId, relationshipType },
  });

  return { assetThesisId: opts.assetThesisId, macroThesisId: opts.macroThesisId, relationshipType };
}

/** Remove an asset→macro framing link. Returns true if a row was deleted. */
export async function unlinkAssetMacro(assetThesisId: string, macroThesisId: string): Promise<boolean> {
  const deleted = await db
    .delete(assetThesisRelatedMacroTheses)
    .where(and(
      eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId),
      eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId),
    ))
    .returning({ id: assetThesisRelatedMacroTheses.id });
  return deleted.length > 0;
}
