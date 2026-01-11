/**
 * Lifecycle Detection Module
 *
 * Detects when theses are ready for the next lifecycle stage and creates
 * triage records to prompt user action.
 *
 * Lifecycle stages:
 * - created: Just created, needs claims
 * - claims_linked: Has sufficient claims, needs synthesis
 * - synthesized: Has articulation, needs V&I points
 * - validated: Has V&I points, ready for monitoring
 * - monitoring: Active monitoring
 * - closed: Thesis complete (validated or invalidated)
 */

import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  claimThesisMappings,
  thesisArticulations,
  validationPoints,
  thesisMonitoringConfigs,
  thesisTriageRecords,
  journalEntries,
} from '@/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';

// Minimum claims required before thesis is ready for synthesis
const MIN_CLAIMS_FOR_SYNTHESIS = 3;

export type LifecycleStatus =
  | 'created'
  | 'claims_linked'
  | 'synthesized'
  | 'validated'
  | 'monitoring'
  | 'closed';

export type ThesisType = 'macro' | 'asset';

interface LifecycleTransition {
  thesisId: string;
  thesisType: ThesisType;
  thesisTitle: string;
  fromStage: LifecycleStatus;
  toStage: LifecycleStatus;
  triggerType: string;
  actionRequired: string;
  suggestedSkill?: string;
}

/**
 * Detects if a thesis should transition to a new lifecycle stage
 * and returns the transition details if so.
 */
export async function detectLifecycleTransition(
  thesisId: string,
  thesisType: ThesisType
): Promise<LifecycleTransition | null> {
  // Get current thesis state
  const thesis = await getThesis(thesisId, thesisType);
  if (!thesis) return null;

  const currentStatus = thesis.lifecycleStatus as LifecycleStatus || 'created';

  // Check each possible transition
  switch (currentStatus) {
    case 'created':
      return await checkCreatedToClaimsLinked(thesisId, thesisType, thesis);

    case 'claims_linked':
      return await checkClaimsLinkedToSynthesized(thesisId, thesisType, thesis);

    case 'synthesized':
      return await checkSynthesizedToValidated(thesisId, thesisType, thesis);

    case 'validated':
      return await checkValidatedToMonitoring(thesisId, thesisType, thesis);

    default:
      return null;
  }
}

/**
 * Check if thesis has enough claims to move from 'created' to 'claims_linked'
 */
async function checkCreatedToClaimsLinked(
  thesisId: string,
  thesisType: ThesisType,
  thesis: { title: string; lifecycleStatus: string | null }
): Promise<LifecycleTransition | null> {
  const claimCountResult = await db
    .select({ count: count() })
    .from(claimThesisMappings)
    .where(
      thesisType === 'macro'
        ? eq(claimThesisMappings.macroThesisId, thesisId)
        : eq(claimThesisMappings.assetThesisId, thesisId)
    );

  const claimCount = claimCountResult[0]?.count || 0;

  if (claimCount >= MIN_CLAIMS_FOR_SYNTHESIS) {
    return {
      thesisId,
      thesisType,
      thesisTitle: thesis.title,
      fromStage: 'created',
      toStage: 'claims_linked',
      triggerType: 'lifecycle_transition',
      actionRequired: `Thesis has ${claimCount} linked claims. Ready for synthesis.`,
      suggestedSkill: '/synthesize-thesis',
    };
  }

  return null;
}

/**
 * Check if thesis has an articulation to move from 'claims_linked' to 'synthesized'
 */
async function checkClaimsLinkedToSynthesized(
  thesisId: string,
  thesisType: ThesisType,
  thesis: { title: string; lifecycleStatus: string | null }
): Promise<LifecycleTransition | null> {
  const articulationResult = await db
    .select({ count: count() })
    .from(thesisArticulations)
    .where(
      and(
        eq(thesisArticulations.thesisId, thesisId),
        eq(thesisArticulations.thesisType, thesisType)
      )
    );

  const hasArticulation = (articulationResult[0]?.count || 0) > 0;

  if (hasArticulation) {
    return {
      thesisId,
      thesisType,
      thesisTitle: thesis.title,
      fromStage: 'claims_linked',
      toStage: 'synthesized',
      triggerType: 'lifecycle_transition',
      actionRequired: 'Thesis has been synthesized. Extract validation/invalidation points.',
      suggestedSkill: '/synthesize-thesis', // Same skill continues to extract V&I points
    };
  }

  return null;
}

/**
 * Check if thesis has validation points to move from 'synthesized' to 'validated'
 */
async function checkSynthesizedToValidated(
  thesisId: string,
  thesisType: ThesisType,
  thesis: { title: string; lifecycleStatus: string | null }
): Promise<LifecycleTransition | null> {
  const vpResult = await db
    .select({ count: count() })
    .from(validationPoints)
    .where(
      and(
        eq(validationPoints.thesisId, thesisId),
        eq(validationPoints.thesisType, thesisType)
      )
    );

  const hasValidationPoints = (vpResult[0]?.count || 0) > 0;

  if (hasValidationPoints) {
    return {
      thesisId,
      thesisType,
      thesisTitle: thesis.title,
      fromStage: 'synthesized',
      toStage: 'validated',
      triggerType: 'lifecycle_transition',
      actionRequired: 'Thesis has validation points. Configure monitoring.',
      suggestedSkill: undefined, // Manual configuration in UI
    };
  }

  return null;
}

/**
 * Check if thesis has monitoring config to move from 'validated' to 'monitoring'
 */
async function checkValidatedToMonitoring(
  thesisId: string,
  thesisType: ThesisType,
  thesis: { title: string; lifecycleStatus: string | null }
): Promise<LifecycleTransition | null> {
  const configResult = await db
    .select({ count: count() })
    .from(thesisMonitoringConfigs)
    .where(
      and(
        eq(thesisMonitoringConfigs.thesisId, thesisId),
        eq(thesisMonitoringConfigs.thesisType, thesisType),
        eq(thesisMonitoringConfigs.enabled, true)
      )
    );

  const hasMonitoringConfig = (configResult[0]?.count || 0) > 0;

  if (hasMonitoringConfig) {
    return {
      thesisId,
      thesisType,
      thesisTitle: thesis.title,
      fromStage: 'validated',
      toStage: 'monitoring',
      triggerType: 'lifecycle_transition',
      actionRequired: 'Thesis monitoring is now active.',
      suggestedSkill: undefined,
    };
  }

  return null;
}

/**
 * Apply a lifecycle transition: update thesis status and create triage record
 */
export async function applyLifecycleTransition(
  transition: LifecycleTransition
): Promise<{ triageRecordId: string; journalEntryId: string }> {
  const { thesisId, thesisType, thesisTitle, fromStage, toStage, triggerType, actionRequired, suggestedSkill } = transition;

  // Update thesis lifecycle status
  if (thesisType === 'macro') {
    await db
      .update(macroTheses)
      .set({
        lifecycleStatus: toStage,
        updatedAt: new Date(),
      })
      .where(eq(macroTheses.id, thesisId));
  } else {
    await db
      .update(assetTheses)
      .set({
        lifecycleStatus: toStage,
        updatedAt: new Date(),
      })
      .where(eq(assetTheses.id, thesisId));
  }

  // Create triage record for the next action (if not moving to terminal states)
  const triageResult = await db
    .insert(thesisTriageRecords)
    .values({
      thesisId,
      thesisType,
      thesisTitle,
      triggerType,
      triggerSource: 'lifecycle_detection',
      contentSummary: {},
      aiAnalysis: {},
      matchedResults: [],
      severity: toStage === 'monitoring' ? 'info' : 'medium',
      urgency: toStage === 'monitoring' ? 'when_convenient' : 'this_week',
      status: toStage === 'monitoring' ? 'info' : 'attention',  // Aligned with lifecycle triggers
      lifecycleStage: toStage,
      suggestedSkill,
      actionRequired,
    })
    .returning({ id: thesisTriageRecords.id });

  const triageRecordId = triageResult[0].id;

  // Log to journal
  const journalResult = await db
    .insert(journalEntries)
    .values({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesisTitle,
      actionType: 'lifecycle_stage_changed',
      actionDescription: `Lifecycle stage changed from ${fromStage} to ${toStage}`,
      triageRecordId,
      previousState: { lifecycleStatus: fromStage },
      newState: { lifecycleStatus: toStage },
      source: 'automation',
    })
    .returning({ id: journalEntries.id });

  return {
    triageRecordId,
    journalEntryId: journalResult[0].id,
  };
}

/**
 * Check all theses for lifecycle transitions and apply them.
 * This can be run periodically or after specific actions.
 */
export async function processAllLifecycleTransitions(): Promise<{
  transitionsApplied: number;
  transitions: LifecycleTransition[];
}> {
  const transitions: LifecycleTransition[] = [];

  // Get all non-closed theses
  const macroThesesList = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      lifecycleStatus: macroTheses.lifecycleStatus,
    })
    .from(macroTheses)
    .where(sql`${macroTheses.lifecycleStatus} != 'closed' OR ${macroTheses.lifecycleStatus} IS NULL`);

  const assetThesesList = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      lifecycleStatus: assetTheses.lifecycleStatus,
    })
    .from(assetTheses)
    .where(sql`${assetTheses.lifecycleStatus} != 'closed' OR ${assetTheses.lifecycleStatus} IS NULL`);

  // Check macro theses
  for (const thesis of macroThesesList) {
    const transition = await detectLifecycleTransition(thesis.id, 'macro');
    if (transition) {
      await applyLifecycleTransition(transition);
      transitions.push(transition);
    }
  }

  // Check asset theses
  for (const thesis of assetThesesList) {
    const transition = await detectLifecycleTransition(thesis.id, 'asset');
    if (transition) {
      await applyLifecycleTransition(transition);
      transitions.push(transition);
    }
  }

  return {
    transitionsApplied: transitions.length,
    transitions,
  };
}

/**
 * Helper to get a thesis by ID and type
 */
async function getThesis(
  thesisId: string,
  thesisType: ThesisType
): Promise<{ title: string; lifecycleStatus: string | null } | null> {
  if (thesisType === 'macro') {
    const result = await db
      .select({
        title: macroTheses.title,
        lifecycleStatus: macroTheses.lifecycleStatus,
      })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId));
    return result[0] || null;
  } else {
    const result = await db
      .select({
        title: assetTheses.title,
        lifecycleStatus: assetTheses.lifecycleStatus,
      })
      .from(assetTheses)
      .where(eq(assetTheses.id, thesisId));
    return result[0] || null;
  }
}

/**
 * Log an action to the journal (utility function for other modules)
 */
export async function logToJournal(entry: {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType: string;
  actionDescription: string;
  triageRecordId?: string;
  skillInvoked?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  rationale?: string;
  source: 'user' | 'skill' | 'automation';
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const result = await db
    .insert(journalEntries)
    .values(entry)
    .returning({ id: journalEntries.id });

  return result[0].id;
}
