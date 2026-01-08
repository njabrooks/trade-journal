/**
 * Thesis Triage Computation
 *
 * Computes triage records for thesis lifecycle events.
 * Called after mutations that affect thesis evolution state.
 *
 * Trigger Rules (UPPER_SNAKE_CASE to match position/strategy triggers):
 * - NEEDS_RESEARCH: <3 claims, no articulation → status: 'info'
 * - PRODUCE_CORE_ARGUMENT: ≥3 claims, no articulation → status: 'attention'
 * - UPDATE_CORE_ARGUMENT: ≥3 new claims since last articulation → status: 'info'
 *
 * Monitoring triggers (handled by scripts/daily-thesis-monitoring.ts):
 * - REVIEW_CONTENT: News/content found for thesis → status: 'attention'
 * - REVIEW_DATA: Data threshold breached → status: 'urgent'
 *
 * Status values match position/strategy triage: urgent, attention, monitor, info, pending, complete
 */

import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  thesisArticulations,
  thesisTriageRecords,
  claimThesisMappings,
  NewThesisTriageRecord,
} from '@/db/schema';
import { eq, ne, and, desc, sql, count, isNotNull } from 'drizzle-orm';

// Threshold for rule #2: new claims available
const NEW_CLAIMS_THRESHOLD = 3;

export interface ThesisTriageResult {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  triageCreated: string | null; // triage rule type if created, null if no action
  existingTriageResolved: boolean;
}

/**
 * Compute and update triage records for a single thesis.
 *
 * This should be called after:
 * - Claim is linked to thesis (convert-claim API)
 * - Articulation is created (synthesize-thesis skill)
 * - Thesis is created (create-thesis/create-view API)
 */
export async function computeThesisTriageForThesis(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<ThesisTriageResult> {
  const result: ThesisTriageResult = {
    thesisId,
    thesisType,
    triageCreated: null,
    existingTriageResolved: false,
  };

  // Get thesis data
  const thesis = await getThesis(thesisId, thesisType);
  if (!thesis) {
    console.warn(`Thesis not found: ${thesisType}/${thesisId}`);
    return result;
  }

  // Get evolution state
  const evolutionState = await getThesisEvolutionState(thesisId, thesisType);

  // Check for existing pending triage records
  const existingTriage = await getExistingPendingTriage(thesisId, thesisType);

  // No articulation exists - determine if NEEDS_RESEARCH or PRODUCE_CORE_ARGUMENT
  if (!evolutionState.hasArticulation) {
    // Check for existing pending triage for either rule
    const existingNeedsResearch = existingTriage.find(
      (t) => t.triageRule === 'NEEDS_RESEARCH'
    );
    const existingProduceCoreArgument = existingTriage.find(
      (t) => t.triageRule === 'PRODUCE_CORE_ARGUMENT'
    );
    // Also check legacy rule names for migration compatibility
    const existingLegacy = existingTriage.find(
      (t) => t.triageRule === 'thesis_needs_articulation'
    );

    if (evolutionState.claimCount < NEW_CLAIMS_THRESHOLD) {
      // NEEDS_RESEARCH: <3 claims, no articulation
      // Resolve any existing PRODUCE_CORE_ARGUMENT if claim count dropped (edge case)
      if (existingProduceCoreArgument) {
        await resolveTriageRecord(existingProduceCoreArgument.id, 'claim_count_below_threshold');
      }

      if (!existingNeedsResearch && !existingLegacy) {
        await createTriageRecord({
          thesisId,
          thesisType,
          thesisTitle: thesis.title,
          triageRule: 'NEEDS_RESEARCH',
          triggerType: 'lifecycle_transition',
          triggerSource: 'computeThesisTriageForThesis',
          status: 'info',
          urgency: 'when_convenient',
          lifecycleStage: 'research',
          suggestedSkill: '/process-transcript',
          actionRequired:
            `Thesis has ${evolutionState.claimCount} claim(s). Link at least ${NEW_CLAIMS_THRESHOLD} claims before generating core argument.`,
          contentSummary: {
            currentClaimCount: evolutionState.claimCount,
            requiredClaimCount: NEW_CLAIMS_THRESHOLD,
            hasArticulation: false,
          },
        });
        result.triageCreated = 'NEEDS_RESEARCH';
      }
    } else {
      // PRODUCE_CORE_ARGUMENT: ≥3 claims, no articulation
      // Resolve any existing NEEDS_RESEARCH since we now have enough claims
      if (existingNeedsResearch) {
        await resolveTriageRecord(existingNeedsResearch.id, 'sufficient_claims_linked');
        result.existingTriageResolved = true;
      }

      if (!existingProduceCoreArgument && !existingLegacy) {
        await createTriageRecord({
          thesisId,
          thesisType,
          thesisTitle: thesis.title,
          triageRule: 'PRODUCE_CORE_ARGUMENT',
          triggerType: 'lifecycle_transition',
          triggerSource: 'computeThesisTriageForThesis',
          status: 'attention',
          urgency: 'this_week',
          lifecycleStage: 'synthesis',
          suggestedSkill: '/synthesize-thesis',
          actionRequired:
            `Thesis has ${evolutionState.claimCount} claims. Ready to generate core argument and validation points.`,
          contentSummary: {
            currentClaimCount: evolutionState.claimCount,
            hasArticulation: false,
          },
        });
        result.triageCreated = 'PRODUCE_CORE_ARGUMENT';
      }
    }
  } else {
    // Articulation exists - resolve any pending "needs articulation" type triage
    const articulationTriage = existingTriage.filter(
      (t) => t.triageRule === 'NEEDS_RESEARCH' ||
             t.triageRule === 'PRODUCE_CORE_ARGUMENT' ||
             t.triageRule === 'thesis_needs_articulation'
    );
    for (const triage of articulationTriage) {
      await resolveTriageRecord(triage.id, 'articulation_created');
      result.existingTriageResolved = true;
    }

    // UPDATE_CORE_ARGUMENT: ≥3 new claims since last articulation
    const claimsSinceArticulation =
      evolutionState.claimCount - (thesis.claimsCountAtLastArticulation ?? 0);

    if (claimsSinceArticulation >= NEW_CLAIMS_THRESHOLD) {
      // Check for existing pending triage (new and legacy names)
      const existingUpdateCoreArgument = existingTriage.find(
        (t) => t.triageRule === 'UPDATE_CORE_ARGUMENT' || t.triageRule === 'thesis_new_claims_available'
      );

      if (!existingUpdateCoreArgument) {
        await createTriageRecord({
          thesisId,
          thesisType,
          thesisTitle: thesis.title,
          triageRule: 'UPDATE_CORE_ARGUMENT',
          triggerType: 'lifecycle_transition',
          triggerSource: 'computeThesisTriageForThesis',
          status: 'info',
          urgency: 'when_convenient',
          lifecycleStage: 'synthesis',
          suggestedSkill: '/synthesize-thesis',
          actionRequired: `${claimsSinceArticulation} new claims since last articulation. Consider updating the core argument.`,
          contentSummary: {
            currentClaimCount: evolutionState.claimCount,
            claimsAtLastArticulation: thesis.claimsCountAtLastArticulation ?? 0,
            newClaimCount: claimsSinceArticulation,
          },
        });
        result.triageCreated = 'UPDATE_CORE_ARGUMENT';
      }
    }
  }

  return result;
}

/**
 * Compute triage for all theses (reconciliation job).
 * Can be run periodically or manually to catch missed updates.
 */
export async function computeThesisTriageForAll(): Promise<{
  macro: ThesisTriageResult[];
  asset: ThesisTriageResult[];
}> {
  const results: { macro: ThesisTriageResult[]; asset: ThesisTriageResult[] } = {
    macro: [],
    asset: [],
  };

  // Get all active macro theses
  const activeMarcoTheses = await db
    .select({ id: macroTheses.id })
    .from(macroTheses)
    .where(eq(macroTheses.status, 'active'));

  for (const thesis of activeMarcoTheses) {
    const result = await computeThesisTriageForThesis(thesis.id, 'macro');
    results.macro.push(result);
  }

  // Get all active asset theses
  const activeAssetTheses = await db
    .select({ id: assetTheses.id })
    .from(assetTheses)
    .where(eq(assetTheses.status, 'active'));

  for (const thesis of activeAssetTheses) {
    const result = await computeThesisTriageForThesis(thesis.id, 'asset');
    results.asset.push(result);
  }

  return results;
}

/**
 * Called when an articulation is created to:
 * 1. Update claims_count_at_last_articulation on the thesis
 * 2. Resolve any pending articulation-related triage
 */
export async function onArticulationCreated(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<void> {
  // Get current claim count
  const evolutionState = await getThesisEvolutionState(thesisId, thesisType);

  // Update thesis with current claim count
  if (thesisType === 'macro') {
    await db
      .update(macroTheses)
      .set({
        claimsCountAtLastArticulation: evolutionState.claimCount,
        updatedAt: new Date(),
      })
      .where(eq(macroTheses.id, thesisId));
  } else {
    await db
      .update(assetTheses)
      .set({
        claimsCountAtLastArticulation: evolutionState.claimCount,
        updatedAt: new Date(),
      })
      .where(eq(assetTheses.id, thesisId));
  }

  // Resolve any pending articulation-related triage (new and legacy names)
  const existingTriage = await getExistingPendingTriage(thesisId, thesisType);
  const articulationTriage = existingTriage.filter(
    (t) => t.triageRule === 'UPDATE_CORE_ARGUMENT' ||
           t.triageRule === 'PRODUCE_CORE_ARGUMENT' ||
           t.triageRule === 'NEEDS_RESEARCH' ||
           t.triageRule === 'thesis_new_claims_available' ||
           t.triageRule === 'thesis_needs_articulation'
  );
  for (const triage of articulationTriage) {
    await resolveTriageRecord(triage.id, 'articulation_created');
  }

  console.log(`onArticulationCreated: Resolved ${articulationTriage.length} triage records for ${thesisType}/${thesisId}`);
}

// ============================================================================
// Helper Functions
// ============================================================================

interface ThesisEvolutionState {
  claimCount: number;
  hasArticulation: boolean;
  hasValidationPoints: boolean;
  hasMonitoringConfig: boolean;
}

async function getThesisEvolutionState(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<ThesisEvolutionState> {
  // Count claims linked to this thesis via claimThesisMappings
  let claimCountResult: { count: number }[];

  if (thesisType === 'macro') {
    claimCountResult = await db
      .select({ count: count() })
      .from(claimThesisMappings)
      .where(eq(claimThesisMappings.macroThesisId, thesisId));
  } else {
    claimCountResult = await db
      .select({ count: count() })
      .from(claimThesisMappings)
      .where(eq(claimThesisMappings.assetThesisId, thesisId));
  }

  // Check for articulation
  const articulation = await db
    .select({ id: thesisArticulations.id })
    .from(thesisArticulations)
    .where(
      and(
        eq(thesisArticulations.thesisId, thesisId),
        eq(thesisArticulations.thesisType, thesisType)
      )
    )
    .limit(1);

  // TODO: Check for validation points and monitoring config
  // These can be added when those features are fully integrated

  return {
    claimCount: claimCountResult[0]?.count ?? 0,
    hasArticulation: articulation.length > 0,
    hasValidationPoints: false, // TODO: implement
    hasMonitoringConfig: false, // TODO: implement
  };
}

async function getThesis(thesisId: string, thesisType: 'macro' | 'asset') {
  if (thesisType === 'macro') {
    const result = await db
      .select()
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);
    return result[0];
  } else {
    const result = await db
      .select()
      .from(assetTheses)
      .where(eq(assetTheses.id, thesisId))
      .limit(1);
    return result[0];
  }
}

async function getExistingPendingTriage(
  thesisId: string,
  thesisType: 'macro' | 'asset'
) {
  // Get all non-complete triage records (status can be urgent, attention, monitor, info, pending)
  return db
    .select()
    .from(thesisTriageRecords)
    .where(
      and(
        eq(thesisTriageRecords.thesisId, thesisId),
        eq(thesisTriageRecords.thesisType, thesisType),
        ne(thesisTriageRecords.status, 'complete')
      )
    );
}

interface CreateTriageParams {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  triageRule: string;
  triggerType: string;
  triggerSource: string;
  // Status matches position/strategy triage severity values
  status: 'urgent' | 'attention' | 'monitor' | 'info' | 'pending' | 'complete';
  urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient';
  lifecycleStage: string;
  suggestedSkill: string;
  actionRequired: string;
  contentSummary: Record<string, unknown>;
}

async function createTriageRecord(params: CreateTriageParams): Promise<void> {
  const newRecord: NewThesisTriageRecord = {
    thesisId: params.thesisId,
    thesisType: params.thesisType,
    thesisTitle: params.thesisTitle,
    triggerType: params.triggerType,
    triggerSource: params.triggerSource,
    // Map status to severity field for DB compatibility, and set status field
    severity: params.status as 'critical' | 'high' | 'medium' | 'low' | 'info',
    urgency: params.urgency,
    status: params.status,
    lifecycleStage: params.lifecycleStage,
    suggestedSkill: params.suggestedSkill,
    actionRequired: params.actionRequired,
    triageRule: params.triageRule,
    contentSummary: params.contentSummary,
    aiAnalysis: {},
    matchedResults: [],
  };

  await db.insert(thesisTriageRecords).values(newRecord);

  console.log(
    `Created thesis triage: ${params.triageRule} for ${params.thesisType}/${params.thesisId}`
  );
}

async function resolveTriageRecord(
  triageId: string,
  reason: string
): Promise<void> {
  await db
    .update(thesisTriageRecords)
    .set({
      status: 'complete',
      completedAt: new Date(),
      completedBy: 'system',
      userNotes: `Auto-resolved: ${reason}`,
      updatedAt: new Date(),
    })
    .where(eq(thesisTriageRecords.id, triageId));

  console.log(`Resolved thesis triage: ${triageId} (${reason})`);
}
