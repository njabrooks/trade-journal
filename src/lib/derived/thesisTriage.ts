/**
 * Thesis Triage Computation
 *
 * Computes triage records for thesis lifecycle events.
 * Called after mutations that affect thesis evolution state.
 *
 * Rules implemented:
 * #1: Thesis exists with no articulation → thesis_needs_articulation
 * #2: ≥3 claims added since last articulation → thesis_new_claims_available
 *
 * Rules #4-5 (monitoring content, data triggers) are handled by:
 * - scripts/daily-thesis-monitoring.ts
 * - Future: data threshold monitoring scripts
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
import { eq, and, desc, sql, count, isNotNull } from 'drizzle-orm';

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

  // Rule #1: Thesis needs articulation
  if (!evolutionState.hasArticulation) {
    // Check if we already have a pending triage for this
    const existingNeedsArticulation = existingTriage.find(
      (t) => t.triageRule === 'thesis_needs_articulation'
    );

    if (!existingNeedsArticulation) {
      // Create new triage record
      await createTriageRecord({
        thesisId,
        thesisType,
        thesisTitle: thesis.title,
        triageRule: 'thesis_needs_articulation',
        triggerType: 'lifecycle_check',
        triggerSource: 'computeThesisTriageForThesis',
        severity: 'medium',
        urgency: 'this_week',
        lifecycleStage: 'synthesis',
        suggestedSkill: '/synthesize-thesis',
        actionRequired:
          'Generate claims from research and create thesis articulation',
        contentSummary: {
          currentClaimCount: evolutionState.claimCount,
          hasArticulation: false,
        },
      });
      result.triageCreated = 'thesis_needs_articulation';
    }
  } else {
    // Articulation exists - resolve any pending "needs articulation" triage
    const existingNeedsArticulation = existingTriage.find(
      (t) => t.triageRule === 'thesis_needs_articulation'
    );
    if (existingNeedsArticulation) {
      await resolveTriageRecord(existingNeedsArticulation.id, 'articulation_created');
      result.existingTriageResolved = true;
    }

    // Rule #2: New claims available since last articulation
    const claimsSinceArticulation =
      evolutionState.claimCount - (thesis.claimsCountAtLastArticulation ?? 0);

    if (claimsSinceArticulation >= NEW_CLAIMS_THRESHOLD) {
      // Check if we already have a pending triage for this
      const existingNewClaims = existingTriage.find(
        (t) => t.triageRule === 'thesis_new_claims_available'
      );

      if (!existingNewClaims) {
        await createTriageRecord({
          thesisId,
          thesisType,
          thesisTitle: thesis.title,
          triageRule: 'thesis_new_claims_available',
          triggerType: 'lifecycle_check',
          triggerSource: 'computeThesisTriageForThesis',
          severity: 'low',
          urgency: 'when_convenient',
          lifecycleStage: 'synthesis',
          suggestedSkill: '/synthesize-thesis',
          actionRequired: `${claimsSinceArticulation} new claims available since last articulation. Consider regenerating thesis synthesis.`,
          contentSummary: {
            currentClaimCount: evolutionState.claimCount,
            claimsAtLastArticulation: thesis.claimsCountAtLastArticulation ?? 0,
            newClaimCount: claimsSinceArticulation,
          },
        });
        result.triageCreated = 'thesis_new_claims_available';
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
 * 2. Resolve any "new claims available" triage
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

  // Resolve any pending "new claims available" triage
  const existingTriage = await getExistingPendingTriage(thesisId, thesisType);
  const existingNewClaims = existingTriage.find(
    (t) => t.triageRule === 'thesis_new_claims_available'
  );
  if (existingNewClaims) {
    await resolveTriageRecord(existingNewClaims.id, 'new_articulation_created');
  }

  // Recompute triage (will resolve "needs articulation" if applicable)
  await computeThesisTriageForThesis(thesisId, thesisType);
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
  return db
    .select()
    .from(thesisTriageRecords)
    .where(
      and(
        eq(thesisTriageRecords.thesisId, thesisId),
        eq(thesisTriageRecords.thesisType, thesisType),
        eq(thesisTriageRecords.status, 'pending')
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
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
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
    severity: params.severity,
    urgency: params.urgency,
    status: 'pending',
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
      status: 'actioned',
      completedAt: new Date(),
      completedBy: 'system',
      userNotes: `Auto-resolved: ${reason}`,
      updatedAt: new Date(),
    })
    .where(eq(thesisTriageRecords.id, triageId));

  console.log(`Resolved thesis triage: ${triageId} (${reason})`);
}
