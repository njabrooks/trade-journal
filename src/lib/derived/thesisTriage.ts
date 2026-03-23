/**
 * Thesis Triage Computation
 *
 * Computes triage records for thesis lifecycle events.
 * Called after mutations that affect thesis evolution state.
 *
 * Trigger Rules (UPPER_SNAKE_CASE to match position/strategy triggers):
 * - NEEDS_RESEARCH: <3 claims, no articulation → status: 'info'
 * - PRODUCE_CORE_ARGUMENT: ≥3 claims, no articulation → status: 'attention'
 * - UPDATE_CORE_ARGUMENT: ≥3 new claims since last articulation, NO active signals → status: 'info'
 * - EVALUATE_NEW_EVIDENCE: ≥3 new claims since last articulation, HAS active signals → status: 'info'
 * - REVIEW_DRAFT_SIGNALS: ≥1 signals with status='draft' → status: 'attention'
 * - SIGNAL_TRIGGERED: ≥1 explicit signals triggered for thesis → status: 'attention' (consolidates all)
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
  signals,
  signalEntityLinks,
  NewThesisTriageRecord,
} from '@/db/schema';
import { eq, ne, and, desc, sql, count, isNotNull, inArray } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';

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
 * - Articulation is created (build-core-argument skill)
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
          lifecycleStage: 'synthesis',
          suggestedSkill: '/build-core-argument',
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

    // ≥3 new claims since last articulation: route based on whether thesis has active signals
    const claimsSinceArticulation =
      evolutionState.claimCount - (thesis.claimsCountAtLastArticulation ?? 0);

    if (claimsSinceArticulation >= NEW_CLAIMS_THRESHOLD) {
      const hasActiveSignals = evolutionState.activeSignalCount > 0;

      if (hasActiveSignals) {
        // EVALUATE_NEW_EVIDENCE: thesis is in monitoring mode (has active signals)
        // New claims should be evaluated against existing signals, not trigger re-articulation
        const existingEvaluate = existingTriage.find(
          (t) => t.triageRule === 'EVALUATE_NEW_EVIDENCE'
        );

        if (!existingEvaluate) {
          // Load active signal statements for the triage summary (via junction table)
          const activeSignals = await db
            .select({ id: signals.id, type: signals.type, statement: signals.statement })
            .from(signals)
            .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
            .where(
              and(
                eq(signalEntityLinks.thesisId, thesisId),
                eq(signalEntityLinks.thesisType, thesisType),
                eq(signals.status, 'active')
              )
            );

          const signalSummary = activeSignals.map(s => `${s.type}: ${s.statement}`);

          await createTriageRecord({
            thesisId,
            thesisType,
            thesisTitle: thesis.title,
            triageRule: 'EVALUATE_NEW_EVIDENCE',
            triggerType: 'new_evidence',
            triggerSource: 'computeThesisTriageForThesis',
            status: 'info',
            lifecycleStage: 'monitoring',
            suggestedSkill: null,
            actionRequired: `${claimsSinceArticulation} new claims since last articulation. Evaluate against ${evolutionState.activeSignalCount} active signal(s).`,
            contentSummary: {
              currentClaimCount: evolutionState.claimCount,
              claimsAtLastArticulation: thesis.claimsCountAtLastArticulation ?? 0,
              newClaimCount: claimsSinceArticulation,
              activeSignalCount: evolutionState.activeSignalCount,
              activeSignals: signalSummary,
            },
          });
          result.triageCreated = 'EVALUATE_NEW_EVIDENCE';
        }
      } else {
        // UPDATE_CORE_ARGUMENT: thesis is still in building mode (no active signals)
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
            lifecycleStage: 'synthesis',
            suggestedSkill: '/build-core-argument',
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
  }

  // REVIEW_DRAFT_SIGNALS: ≥1 signals with status='draft' need user review
  // This is independent of articulation state - can happen anytime after synthesis
  const existingReviewSignals = existingTriage.find(
    (t) => t.triageRule === 'REVIEW_RECOMMENDED_SIGNALS' || t.triageRule === 'REVIEW_DRAFT_SIGNALS'
  );

  if (evolutionState.draftSignalCount > 0) {
    // Has draft signals - create triage if not exists
    if (!existingReviewSignals) {
      // Look up articulation_id from draft signals to use as batchId for grouping journal entries
      const [draftSignal] = await db
        .select({ articulationId: signals.articulationId })
        .from(signals)
        .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
        .where(
          and(
            eq(signalEntityLinks.thesisId, thesisId),
            eq(signalEntityLinks.thesisType, thesisType),
            eq(signals.status, 'draft'),
            isNotNull(signals.articulationId)
          )
        )
        .limit(1);

      await createTriageRecord({
        thesisId,
        thesisType,
        thesisTitle: thesis.title,
        triageRule: 'REVIEW_DRAFT_SIGNALS',
        triggerType: 'signal_recommendation',
        triggerSource: 'computeThesisTriageForThesis',
        status: 'attention',
        lifecycleStage: 'monitoring',
        suggestedSkill: null,
        actionRequired: `${evolutionState.draftSignalCount} AI-proposed signal(s) need review. Accept, modify, or reject each signal.`,
        contentSummary: {
          draftSignalCount: evolutionState.draftSignalCount,
          totalSignalCount: evolutionState.hasSignals ? 'multiple' : 0,
        },
        batchId: draftSignal?.articulationId || undefined,
      });
      // Don't overwrite triageCreated if already set (e.g., by UPDATE_CORE_ARGUMENT)
      if (!result.triageCreated) {
        result.triageCreated = 'REVIEW_DRAFT_SIGNALS';
      }
    }
  } else if (existingReviewSignals) {
    // No recommended signals left - resolve existing triage
    // Look up articulation_id from any signal (active or recently processed) to use as batchId
    const [anySignal] = await db
      .select({ articulationId: signals.articulationId })
      .from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(
        and(
          eq(signalEntityLinks.thesisId, thesisId),
          eq(signalEntityLinks.thesisType, thesisType),
          isNotNull(signals.articulationId)
        )
      )
      .orderBy(desc(signals.updatedAt))
      .limit(1);

    await resolveTriageRecord(
      existingReviewSignals.id,
      'all_signals_reviewed',
      anySignal?.articulationId || undefined
    );
    result.existingTriageResolved = true;
  }

  // SIGNAL_TRIGGERED: ≥1 explicit signals have completed (fired) for this thesis
  // Creates ONE thesis-level triage record consolidating all complete signals
  const existingSignalTriggered = existingTriage.find(
    (t) => t.triageRule === 'SIGNAL_TRIGGERED'
  );

  if (evolutionState.completeSignalCount > 0) {
    // Has completed signals - create or update thesis-level triage
    if (!existingSignalTriggered) {
      // Determine severity based on signal importance
      // We'll need to check if any critical signals are completed
      const severity = await determineTriggeredSignalSeverity(
        evolutionState.triggeredSignalIds
      );

      await createTriageRecord({
        thesisId,
        thesisType,
        thesisTitle: thesis.title,
        triageRule: 'SIGNAL_TRIGGERED',
        triggerType: 'signal_trigger',
        triggerSource: 'computeThesisTriageForThesis',
        status: severity === 'critical' ? 'urgent' : 'attention',
        lifecycleStage: 'monitoring',
        suggestedSkill: null,
        actionRequired: `${evolutionState.completeSignalCount} of ${evolutionState.totalSignalCount} signal(s) triggered. Review thesis conviction and assess impact.`,
        contentSummary: {
          completeSignalCount: evolutionState.completeSignalCount,
          totalSignalCount: evolutionState.totalSignalCount,
          triggeredSignalIds: evolutionState.triggeredSignalIds,
          currentConviction: thesis.confidenceLevel,
        },
      });
      if (!result.triageCreated) {
        result.triageCreated = 'SIGNAL_TRIGGERED';
      }
    } else {
      // Update existing triage with latest signal counts if changed
      const existingSummary = existingSignalTriggered.contentSummary as {
        completeSignalCount?: number;
        triggeredSignalCount?: number; // Legacy
      } | undefined;
      const existingCount = existingSummary?.completeSignalCount ?? existingSummary?.triggeredSignalCount ?? 0;

      if (existingCount !== evolutionState.completeSignalCount) {
        await db
          .update(thesisTriageRecords)
          .set({
            actionRequired: `${evolutionState.completeSignalCount} of ${evolutionState.totalSignalCount} signal(s) triggered. Review thesis conviction and assess impact.`,
            contentSummary: {
              completeSignalCount: evolutionState.completeSignalCount,
              totalSignalCount: evolutionState.totalSignalCount,
              triggeredSignalIds: evolutionState.triggeredSignalIds,
              currentConviction: thesis.confidenceLevel,
            },
            updatedAt: new Date(),
          })
          .where(eq(thesisTriageRecords.id, existingSignalTriggered.id));
      }
    }
  } else if (existingSignalTriggered) {
    // No completed signals left - resolve existing triage
    await resolveTriageRecord(existingSignalTriggered.id, 'all_triggered_signals_resolved');
    result.existingTriageResolved = true;
  }

  return result;
}

/**
 * Determine severity for triggered signals based on their importance.
 * If any critical signal is triggered, return 'critical'.
 */
async function determineTriggeredSignalSeverity(
  triggeredSignalIds: string[]
): Promise<'critical' | 'significant' | 'supporting'> {
  if (triggeredSignalIds.length === 0) return 'supporting';

  const triggeredSignals = await db
    .select({ importance: signals.importance })
    .from(signals)
    .where(sql`${signals.id} = ANY(${triggeredSignalIds})`);

  const hasCritical = triggeredSignals.some(s => s.importance === 'critical');
  if (hasCritical) return 'critical';

  const hasSignificant = triggeredSignals.some(s => s.importance === 'significant');
  if (hasSignificant) return 'significant';

  return 'supporting';
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

  // Get all non-terminal macro theses (developing or monitoring)
  const activeMarcoTheses = await db
    .select({ id: macroTheses.id })
    .from(macroTheses)
    .where(inArray(macroTheses.status, ['developing', 'monitoring']));

  for (const thesis of activeMarcoTheses) {
    const result = await computeThesisTriageForThesis(thesis.id, 'macro');
    results.macro.push(result);
  }

  // Get all non-terminal asset theses (developing or monitoring)
  const activeAssetTheses = await db
    .select({ id: assetTheses.id })
    .from(assetTheses)
    .where(inArray(assetTheses.status, ['developing', 'monitoring']));

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
 * 3. Log the articulation creation to journal
 */
export async function onArticulationCreated(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<void> {
  // Get thesis data for journal logging
  const thesis = await getThesis(thesisId, thesisType);
  if (!thesis) {
    console.warn(`onArticulationCreated: Thesis not found: ${thesisType}/${thesisId}`);
    return;
  }

  // Get current claim count
  const evolutionState = await getThesisEvolutionState(thesisId, thesisType);
  const previousClaimsCount = thesis.claimsCountAtLastArticulation ?? 0;

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

  // Log articulation creation to journal
  await logToJournal({
    objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
    objectId: thesisId,
    objectTitle: thesis.title,
    actionType: 'articulation_created',
    actionDescription: `Thesis articulation created/updated with ${evolutionState.claimCount} claims`,
    skillInvoked: '/build-core-argument',
    previousState: {
      claimsCountAtLastArticulation: previousClaimsCount,
    },
    newState: {
      claimsCountAtLastArticulation: evolutionState.claimCount,
      hasArticulation: true,
    },
    source: 'skill',
  });

  // Resolve any pending articulation-related triage (new and legacy names)
  // Also resolves EVALUATE_NEW_EVIDENCE since re-articulation resets the thesis to building mode
  const existingTriage = await getExistingPendingTriage(thesisId, thesisType);
  const articulationTriage = existingTriage.filter(
    (t) => t.triageRule === 'UPDATE_CORE_ARGUMENT' ||
           t.triageRule === 'PRODUCE_CORE_ARGUMENT' ||
           t.triageRule === 'NEEDS_RESEARCH' ||
           t.triageRule === 'EVALUATE_NEW_EVIDENCE' ||
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
  hasSignals: boolean;
  totalSignalCount: number;
  activeSignalCount: number;
  draftSignalCount: number;
  completeSignalCount: number;
  // Legacy aliases for backward compatibility
  recommendedSignalCount: number;
  triggeredSignalCount: number;
  triggeredSignalIds: string[];
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

  // Check for signals and count by status (via junction table)
  const signalCounts = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${signals.status} = 'active')`,
      draft: sql<number>`count(*) filter (where ${signals.status} = 'draft')`,
      complete: sql<number>`count(*) filter (where ${signals.status} = 'complete')`,
    })
    .from(signals)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(
      and(
        eq(signalEntityLinks.thesisId, thesisId),
        eq(signalEntityLinks.thesisType, thesisType)
      )
    );

  // Get IDs of completed (triggered) signals for detailed triage info
  let completedSignalIds: string[] = [];
  if ((signalCounts[0]?.complete ?? 0) > 0) {
    const completedSignals = await db
      .select({ id: signals.id })
      .from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(
        and(
          eq(signalEntityLinks.thesisId, thesisId),
          eq(signalEntityLinks.thesisType, thesisType),
          eq(signals.status, 'complete')
        )
      );
    completedSignalIds = completedSignals.map(s => s.id);
  }

  return {
    claimCount: claimCountResult[0]?.count ?? 0,
    hasArticulation: articulation.length > 0,
    hasSignals: (signalCounts[0]?.total ?? 0) > 0,
    totalSignalCount: signalCounts[0]?.total ?? 0,
    activeSignalCount: signalCounts[0]?.active ?? 0,
    draftSignalCount: signalCounts[0]?.draft ?? 0,
    completeSignalCount: signalCounts[0]?.complete ?? 0,
    // Legacy aliases for backward compatibility
    recommendedSignalCount: signalCounts[0]?.draft ?? 0,
    triggeredSignalCount: signalCounts[0]?.complete ?? 0,
    triggeredSignalIds: completedSignalIds,
    hasMonitoringConfig: false, // TODO: implement when monitoring is integrated
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
  // Get all non-done triage records (thesis_triage_records uses inbox/in_progress/done)
  return db
    .select()
    .from(thesisTriageRecords)
    .where(
      and(
        eq(thesisTriageRecords.thesisId, thesisId),
        eq(thesisTriageRecords.thesisType, thesisType),
        ne(thesisTriageRecords.status, 'done')
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
  lifecycleStage: string;
  suggestedSkill: string | null;
  actionRequired: string;
  contentSummary: Record<string, unknown>;
  // Optional batch ID to group related journal entries (e.g., articulation_id for signal review workflow)
  batchId?: string;
}

async function createTriageRecord(params: CreateTriageParams): Promise<string> {
  const newRecord: NewThesisTriageRecord = {
    thesisId: params.thesisId,
    thesisType: params.thesisType,
    thesisTitle: params.thesisTitle,
    triggerType: params.triggerType,
    triggerSource: params.triggerSource,
    // severity: importance level (urgent/attention/monitor/info)
    // status: workflow state (inbox/in_progress/done) - new records start in 'inbox'
    severity: params.status as 'urgent' | 'attention' | 'monitor' | 'info',
    status: 'inbox',
    lifecycleStage: params.lifecycleStage,
    suggestedSkill: params.suggestedSkill,
    actionRequired: params.actionRequired,
    triageRule: params.triageRule,
    contentSummary: params.contentSummary,
    aiAnalysis: {},
    matchedResults: [],
  };

  const [inserted] = await db
    .insert(thesisTriageRecords)
    .values(newRecord)
    .returning({ id: thesisTriageRecords.id });

  // Log triage creation to journal
  await logToJournal({
    objectType: params.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
    objectId: params.thesisId,
    objectTitle: params.thesisTitle,
    actionType: 'triage_created',
    actionDescription: `Triage created: ${params.triageRule}. ${params.actionRequired}`,
    triageRecordId: inserted.id,
    newState: {
      triageRule: params.triageRule,
      severity: params.status, // params.status is actually the severity level
      status: 'inbox',
      lifecycleStage: params.lifecycleStage,
      suggestedSkill: params.suggestedSkill,
    },
    source: 'automation',
    metadata: params.contentSummary,
    batchId: params.batchId,
  });

  console.log(
    `Created thesis triage: ${params.triageRule} for ${params.thesisType}/${params.thesisId}`
  );

  return inserted.id;
}

async function resolveTriageRecord(
  triageId: string,
  reason: string,
  batchId?: string
): Promise<void> {
  // Fetch triage record first for journal context
  const [triageRecord] = await db
    .select()
    .from(thesisTriageRecords)
    .where(eq(thesisTriageRecords.id, triageId))
    .limit(1);

  if (!triageRecord) {
    console.warn(`Triage record not found for resolution: ${triageId}`);
    return;
  }

  const previousStatus = triageRecord.status;

  await db
    .update(thesisTriageRecords)
    .set({
      status: 'done', // thesis_triage_records uses inbox/in_progress/done, not complete
      completedAt: new Date(),
      completedBy: 'system',
      userNotes: `Auto-resolved: ${reason}`,
      updatedAt: new Date(),
    })
    .where(eq(thesisTriageRecords.id, triageId));

  // Log resolution to journal
  await logToJournal({
    objectType: triageRecord.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
    objectId: triageRecord.thesisId,
    objectTitle: triageRecord.thesisTitle,
    actionType: 'triage_resolved',
    actionDescription: `Triage auto-resolved: ${triageRecord.triageRule}. Reason: ${reason}`,
    triageRecordId: triageId,
    previousState: {
      status: previousStatus,
      triageRule: triageRecord.triageRule,
    },
    newState: {
      status: 'done',
      completedBy: 'system',
      resolutionReason: reason,
    },
    source: 'automation',
    batchId,
  });

  console.log(`Resolved thesis triage: ${triageId} (${reason})`);
}
