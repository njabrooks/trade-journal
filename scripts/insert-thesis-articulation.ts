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

// Use dynamic imports to ensure dotenv loads first
async function loadDependencies() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });

  const { db, closePool } = await import('../src/db/index.js');
  const { onArticulationCreated } = await import('../src/lib/derived/thesisTriage.js');
  const { thesisArticulations, validationPoints: validationPointsTable } = await import('../src/db/schema.js');
  const { desc, eq, and } = await import('drizzle-orm');

  return { db, closePool, onArticulationCreated, thesisArticulations, validationPointsTable, desc, eq, and };
}

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

  // Parse input source BEFORE loading DB dependencies (avoids connection if just showing usage)
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

  // Load dependencies (this loads dotenv first, then DB)
  const { db, closePool, onArticulationCreated, thesisArticulations, validationPointsTable, desc, eq, and } = await loadDependencies();

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
  // Step 4: Notify triage system (THIS IS THE CRITICAL STEP)
  // -------------------------------------------------------------------------
  console.log('\nNotifying triage system...');
  await onArticulationCreated(thesisId, thesisType);
  console.log('✅ Triage system notified (claims count updated, triage records resolved)');

  // -------------------------------------------------------------------------
  // Step 5: Cleanup
  // -------------------------------------------------------------------------
  await closePool();

  console.log('\n✅ Thesis articulation upload complete!');
  console.log(`   Articulation ID: ${insertedArticulation.id}`);
  console.log(`   Version: ${nextVersion}`);
  console.log(`   Validation Points: ${validationPoints.length}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
