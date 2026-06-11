#!/usr/bin/env npx tsx
/**
 * Insert Thesis Articulation Script
 *
 * Permanent reusable script for inserting thesis articulations and validation points.
 * Called by the build-core-argument skill instead of generating temp scripts.
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
  claimThesisMappings,
  signalEntityLinks,
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
  type: 'confirmation' | 'invalidation' | 'completion' | 'validation' | 'warning'; // validation/warning are legacy, mapped to confirmation/invalidation
  statement: string;
  notes?: string; // Why this matters + what action to take when triggered
  rationale?: string; // @deprecated - migrated to notes
  category?: 'judgment' | 'data_driven' | 'explicit' | 'judgment_required'; // Optional - defaults to 'judgment'
  importance?: 'critical' | 'significant' | 'supporting'; // Optional - defaults to 'critical' (focused signals are all critical)
  timeframe?: 'immediate' | 'medium_term' | 'secular'; // @deprecated
  status?: 'draft' | 'active' | 'complete' | 'rejected'; // Default: 'active' (focused signals go directly to monitoring)
  explicitDetails?: {
    metric: string;
    threshold: string;
    dataSources: string[];
    monitoringFrequency: string;
    dataSource?: 'fred' | 'price_iv';
    operator?: string;
    value?: number;
  };
  judgmentDetails?: { // @deprecated - migrated to notes
    observableProxies: string[];
    judgmentCriteria: string;
    reviewFrequency: string;
  };
  responseProtocol?: { // @deprecated - migrated to notes
    description: string;
    escalation?: 'review_thesis' | 'reduce_exposure' | 'exit' | 'increase_exposure';
  };
  linkedClaimIds?: string[];
  dependentThesisId?: string;
  dependentThesisType?: 'macro' | 'asset';
  dependentThesisCondition?: 'invalidated' | 'confidence_drops' | 'status_changes';
  // Articulation provenance — which section/driver generated this signal
  sourceSection?: 'key_driver' | 'key_assumption' | 'timeframe' | 'dependency';
  sourceDriverIndex?: number;
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
      status: thesisTable.status,
      claimsCountAtLastArticulation: thesisTable.claimsCountAtLastArticulation,
    })
    .from(thesisTable)
    .where(eq(thesisTable.id, thesisId))
    .limit(1);

  // -------------------------------------------------------------------------
  // Step 2b: Supersede existing signals (on re-articulation)
  // -------------------------------------------------------------------------
  // When re-articulating, mark all existing signals as 'rejected' so new ones take precedence.
  // User can later delete rejected signals or reinstate valuable ones.
  const existingSignalRows = await db
    .select({ id: signalsTable.id, status: signalsTable.status, statement: signalsTable.statement })
    .from(signalsTable)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signalsTable.id))
    .where(
      and(
        eq(signalEntityLinks.thesisId, thesisId),
        eq(signalEntityLinks.thesisType, thesisType),
        sql`${signalsTable.status} IN ('draft', 'active')` // Only supersede draft/active signals
      )
    );
  const existingSignals = existingSignalRows;

  if (existingSignals.length > 0) {
    const existingIds = existingSignals.map(s => s.id);
    await db
      .update(signalsTable)
      .set({
        status: 'rejected',
        updatedAt: new Date(),
      })
      .where(sql`${signalsTable.id} IN (${sql.join(existingIds.map(id => sql`${id}`), sql`, `)})`);

    console.log(`✅ Superseded ${existingSignals.length} existing signals (marked as rejected)`);

    // Log to journal
    await logToJournal({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesis?.title,
      actionType: 'signals_superseded',
      actionDescription: `Superseded ${existingSignals.length} existing signal(s) due to re-articulation (marked as rejected)`,
      skillInvoked: '/build-core-argument',
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
  const normalizeType = (type: string): 'confirmation' | 'invalidation' | 'completion' => {
    if (type === 'validation') return 'confirmation';
    if (type === 'warning') return 'invalidation';
    return type as 'confirmation' | 'invalidation' | 'completion';
  };

  // Helper to normalize category - all signals start as 'judgment'
  // Category becomes 'data_driven' only when user configures explicit_details via UI
  const normalizeCategory = (cat?: string): 'judgment' | 'data_driven' => {
    // Legacy mapping and default to judgment
    if (!cat) return 'judgment';
    if (cat === 'explicit' || cat === 'data_driven') return 'judgment'; // Even "data-driven" suggestions start as judgment until user configures
    return 'judgment';
  };

  // Helper to merge deprecated fields into notes
  const buildNotes = (sig: SignalInput): string | null => {
    // If notes is provided directly, use it
    if (sig.notes) return sig.notes;

    // Otherwise, merge deprecated fields
    const parts: string[] = [];
    if (sig.rationale) parts.push(`Rationale: ${sig.rationale}`);
    if (sig.responseProtocol?.description) parts.push(`Response: ${sig.responseProtocol.description}`);
    if (sig.judgmentDetails?.judgmentCriteria) parts.push(`Judgment Criteria: ${sig.judgmentDetails.judgmentCriteria}`);

    return parts.length > 0 ? parts.join('\n\n') : null;
  };

  let signalsCreatedCount = 0;

  if (signals.length > 0) {
    const signalsToInsert = signals.map((sig) => ({
      articulationId: insertedArticulation.id,
      type: normalizeType(sig.type),
      statement: sig.statement,
      notes: buildNotes(sig), // New simplified field
      rationale: sig.rationale || null, // @deprecated - kept for backwards compatibility
      category: normalizeCategory(sig.category), // Always 'judgment' until user configures data trigger
      importance: sig.importance || 'critical', // Focused signals are all critical by default
      timeframe: sig.timeframe || null, // @deprecated
      explicitDetails: null, // Never pre-populate - user must configure via UI
      judgmentDetails: sig.judgmentDetails || null, // @deprecated
      responseProtocol: sig.responseProtocol || null, // @deprecated
      linkedClaimIds: sig.linkedClaimIds || [],
      dependentThesisId: sig.dependentThesisId || null,
      dependentThesisType: sig.dependentThesisType || null,
      dependentThesisCondition: sig.dependentThesisCondition || null,
      // Articulation provenance
      sourceSection: sig.sourceSection || null,
      sourceDriverIndex: sig.sourceDriverIndex ?? null,
      // Default to 'active' - focused signals go directly to monitoring (no draft review workflow)
      status: (sig.status || 'active') as 'draft' | 'active' | 'complete' | 'rejected',
    }));

    const insertedSignals = await db
      .insert(signalsTable)
      .values(signalsToInsert)
      .returning();

    // Create junction table links for each inserted signal
    if (insertedSignals.length > 0) {
      await db.insert(signalEntityLinks).values(
        insertedSignals.map(s => ({
          signalId: s.id,
          entityType: 'thesis' as const,
          thesisId,
          thesisType,
        }))
      );
    }

    // Log journal entry for each created signal
    for (const sig of insertedSignals) {
      await logToJournal({
        objectType: 'signal',
        objectId: sig.id,
        objectTitle: sig.statement,
        actionType: 'created',
        actionDescription: `Signal created: "${sig.statement}" (type: ${sig.type}, importance: ${sig.importance})`,
        source: 'automation',
      });
    }

    signalsCreatedCount = insertedSignals.length;
    console.log(`✅ Inserted ${insertedSignals.length} signals (with journal entries)`);

    // Count by type
    const confirmationCount = insertedSignals.filter((s) => s.type === 'confirmation').length;
    const invalidationCount = insertedSignals.filter((s) => s.type === 'invalidation').length;
    const completionCount = insertedSignals.filter((s) => s.type === 'completion').length;
    console.log(`   - ${confirmationCount} confirmation, ${invalidationCount} invalidation, ${completionCount} completion`);
  } else {
    console.log('ℹ️  No signals to insert');
  }

  // -------------------------------------------------------------------------
  // Step 4: Update thesis (inline implementation)
  // -------------------------------------------------------------------------
  console.log('\nUpdating thesis...');

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
    // Only promote developing → monitoring if signals were actually created
    const currentStatus = (thesis as any).status;
    const updateFields: Record<string, any> = {
      claimsCountAtLastArticulation: currentClaimCount,
      updatedAt: new Date(),
    };
    const shouldPromote = currentStatus === 'developing' && signalsCreatedCount > 0;
    if (shouldPromote) {
      updateFields.status = 'monitoring';
    }
    await db
      .update(thesisTable)
      .set(updateFields)
      .where(eq(thesisTable.id, thesisId));
    console.log(`✅ Updated ${thesisType} thesis claims count: ${previousClaimsCount} → ${currentClaimCount}`);
    if (shouldPromote) {
      console.log(`✅ Promoted thesis status: developing → monitoring (${signalsCreatedCount} signals created)`);
    } else if (currentStatus === 'developing' && signalsCreatedCount === 0) {
      console.log(`ℹ️  Thesis remains at 'developing' — no signals created. Configure signals to promote to monitoring.`);
    }

    // Log articulation creation to journal
    await logToJournal({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesis.title,
      actionType: 'articulation_created',
      actionDescription: `Thesis articulation created/updated with ${currentClaimCount} claims`,
      skillInvoked: '/build-core-argument',
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

  // Note: REVIEW_RECOMMENDED_SIGNALS triage creation removed.
  // Focused signals (max 5 per thesis) go directly to 'active' status.

  // -------------------------------------------------------------------------
  // Step 5: Cleanup
  // -------------------------------------------------------------------------
  await closeDb();

  console.log('\n✅ Thesis articulation upload complete!');
  console.log(`   Articulation ID: ${insertedArticulation.id}`);
  console.log(`   Version: ${nextVersion}`);
  console.log(`   Signals: ${signals.length}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
