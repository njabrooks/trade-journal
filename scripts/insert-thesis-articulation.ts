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
  signals: signalsTable,
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
  // Support both old (validationPoints) and new (signals) field names
  signals?: Array<SignalInput>;
  validationPoints?: Array<SignalInput>; // Legacy support
}

interface SignalInput {
  type: 'confirmation' | 'warning' | 'validation' | 'invalidation'; // Support both old and new type values
  statement: string;
  rationale: string;
  category?: 'judgment' | 'data_driven' | 'explicit' | 'judgment_required'; // Optional - defaults to 'judgment'
  importance: 'critical' | 'significant' | 'supporting';
  timeframe: 'immediate' | 'medium_term' | 'secular';
  status?: 'not_triggered' | 'recommended'; // Default: 'recommended' for AI-generated signals
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

  const { thesisId, thesisType, articulation } = inputData;
  // Support both old (validationPoints) and new (signals) field names
  const signals = inputData.signals || inputData.validationPoints || [];

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

  // Get thesis for logging (used in multiple steps below)
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

  // -------------------------------------------------------------------------
  // Step 2b: Supersede existing signals (on re-articulation)
  // -------------------------------------------------------------------------
  // When re-articulating, mark all existing signals as 'superseded' so new ones take precedence.
  // User can later delete superseded signals or reinstate valuable ones.
  const existingSignals = await db
    .select({ id: signalsTable.id, status: signalsTable.status, statement: signalsTable.statement })
    .from(signalsTable)
    .where(
      and(
        eq(signalsTable.thesisId, thesisId),
        eq(signalsTable.thesisType, thesisType),
        sql`${signalsTable.status} != 'superseded'` // Don't re-supersede already superseded signals
      )
    );

  if (existingSignals.length > 0) {
    await db
      .update(signalsTable)
      .set({
        status: 'superseded',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(signalsTable.thesisId, thesisId),
          eq(signalsTable.thesisType, thesisType),
          sql`${signalsTable.status} != 'superseded'`
        )
      );

    console.log(`✅ Superseded ${existingSignals.length} existing signals`);

    // Log to journal
    await logToJournal({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesis?.title,
      actionType: 'signals_superseded',
      actionDescription: `Superseded ${existingSignals.length} existing signal(s) due to re-articulation`,
      skillInvoked: '/synthesize-thesis',
      previousState: {
        activeSignalCount: existingSignals.length,
      },
      newState: {
        supersededCount: existingSignals.length,
        reason: 're-articulation',
      },
      source: 'skill',
    });
  }

  // -------------------------------------------------------------------------
  // Step 3: Insert signals
  // -------------------------------------------------------------------------
  // Helper to convert old type values to new ones
  const normalizeType = (type: string): 'confirmation' | 'warning' => {
    if (type === 'validation') return 'confirmation';
    if (type === 'invalidation') return 'warning';
    return type as 'confirmation' | 'warning';
  };

  // Helper to normalize category - all signals start as 'judgment'
  // Category becomes 'data_driven' only when user configures explicit_details via UI
  const normalizeCategory = (cat?: string): 'judgment' | 'data_driven' => {
    // Legacy mapping and default to judgment
    if (!cat) return 'judgment';
    if (cat === 'explicit' || cat === 'data_driven') return 'judgment'; // Even "data-driven" suggestions start as judgment until user configures
    return 'judgment';
  };

  if (signals.length > 0) {
    const signalsToInsert = signals.map((sig) => ({
      thesisId,
      thesisType,
      articulationId: insertedArticulation.id,
      type: normalizeType(sig.type),
      statement: sig.statement,
      rationale: sig.rationale,
      category: normalizeCategory(sig.category), // Always 'judgment' until user configures data trigger
      importance: sig.importance,
      timeframe: sig.timeframe,
      explicitDetails: null, // Never pre-populate - user must configure via UI
      judgmentDetails: sig.judgmentDetails || null,
      responseProtocol: sig.responseProtocol,
      linkedClaimIds: sig.linkedClaimIds,
      dependentThesisId: sig.dependentThesisId || null,
      dependentThesisType: sig.dependentThesisType || null,
      dependentThesisCondition: sig.dependentThesisCondition || null,
      // Default to 'recommended' for AI-generated signals (user must review before they become active)
      status: (sig.status || 'recommended') as 'not_triggered' | 'triggered' | 'superseded' | 'recommended',
    }));

    const insertedSignals = await db
      .insert(signalsTable)
      .values(signalsToInsert)
      .returning();

    console.log(`✅ Inserted ${insertedSignals.length} signals`);

    // Count by type
    const confirmationCount = insertedSignals.filter((s) => s.type === 'confirmation').length;
    const warningCount = insertedSignals.filter((s) => s.type === 'warning').length;
    const recommendedCount = insertedSignals.filter((s) => s.status === 'recommended').length;
    console.log(`   - ${confirmationCount} confirmation, ${warningCount} warning`);
    if (recommendedCount > 0) {
      console.log(`   - ${recommendedCount} with 'recommended' status (pending user review)`);
    }
  } else {
    console.log('ℹ️  No signals to insert');
  }

  // -------------------------------------------------------------------------
  // Step 4: Update thesis and resolve triage (inline implementation)
  // -------------------------------------------------------------------------
  console.log('\nUpdating thesis and resolving triage...');

  // thesis was already queried earlier (after Step 2)
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
  // Step 4b: Create REVIEW_RECOMMENDED_SIGNALS triage if needed
  // -------------------------------------------------------------------------
  const recommendedSignalsInserted = signals.filter((s) => !s.status || s.status === 'recommended');
  if (recommendedSignalsInserted.length > 0) {
    // Check if triage record already exists
    const existingReviewTriage = await db
      .select()
      .from(thesisTriageRecords)
      .where(
        and(
          eq(thesisTriageRecords.thesisId, thesisId),
          eq(thesisTriageRecords.thesisType, thesisType),
          eq(thesisTriageRecords.triageRule, 'REVIEW_RECOMMENDED_SIGNALS'),
          sql`${thesisTriageRecords.status} != 'complete'`
        )
      )
      .limit(1);

    if (existingReviewTriage.length === 0) {
      // Create new triage record for signal review
      const [newTriage] = await db
        .insert(thesisTriageRecords)
        .values({
          thesisId,
          thesisType,
          thesisTitle: thesis?.title || 'Unknown',
          triageRule: 'REVIEW_RECOMMENDED_SIGNALS',
          triggerType: 'signal_recommendation',
          triggerSource: 'insert-thesis-articulation',
          severity: 'medium',
          urgency: 'this_week',
          status: 'attention',
          lifecycleStage: 'monitoring',
          suggestedSkill: null,
          actionRequired: `${recommendedSignalsInserted.length} AI-recommended signal(s) need review. Accept, modify, or reject each signal.`,
          contentSummary: {
            recommendedSignalCount: recommendedSignalsInserted.length,
            totalSignalCount: signals.length,
          },
          aiAnalysis: {},
          matchedResults: [],
        })
        .returning();

      // Log triage creation
      await logToJournal({
        objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
        objectId: thesisId,
        objectTitle: thesis?.title,
        actionType: 'triage_created',
        actionDescription: `Triage created: REVIEW_RECOMMENDED_SIGNALS. ${recommendedSignalsInserted.length} signal(s) need review.`,
        triageRecordId: newTriage.id,
        skillInvoked: '/synthesize-thesis',
        newState: {
          triageRule: 'REVIEW_RECOMMENDED_SIGNALS',
          status: 'attention',
          urgency: 'this_week',
        },
        source: 'skill',
      });

      console.log(`✅ Created REVIEW_RECOMMENDED_SIGNALS triage record`);
    } else {
      console.log(`ℹ️  REVIEW_RECOMMENDED_SIGNALS triage already exists`);
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Cleanup
  // -------------------------------------------------------------------------
  await closeDb();

  console.log('\n✅ Thesis articulation upload complete!');
  console.log(`   Articulation ID: ${insertedArticulation.id}`);
  console.log(`   Version: ${nextVersion}`);
  console.log(`   Signals: ${signals.length}`);
  console.log(`   Triage Records Resolved: ${articulationTriage.length}`);

  // Notify about recommended signals needing review
  const recommendedSignals = signals.filter((s) => !s.status || s.status === 'recommended');
  if (recommendedSignals.length > 0) {
    console.log(`\n⚠️  ${recommendedSignals.length} signal(s) have 'recommended' status and need user review.`);
    console.log('   A triage record will be created for batch review.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
