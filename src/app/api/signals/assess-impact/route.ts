import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, macroTheses, assetTheses, thesisTriageRecords, signalStatusHistory } from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';

/**
 * POST /api/signals/assess-impact
 *
 * Record impact assessment for triggered signals at thesis level.
 * This handles the "Strengthens/Weakens/No Change" decision for SIGNAL_TRIGGERED triage.
 *
 * Body:
 * {
 *   thesisId: string,
 *   thesisType: 'macro' | 'asset',
 *   assessment: 'strengthens' | 'weakens' | 'no_change',
 *   notes?: string,
 *   convictionUpdate?: 'increase' | 'decrease' | 'maintain',
 *   triggeredSignalIds: string[],
 * }
 */

interface AssessImpactBody {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  assessment: 'strengthens' | 'weakens' | 'no_change';
  notes?: string;
  convictionUpdate?: 'increase' | 'decrease' | 'maintain';
  triggeredSignalIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: AssessImpactBody = await request.json();
    const { thesisId, thesisType, assessment, notes, convictionUpdate, triggeredSignalIds } = body;

    // Validation
    if (!thesisId || !thesisType || !assessment) {
      return NextResponse.json(
        { error: 'Missing required fields: thesisId, thesisType, assessment' },
        { status: 400 }
      );
    }

    if (!['strengthens', 'weakens', 'no_change'].includes(assessment)) {
      return NextResponse.json(
        { error: 'Invalid assessment. Must be: strengthens, weakens, or no_change' },
        { status: 400 }
      );
    }

    // Get thesis for title and current confidence level (displayed as conviction in UI)
    let thesis: { title: string; confidenceLevel: string | null } | undefined;

    if (thesisType === 'macro') {
      const [result] = await db
        .select({ title: macroTheses.title, confidenceLevel: macroTheses.confidenceLevel })
        .from(macroTheses)
        .where(eq(macroTheses.id, thesisId))
        .limit(1);
      thesis = result;
    } else {
      const [result] = await db
        .select({ title: assetTheses.title, confidenceLevel: assetTheses.confidenceLevel })
        .from(assetTheses)
        .where(eq(assetTheses.id, thesisId))
        .limit(1);
      thesis = result;
    }

    if (!thesis) {
      return NextResponse.json(
        { error: 'Thesis not found' },
        { status: 404 }
      );
    }

    const previousConfidence = thesis.confidenceLevel;
    let newConfidence = thesis.confidenceLevel;

    // Calculate new confidence level if update requested (UI calls this conviction)
    if (convictionUpdate && convictionUpdate !== 'maintain') {
      const confidenceLevels = ['low', 'medium', 'high'];
      const currentIndex = confidenceLevels.indexOf(thesis.confidenceLevel || 'medium');

      if (convictionUpdate === 'increase' && currentIndex < 2) {
        newConfidence = confidenceLevels[currentIndex + 1];
      } else if (convictionUpdate === 'decrease' && currentIndex > 0) {
        newConfidence = confidenceLevels[currentIndex - 1];
      }
    }

    // Update thesis confidence level if changed
    if (newConfidence !== previousConfidence) {
      if (thesisType === 'macro') {
        await db
          .update(macroTheses)
          .set({ confidenceLevel: newConfidence, updatedAt: new Date() })
          .where(eq(macroTheses.id, thesisId));
      } else {
        await db
          .update(assetTheses)
          .set({ confidenceLevel: newConfidence, updatedAt: new Date() })
          .where(eq(assetTheses.id, thesisId));
      }
    }

    // Update triggered signals to 'monitoring' status (acknowledged but still watching)
    if (triggeredSignalIds && triggeredSignalIds.length > 0) {
      // Create history records for each signal
      for (const signalId of triggeredSignalIds) {
        await db.insert(signalStatusHistory).values({
          signalId,
          previousStatus: 'triggered',
          newStatus: 'monitoring',
          evidence: {
            source: 'user_assessment',
            summary: `Impact assessment: ${assessment}${notes ? '. Notes: ' + notes : ''}`,
            assessment,
            confidenceChange: newConfidence !== previousConfidence ? {
              from: previousConfidence,
              to: newConfidence,
            } : null,
          },
          confidence: 'high',
          assessedBy: 'user',
        });
      }

      // Update signal statuses to monitoring (back to watching, trigger acknowledged)
      await db
        .update(signals)
        .set({
          status: 'monitoring',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(signals.thesisId, thesisId),
            eq(signals.thesisType, thesisType),
            eq(signals.status, 'triggered')
          )
        );
    }

    // Find and resolve the SIGNAL_TRIGGERED triage record
    const [triageRecord] = await db
      .select()
      .from(thesisTriageRecords)
      .where(
        and(
          eq(thesisTriageRecords.thesisId, thesisId),
          eq(thesisTriageRecords.thesisType, thesisType),
          eq(thesisTriageRecords.triageRule, 'SIGNAL_TRIGGERED'),
          sql`${thesisTriageRecords.status} != 'complete'`
        )
      )
      .limit(1);

    if (triageRecord) {
      await db
        .update(thesisTriageRecords)
        .set({
          status: 'complete',
          completedAt: new Date(),
          completedBy: 'user',
          userNotes: notes || `Assessment: ${assessment}`,
          aiAnalysis: {
            ...(triageRecord.aiAnalysis as object || {}),
            userAssessment: assessment,
            confidenceChange: newConfidence !== previousConfidence ? {
              from: previousConfidence,
              to: newConfidence,
            } : null,
          },
          updatedAt: new Date(),
        })
        .where(eq(thesisTriageRecords.id, triageRecord.id));
    }

    // Log to journal
    await logToJournal({
      objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: thesisId,
      objectTitle: thesis.title,
      actionType: 'signal_impact_assessed',
      actionDescription: `Impact assessment: ${assessment}${convictionUpdate && convictionUpdate !== 'maintain' ? `. Confidence ${convictionUpdate}d` : ''}`,
      triageRecordId: triageRecord?.id,
      previousState: {
        confidence: previousConfidence,
        triggeredSignalCount: triggeredSignalIds?.length || 0,
      },
      newState: {
        assessment,
        confidence: newConfidence,
        signalsAcknowledged: triggeredSignalIds?.length || 0,
      },
      source: 'user',
      metadata: {
        notes,
        convictionUpdate,
        triggeredSignalIds,
      },
    });

    return NextResponse.json({
      success: true,
      assessment,
      confidenceUpdated: newConfidence !== previousConfidence,
      previousConfidence,
      newConfidence,
      signalsAcknowledged: triggeredSignalIds?.length || 0,
      triageResolved: !!triageRecord,
    });

  } catch (error) {
    console.error('Error assessing signal impact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
