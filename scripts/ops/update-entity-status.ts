#!/usr/bin/env tsx

/**
 * Update status of a lifecycle entity with journal logging
 *
 * Usage:
 *   npx tsx scripts/ops/update-entity-status.ts \
 *     --entity-type macro_thesis \
 *     --id <uuid> \
 *     --status active \
 *     --rationale "Research complete, promoting to active"
 *
 * Valid transitions: draft→active, active→complete, active→rejected, draft→rejected
 * Supported entity types: macro_thesis, asset_thesis, main_claim, signal, strategy
 */

import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { eq, and, inArray } from 'drizzle-orm';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      args[key] = argv[i + 1] || '';
      i++;
    }
  }
  return args;
}

const ENTITY_CONFIG: Record<string, { table: any; objectType: string }> = {
  macro_thesis: { table: schema.macroTheses, objectType: 'macro_thesis' },
  asset_thesis: { table: schema.assetTheses, objectType: 'asset_thesis' },
  main_claim: { table: schema.mainClaims, objectType: 'claim' },
  signal: { table: schema.signals, objectType: 'signal' },
  strategy: { table: schema.strategies, objectType: 'strategy' },
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'developing', 'rejected'],
  developing: ['monitoring', 'complete', 'rejected'],
  monitoring: ['developing', 'complete', 'rejected'],
  active: ['complete', 'rejected'],  // for non-thesis entities (claims, signals, strategies)
  complete: ['active', 'developing'],  // reopen
  rejected: ['draft'],   // reconsider
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const entityType = args.entity_type;
  const id = args.id;
  const newStatus = args.status;
  const rationale = args.rationale;

  if (!entityType || !id || !newStatus || !rationale) {
    console.error('Required: --entity-type, --id, --status, --rationale');
    process.exit(1);
  }

  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    console.error(`Unknown entity type: ${entityType}. Supported: ${Object.keys(ENTITY_CONFIG).join(', ')}`);
    process.exit(1);
  }

  // Fetch current entity
  const [entity] = await db.select().from(config.table).where(eq(config.table.id, id));
  if (!entity) {
    console.error(`${entityType} with id ${id} not found`);
    process.exit(1);
  }

  const previousStatus = (entity as any).status;

  // Validate transition
  const allowed = VALID_TRANSITIONS[previousStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    console.error(`Invalid transition: ${previousStatus} → ${newStatus}. Allowed from '${previousStatus}': ${allowed?.join(', ') || 'none'}`);
    process.exit(1);
  }

  // Update status
  await db.update(config.table)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(config.table.id, id));

  const entityTitle = (entity as any).title || (entity as any).label || (entity as any).strategyKey || (entity as any).statement || `${entityType} ${id.slice(0, 8)}`;

  const journalEntryId = await logToJournal({
    objectType: config.objectType,
    objectId: id,
    objectTitle: entityTitle,
    actionType: 'status_change',
    actionDescription: `Status changed from ${previousStatus} to ${newStatus}: ${rationale}`,
    previousState: { status: previousStatus },
    newState: { status: newStatus },
    rationale,
    source: 'user',
  });

  // Cascade invalidation for macro thesis → rejected
  let cascadeResult: { affectedAssetTheses: number; affectedMacroTheses: number } | null = null;
  if (entityType === 'macro_thesis' && newStatus === 'rejected' && previousStatus !== 'rejected') {
    // Find gated_by asset theses
    const gatedAssets = await db
      .select({ id: schema.assetThesisRelatedMacroTheses.assetThesisId, title: schema.assetTheses.title })
      .from(schema.assetThesisRelatedMacroTheses)
      .innerJoin(schema.assetTheses, eq(schema.assetTheses.id, schema.assetThesisRelatedMacroTheses.assetThesisId))
      .where(
        and(
          eq(schema.assetThesisRelatedMacroTheses.macroThesisId, id),
          eq(schema.assetThesisRelatedMacroTheses.relationshipType, 'gated_by'),
          inArray(schema.assetTheses.status, ['developing', 'monitoring'])
        )
      );

    // Find dependent macro theses
    const depMacros = await db
      .select({ id: schema.macroThesisRelatedMacroTheses.targetMacroThesisId, title: schema.macroTheses.title })
      .from(schema.macroThesisRelatedMacroTheses)
      .innerJoin(schema.macroTheses, eq(schema.macroTheses.id, schema.macroThesisRelatedMacroTheses.targetMacroThesisId))
      .where(
        and(
          eq(schema.macroThesisRelatedMacroTheses.sourceMacroThesisId, id),
          inArray(schema.macroThesisRelatedMacroTheses.relationshipType, ['parent_of', 'depends_on']),
          inArray(schema.macroTheses.status, ['developing', 'monitoring'])
        )
      );

    const affected = [...gatedAssets, ...depMacros];
    for (const dep of affected) {
      const depType = gatedAssets.some(a => a.id === dep.id) ? 'asset_thesis' : 'macro_thesis';
      await logToJournal({
        objectType: depType,
        objectId: dep.id,
        objectTitle: dep.title,
        actionType: 'triage_created',
        actionDescription: `MACRO_THESIS_INVALIDATED: Parent macro thesis "${entityTitle}" rejected. Re-evaluate this thesis.`,
        source: 'automation',
      });
    }
    cascadeResult = { affectedAssetTheses: gatedAssets.length, affectedMacroTheses: depMacros.length };
    if (affected.length > 0) {
      console.error(`Cascaded MACRO_THESIS_INVALIDATED to ${gatedAssets.length} asset theses, ${depMacros.length} macro theses`);
    }
  }

  console.log(JSON.stringify({
    success: true,
    previousStatus,
    newStatus,
    journalEntryId,
    ...(cascadeResult ? { cascade: cascadeResult } : {}),
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
