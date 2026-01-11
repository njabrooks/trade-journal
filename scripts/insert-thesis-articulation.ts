#!/usr/bin/env npx tsx
/**
 * Insert Thesis Articulation Script
 *
 * Permanent reusable script for inserting thesis articulations and validation points.
 * Called by the synthesize-thesis skill instead of generating temp scripts.
 *
 * Usage:
 *   npx tsx scripts/insert-thesis-articulation.ts --input articulation-data.json
 *   cat articulation-data.json | npx tsx scripts/insert-thesis-articulation.ts --stdin
 *
 * The JSON input should have this structure:
 * {
 *   "thesisId": "uuid",
 *   "thesisType": "macro" | "asset",
 *   "articulation": { ... articulation fields ... },
 *   "validationPoints": [ ... validation point objects ... ]
 * }
 */

import * as fs from 'fs';
import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { desc, eq, and, sql } from 'drizzle-orm';

const {
  thesisArticulations,
  validationPoints: validationPointsTable,
  macroTheses,
  assetTheses,
  thesisTriageRecords,
  claimThesisMappings,
} = schema;

// ============================================================================
// Types
// ============================================================================

interface ArticulationInput {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  articulation: {
    coreArgument: string;
    keyDrivers: Array<{
      driver: string;
      detail?: string;
      supporting_claims?: string[];
    }>;
    keyAssumptions: Array<{
      assumption: string;
      detail?: string;
    }>;
    timeframe: {
      horizon: string;
      expectedResolution?: string;
      keyMilestones?: string[];
    };
    confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
    confidenceRationale: string;
    evidenceGaps: string[];
    claimIdsUsed: string[];
    referencedTheses?: Array<{
      thesisId: string;
      thesisType: 'macro' | 'asset';
      title: string;
      relationship: 'depends_on' | 'supports' | 'contradicts';
      notes?: string;
    }>;
    userEdits?: string | null;
  };
  validationPoints: Array<{
    type: 'validation' | 'invalidation';
    statement: string;
    rationale: string;
    category: 'explicit' | 'judgment_required';
    importance: 'critical' | 'significant' | 'supporting';
    timeframe: 'immediate' | 'medium_term' | 'secular';
    explicitDetails?: {
      metric: string;
      threshold: string;
      dataSources: string[];
      monitoringFrequency: string;
      dataSource?: 'fred' | 'price_iv';
      operator?: string;
      value?: number;
    };
    judgmentDetails?: {
      observableProxies: string[];
      judgmentCriteria: string;
      reviewFrequency: string;
    };
    responseProtocol: {
      description: string;
      escalation?: 'review_thesis' | 'reduce_exposure' | 'exit' | 'increase_exposure';
    };
    linkedClaimIds: string[];
    dependentThesisId?: string;
    dependentThesisType?: 'macro' | 'asset';
    dependentThesisCondition?: 'invalidated' | 'confidence_drops' | 'status_changes';
  }>;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  let inputData: ArticulationInput;

  // Parse input source
  if (args.includes('--stdin')) {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const jsonString = Buffer.concat(chunks).toString('utf-8');
    inputData = JSON.parse(jsonString);
  } else if (args.includes('--input')) {
    const inputIndex = args.indexOf('--input');
    const filePath = args[inputIndex + 1];
    if (!filePath) {
      console.error('Error: --input requires a file path');
      process.exit(1);
    }
    const jsonString = fs.readFileSync(filePath, 'utf-8');
    inputData = JSON.parse(jsonString);
  } else {
    console.error('Usage:');
    console.error('  npx tsx scripts/insert-thesis-articulation.ts --input <file.json>');
    console.error('  cat <file.json> | npx tsx scripts/insert-thesis-articulation.ts --stdin');
    process.exit(1);
  }

  const { thesisId, thesisType, articulation, validationPoints } = inputData;

  console.log(`\nInserting articulation for ${thesisType} thesis: ${thesisId}`);

  // -------------------------------------------------------------------------
  // Step 1: Determine next version number
  // -------------------------------------------------------------------------
  const existing = await db
    .select({ version: thesisArticulations.version })
    .from(thesisArticulations)
    .where(
      and(
        eq(thesisArticulations.thesisId, thesisId),
        eq(thesisArticulations.thesisType, thesisType)
      )
    )
    .orderBy(desc(thesisArticulations.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  console.log(`Version: ${nextVersion}`);

  // -------------------------------------------------------------------------
  // Step 2: Insert articulation
  // -------------------------------------------------------------------------
  const [insertedArticulation] = await db
    .insert(thesisArticulations)
    .values({
      thesisId,
      thesisType,
      version: nextVersion,
      coreArgument: articulation.coreArgument,
      keyDrivers: articulation.keyDrivers,
      keyAssumptions: articulation.keyAssumptions,
      timeframe: articulation.timeframe,
      confidenceLevel: articulation.confidenceLevel,
      confidenceRationale: articulation.confidenceRationale,
      evidenceGaps: articulation.evidenceGaps,
      claimIdsUsed: articulation.claimIdsUsed,
      referencedTheses: articulation.referencedTheses || [],
      generatedBy: 'claude',
      userEdits: articulation.userEdits || null,
    })
    .returning();

  console.log(`✅ Articulation created: ${insertedArticulation.id}`);

  // -------------------------------------------------------------------------
  // Step 3: Insert validation points
  // -------------------------------------------------------------------------
  if (validationPoints.length > 0) {
    const pointsToInsert = validationPoints.map((vp) => ({
      thesisId,
      thesisType,
      articulationId: insertedArticulation.id,
      type: vp.type,
      statement: vp.statement,
      rationale: vp.rationale,
      category: vp.category,
      importance: vp.importance,
      timeframe: vp.timeframe,
      explicitDetails: vp.explicitDetails || null,
      judgmentDetails: vp.judgmentDetails || null,
      responseProtocol: vp.responseProtocol,
      linkedClaimIds: vp.linkedClaimIds,
      dependentThesisId: vp.dependentThesisId || null,
      dependentThesisType: vp.dependentThesisType || null,
      dependentThesisCondition: vp.dependentThesisCondition || null,
      status: 'not_triggered' as const,
    }));

    const insertedPoints = await db
      .insert(validationPointsTable)
      .values(pointsToInsert)
      .returning();

    console.log(`✅ Inserted ${insertedPoints.length} validation points`);

    // Count by type
    const validationCount = insertedPoints.filter((p) => p.type === 'validation').length;
    const invalidationCount = insertedPoints.filter((p) => p.type === 'invalidation').length;
    console.log(`   - ${validationCount} validation, ${invalidationCount} invalidation`);
  } else {
    console.log('ℹ️  No validation points to insert');
  }

  // -------------------------------------------------------------------------
  // Step 4: Update thesis and resolve triage (inline implementation)
  // -------------------------------------------------------------------------
  console.log('\nUpdating thesis and resolving triage...');

  // Get thesis for logging
  const thesisTable = thesisType === 'macro' ? macroTheses : assetTheses;
  const [thesis] = await db
    .select({
      id: thesisTable.id,
      title: thesisTable.title,
      claimsCountAtLastArticulation: thesisTable.claimsCountAtLastArticulation,
    })
    .from(thesisTable)
    .where(eq(thesisTable.id, thesisId))
    .limit(1);

  if (!thesis) {
    console.warn(`Thesis not found: ${thesisType}/${thesisId}`);
  } else {
    // Get current claim count from claim_thesis_mappings
    const claimCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(claimThesisMappings)
      .where(
        thesisType === 'macro'
          ? eq(claimThesisMappings.macroThesisId, thesisId)
          : eq(claimThesisMappings.assetThesisId, thesisId)
      );
    const currentClaimCount = claimCountResult[0]?.count ?? 0;
    const previousClaimsCount = thesis.claimsCountAtLastArticulation ?? 0;

    // Update thesis with current claim count
    await db
      .update(thesisTable)
      .set({
        claimsCountAtLastArticulation: currentClaimCount,
        updatedAt: new Date(),
      })
      .where(eq(thesisTable.id, thesisId));
    console.log(`✅ Updated ${thesisType} thesis claims count: ${previousClaimsCount} → ${currentClaimCount}`);

    // Log articulation creation to journal
    await logToJournal({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesis.title,
      actionType: 'articulation_created',
      actionDescription: `Thesis articulation created/updated with ${currentClaimCount} claims`,
      skillInvoked: '/synthesize-thesis',
      previousState: {
        claimsCountAtLastArticulation: previousClaimsCount,
      },
      newState: {
        claimsCountAtLastArticulation: currentClaimCount,
        hasArticulation: true,
      },
      source: 'skill',
    });
    console.log('✅ Journal entry created');
  }

  // Resolve any attention/info articulation-related triage records
  const pendingTriage = await db
    .select()
    .from(thesisTriageRecords)
    .where(
      and(
        eq(thesisTriageRecords.thesisId, thesisId),
        eq(thesisTriageRecords.thesisType, thesisType),
        sql`${thesisTriageRecords.status} IN ('attention', 'info')`
      )
    );

  const articulationTriage = pendingTriage.filter(
    (t) =>
      t.triageRule === 'UPDATE_CORE_ARGUMENT' ||
      t.triageRule === 'PRODUCE_CORE_ARGUMENT' ||
      t.triageRule === 'NEEDS_RESEARCH' ||
      t.triageRule === 'thesis_new_claims_available' ||
      t.triageRule === 'thesis_needs_articulation'
  );

  for (const triage of articulationTriage) {
    await db
      .update(thesisTriageRecords)
      .set({
        status: 'complete',
        completedAt: new Date(),
        completedBy: 'articulation_created',
      })
      .where(eq(thesisTriageRecords.id, triage.id));

    // Log triage resolution
    await logToJournal({
      objectType: triage.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: triage.thesisId,
      objectTitle: thesis?.title,
      actionType: 'triage_resolved',
      actionDescription: `Triage record resolved: ${triage.triageRule}`,
      triageRecordId: triage.id,
      skillInvoked: '/synthesize-thesis',
      previousState: { status: 'pending' },
      newState: { status: 'complete', completedBy: 'articulation_created' },
      source: 'skill',
    });
  }
  console.log(`✅ Resolved ${articulationTriage.length} triage records`);

  // -------------------------------------------------------------------------
  // Step 5: Cleanup
  // -------------------------------------------------------------------------
  await closeDb();

  console.log('\n✅ Thesis articulation upload complete!');
  console.log(`   Articulation ID: ${insertedArticulation.id}`);
  console.log(`   Version: ${nextVersion}`);
  console.log(`   Validation Points: ${validationPoints.length}`);
  console.log(`   Triage Records Resolved: ${articulationTriage.length}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
