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
 *   npx tsx scripts/insert-thesis-articulation.ts --input data.json --dry-run   # preview (incl. sensor carry-forward), no write
 *
 * The JSON input should have this structure:
 * {
 *   "thesisId": "uuid",
 *   "thesisType": "macro" | "asset",
 *   "articulation": { ... articulation fields ... },
 *   "signals": [ ... signal objects ... ]      // (validationPoints accepted as legacy alias)
 * }
 *
 * Sensor carry-forward (docs/v2/14 §9, P3): a signal may set "supersedesSignalId" to the
 * prior signal whose STATEMENT it continues. The new row points back via supersedes_signal_id
 * and inherits that prior signal's SENSOR (explicit_details) when it is a real one — so a
 * decision-grade sensor survives statement iteration rather than being orphaned on each
 * re-underwrite. Vestigial qualitative details are NOT carried (the statement re-enters the
 * observe loop). Fresh statements (no supersedesSignalId) behave exactly as before.
 */

import * as fs from 'fs';
import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { desc, eq, and, inArray, sql } from 'drizzle-orm';
import { resolveSensorCarryForward, parseSensor, describeSensor } from '@/lib/derived/signalSensor';
import { getDecisionPacket, type DecisionResolution } from '@/lib/types/decisions';
import { provenanceKey, isPacketIncorporated } from '@/lib/derived/decisionRetirement';

const {
  thesisArticulations,
  signals: signalsTable,
  macroTheses,
  assetTheses,
  claimThesisMappings,
  signalEntityLinks,
  mainClaims,
  journalEntries,
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
  // Statement↔sensor lineage (docs/v2/14 §9, P3). When this re-underwritten statement
  // CONTINUES a prior signal, set its id here: the new row points back via
  // supersedes_signal_id AND inherits the prior signal's SENSOR (explicit_details) so a
  // decision-grade sensor survives statement iteration instead of being orphaned. Only a
  // REAL sensor is carried (vestigial qualitative blobs drop to statement-only); set by the
  // re-underwriting agent's judgment that "this statement measures the same thing".
  supersedesSignalId?: string;
}

/** What a prior signal contributes to a continuation (its sensor), resolved before insert. */
interface CarryForward {
  explicitDetails: unknown; // the sensor to copy, or null (statement-only)
  category: 'judgment' | 'data_driven';
  note: string; // human description for the run summary
}

/**
 * Gap 1 (confidence sync): the synthesized confidence lives on the articulation, but the
 * thesis record's own confidence_level field had no sync path and silently drifted from its
 * latest underwriting (e.g. TAO articulation said 'low' while the thesis field still read
 * 'medium'). Map the articulation enum (low|medium|high|very_high) onto the thesis enum
 * (low|medium|high|exploratory) and write it back on every articulation. `very_high`
 * collapses to `high`; an articulation never emits 'exploratory', so a manual 'exploratory'
 * is replaced by the synthesized level — the articulation is the source of truth for confidence.
 */
const THESIS_CONFIDENCE_FROM_ARTICULATION: Record<
  ArticulationInput['articulation']['confidenceLevel'],
  'low' | 'medium' | 'high'
> = { low: 'low', medium: 'medium', high: 'high', very_high: 'high' };

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
  const dryRun = args.includes('--dry-run');

  // Signal-shaping helpers (hoisted so the dry-run preview can use them too).
  const normalizeType = (type: string): 'confirmation' | 'invalidation' | 'completion' => {
    if (type === 'validation') return 'confirmation';
    if (type === 'warning') return 'invalidation';
    return type as 'confirmation' | 'invalidation' | 'completion';
  };
  // All fresh signals start 'judgment'; 'data_driven' is reached only via sensor carry-forward.
  const normalizeCategory = (cat?: string): 'judgment' | 'data_driven' => {
    if (!cat) return 'judgment';
    if (cat === 'explicit' || cat === 'data_driven') return 'judgment';
    return 'judgment';
  };
  const buildNotes = (sig: SignalInput): string | null => {
    if (sig.notes) return sig.notes;
    const parts: string[] = [];
    if (sig.rationale) parts.push(`Rationale: ${sig.rationale}`);
    if (sig.responseProtocol?.description) parts.push(`Response: ${sig.responseProtocol.description}`);
    if (sig.judgmentDetails?.judgmentCriteria) parts.push(`Judgment Criteria: ${sig.judgmentDetails.judgmentCriteria}`);
    return parts.length > 0 ? parts.join('\n\n') : null;
  };

  // -------------------------------------------------------------------------
  // Sensor carry-forward (docs/v2/14 §9, P3): resolve the prior signals that the new
  // statements continue, so a real sensor survives statement iteration. Built before any
  // write so --dry-run can preview it. Keyed by prior signal id.
  // -------------------------------------------------------------------------
  const supersededIds = [...new Set(signals.map((s) => s.supersedesSignalId).filter((x): x is string => !!x))];
  const carryMap = new Map<string, CarryForward>();
  if (supersededIds.length > 0) {
    const priors = await db
      .select({ id: signalsTable.id, statement: signalsTable.statement, explicitDetails: signalsTable.explicitDetails, category: signalsTable.category })
      .from(signalsTable)
      .where(inArray(signalsTable.id, supersededIds));
    const priorById = new Map(priors.map((p) => [p.id, p]));
    for (const id of supersededIds) {
      const prior = priorById.get(id);
      if (!prior) {
        console.warn(`⚠️  supersedesSignalId ${id} not found — lineage skipped for the continuation referencing it`);
        continue;
      }
      const carried = resolveSensorCarryForward({ explicitDetails: prior.explicitDetails, category: prior.category });
      carryMap.set(id, carried
        ? { explicitDetails: carried.explicitDetails, category: 'data_driven', note: `carries ${describeSensor(parseSensor(prior.explicitDetails, prior.category))} from prior signal` }
        : { explicitDetails: null, category: 'judgment', note: prior.explicitDetails != null ? 'prior had no real sensor (vestigial details dropped) — statement-only lineage' : 'statement-only lineage' });
    }
  }

  console.log(`\n${dryRun ? '[dry-run] Would insert' : 'Inserting'} articulation for ${thesisType} thesis: ${thesisId}`);

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
  // Dry-run: print the plan (incl. sensor carry-forward) and exit before any write.
  // -------------------------------------------------------------------------
  if (dryRun) {
    console.log('\n[dry-run] Plan:');
    console.log(`  Articulation: v${nextVersion} (${signals.length} signal(s))`);
    for (const sig of signals) {
      const cf = sig.supersedesSignalId ? carryMap.get(sig.supersedesSignalId) : undefined;
      const sensorNote = cf
        ? cf.explicitDetails != null ? `← SENSOR carried (${cf.note})` : `← lineage only (${cf.note})`
        : 'no sensor (fresh statement)';
      console.log(`  · [${normalizeType(sig.type)}] ${sig.statement.slice(0, 72)}`);
      console.log(`        ${sig.supersedesSignalId ? `supersedes ${sig.supersedesSignalId} — ` : ''}${sensorNote}`);
    }
    await closeDb();
    process.exit(0);
  }

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
      confidenceLevel: thesisTable.confidenceLevel,
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
  let signalsCreatedCount = 0;

  if (signals.length > 0) {
    const signalsToInsert = signals.map((sig) => {
      // Sensor carry-forward (docs/v2/14 §9, P3): a continuation inherits the prior
      // signal's REAL sensor + records the statement↔sensor lineage. Default stays
      // explicit_details=null / judgment (fresh statement) exactly as before.
      const cf = sig.supersedesSignalId ? carryMap.get(sig.supersedesSignalId) : undefined;
      const carriedExplicit = cf ? cf.explicitDetails : null;
      const category = cf && carriedExplicit != null ? 'data_driven' : normalizeCategory(sig.category);
      return {
        articulationId: insertedArticulation.id,
        type: normalizeType(sig.type),
        statement: sig.statement,
        notes: buildNotes(sig), // New simplified field
        rationale: sig.rationale || null, // @deprecated - kept for backwards compatibility
        category, // 'judgment' for fresh; 'data_driven' when a real sensor is carried forward
        importance: sig.importance || 'critical', // Focused signals are all critical by default
        timeframe: sig.timeframe || null, // @deprecated
        explicitDetails: carriedExplicit, // null unless a real sensor is carried from supersedesSignalId
        judgmentDetails: sig.judgmentDetails || null, // @deprecated
        responseProtocol: sig.responseProtocol || null, // @deprecated
        linkedClaimIds: sig.linkedClaimIds || [],
        dependentThesisId: sig.dependentThesisId || null,
        dependentThesisType: sig.dependentThesisType || null,
        dependentThesisCondition: sig.dependentThesisCondition || null,
        // Articulation provenance
        sourceSection: sig.sourceSection || null,
        sourceDriverIndex: sig.sourceDriverIndex ?? null,
        // Statement↔sensor lineage — set only when the referenced prior signal exists.
        supersedesSignalId: sig.supersedesSignalId && carryMap.has(sig.supersedesSignalId) ? sig.supersedesSignalId : null,
        // Default to 'active' - focused signals go directly to monitoring (no draft review workflow)
        status: (sig.status || 'active') as 'draft' | 'active' | 'complete' | 'rejected',
      };
    });

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
    const carriedCount = insertedSignals.filter((s) => s.explicitDetails != null).length;
    if (carriedCount > 0) console.log(`   - ${carriedCount} sensor(s) carried forward across re-underwrite (statement↔sensor lineage preserved)`);
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

    // Update thesis claim count + sync confidence from this articulation (Gap 1).
    // Status is NOT touched here.
    //
    // W8/B5 decouple: the expression-driven lifecycle cascade
    // (src/lib/derived/thesisCascade.ts) owns thesis status now — a thesis is
    // `monitoring` because it has live expression (an active strategy), not
    // because an articulation produced signals. Pre-W8 this promoted
    // developing→monitoring when signalsCreatedCount > 0; that signal gate is
    // removed so articulation (digest + signal synthesis) is purely additive and
    // can run at any lifecycle stage without moving the thesis.
    //
    // Confidence, unlike status, IS owned by the underwriting: the synthesized
    // confidence is written back so the thesis field tracks its latest articulation
    // instead of drifting (the gap that left TAO reading 'medium' under a 'low' v1).
    const previousConfidence = thesis.confidenceLevel;
    const syncedConfidence = THESIS_CONFIDENCE_FROM_ARTICULATION[articulation.confidenceLevel];
    await db
      .update(thesisTable)
      .set({
        claimsCountAtLastArticulation: currentClaimCount,
        confidenceLevel: syncedConfidence,
        updatedAt: new Date(),
      })
      .where(eq(thesisTable.id, thesisId));
    console.log(`✅ Updated ${thesisType} thesis claims count: ${previousClaimsCount} → ${currentClaimCount}`);
    if (previousConfidence !== syncedConfidence) {
      console.log(`✅ Synced thesis confidence from articulation: ${previousConfidence ?? 'null'} → ${syncedConfidence}`);
    }
    console.log(`ℹ️  Thesis status unchanged (lifecycle cascade owns status; ${signalsCreatedCount} signal(s) created this run)`);

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
        confidenceLevel: previousConfidence,
      },
      newState: {
        claimsCountAtLastArticulation: currentClaimCount,
        confidenceLevel: syncedConfidence,
        hasArticulation: true,
      },
      source: 'skill',
    });
    console.log('✅ Journal entry created');
  }

  // -------------------------------------------------------------------------
  // Step 4b: Retire decision packets this re-underwrite incorporated (Gap 2 fix).
  //
  // relate-research raises a review_refuting_claim / confirm_claim_link packet when it
  // links a claim. A subsequent re-underwrite that folds that claim into the living
  // underwriting IS the human acting on it — so the packet must not re-surface in
  // /decisions as if untouched (the gap that left TAO's 4 refuters open after v1 had
  // already weighed them and landed at 'low').
  //
  // Matched on the COMPOSITE provenance key (source_insight_id, source_claim_id): the
  // packet stores metadata.insightId + metadata.sourceClaimId, and source_claim_id alone
  // ("claim-2") is a per-insight ordinal, NOT globally unique. Only packets whose claim is
  // actually in claimIdsUsed are retired — a linked-but-unused refuter keeps its packet.
  // Best-effort: failures here never break the already-committed articulation.
  // -------------------------------------------------------------------------
  const claimIdsUsed = articulation.claimIdsUsed ?? [];
  if (thesis && claimIdsUsed.length > 0) {
    try {
      const usedClaims = await db
        .select({ insightId: mainClaims.sourceInsightId, sourceClaimId: mainClaims.sourceClaimId })
        .from(mainClaims)
        .where(inArray(mainClaims.id, claimIdsUsed));
      const usedKeys = new Set(
        usedClaims
          .map((c) => provenanceKey(c.insightId, c.sourceClaimId))
          .filter((k): k is string => k !== null)
      );

      if (usedKeys.size > 0) {
        const openPackets = await db
          .select({ id: journalEntries.id, metadata: journalEntries.metadata })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.objectId, thesisId),
              eq(journalEntries.actionType, 'decision_required'),
              eq(journalEntries.status, 'active')
            )
          );

        let retired = 0;
        for (const p of openPackets) {
          const meta = (p.metadata ?? {}) as Record<string, unknown>;
          const dtype = getDecisionPacket(meta)?.decision_type;
          const insightId = meta.insightId as string | undefined;
          const sourceClaimId = meta.sourceClaimId as string | undefined;
          if (!isPacketIncorporated(dtype, insightId, sourceClaimId, usedKeys)) continue;

          const resolution: DecisionResolution = {
            action_taken: 'incorporated_into_articulation',
            chosen_by: 'agent',
            at: new Date().toISOString(),
            notes: `Folded into articulation v${nextVersion} (confidence ${articulation.confidenceLevel}) by /build-core-argument re-underwrite.`,
          };
          // Mirror resolve-decision.ts: write resolution onto the packet (or the bare row).
          const hasPacket = !!meta.decision && typeof meta.decision === 'object';
          const target = (hasPacket ? meta.decision : meta) as Record<string, unknown>;
          target.resolution = resolution;
          await db
            .update(journalEntries)
            .set({ status: 'resolved', metadata: meta })
            .where(eq(journalEntries.id, p.id));

          await logToJournal({
            objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
            objectId: thesisId,
            objectTitle: thesis.title,
            actionType: 'decision_resolved',
            actionDescription: `Decision resolved: incorporated_into_articulation (${dtype})`,
            rationale: `Claim folded into articulation v${nextVersion}; ${dtype} packet retired by re-underwrite.`,
            source: 'automation',
            metadata: { decisionType: dtype, articulationVersion: nextVersion, via: '/build-core-argument' },
          });
          retired++;
        }
        if (retired > 0) {
          console.log(`✅ Retired ${retired} decision packet(s) incorporated into this re-underwrite (Gap 2)`);
        }
      }
    } catch (e) {
      console.warn(`⚠️  Decision-packet retirement skipped (non-fatal): ${(e as Error).message}`);
    }
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
