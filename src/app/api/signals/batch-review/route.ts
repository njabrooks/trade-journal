import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, signalStatusHistory, thesisTriageRecords } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';
import { getMacroThesisById } from '@/db/queries/macroTheses';
import { getAssetThesisById } from '@/db/queries/assetTheses';

/**
 * POST /api/signals/batch-review
 *
 * Handles batch review operations for recommended signals.
 *
 * Body:
 * {
 *   action: 'accept' | 'reject' | 'accept_all' | 'reject_all',
 *   signalId?: string,        // Required for single actions
 *   thesisId?: string,        // Required for bulk actions
 *   thesisType?: 'macro' | 'asset',  // Required for bulk actions
 *   modifications?: {         // Optional modifications when accepting
 *     statement?: string,
 *     rationale?: string,
 *     importance?: 'critical' | 'significant' | 'supporting',
 *   }
 * }
 */

interface BatchReviewBody {
  action: 'accept' | 'reject' | 'accept_all' | 'reject_all';
  signalId?: string;
  thesisId?: string;
  thesisType?: 'macro' | 'asset';
  modifications?: {
    statement?: string;
    rationale?: string;
    importance?: 'critical' | 'significant' | 'supporting';
    category?: 'explicit' | 'judgment_required';
  };
  explicitDetails?: {
    dataSource: 'fred' | 'iv_data' | 'price_feed';
    metric: string;
    metricName?: string;
    operator: string;
    threshold: number;
    thresholdUnit?: string;
    duration?: {
      count: number;
      period: string;
    };
    checkFrequency: 'daily' | 'weekly' | 'monthly';
    ticker?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchReviewBody = await request.json();
    const { action, signalId, thesisId, thesisType, modifications, explicitDetails } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }

    // Single signal operations
    if (action === 'accept' || action === 'reject') {
      if (!signalId) {
        return NextResponse.json(
          { error: 'signalId required for single signal operations' },
          { status: 400 }
        );
      }

      // Fetch the signal
      const [signal] = await db
        .select()
        .from(signals)
        .where(eq(signals.id, signalId))
        .limit(1);

      if (!signal) {
        return NextResponse.json(
          { error: 'Signal not found' },
          { status: 404 }
        );
      }

      if (signal.status !== 'recommended') {
        return NextResponse.json(
          { error: 'Signal is not in recommended status' },
          { status: 400 }
        );
      }

      // Get thesis for logging
      const thesis = signal.thesisType === 'macro'
        ? await getMacroThesisById(signal.thesisId)
        : await getAssetThesisById(signal.thesisId);
      const thesisTitle = thesis?.title || 'Unknown Thesis';

      if (action === 'accept') {
        // Apply modifications if provided
        const updateValues: Record<string, unknown> = {
          status: 'not_triggered',
          updatedAt: new Date(),
        };

        if (modifications?.statement) updateValues.statement = modifications.statement;
        if (modifications?.rationale) updateValues.rationale = modifications.rationale;
        if (modifications?.importance) updateValues.importance = modifications.importance;
        if (modifications?.category) updateValues.category = modifications.category;

        // Store explicit trigger configuration if provided
        if (explicitDetails) {
          updateValues.explicitDetails = explicitDetails;
          // Ensure category is set to explicit when explicitDetails are provided
          updateValues.category = 'explicit';
        }

        // Update signal status to not_triggered
        const [updatedSignal] = await db
          .update(signals)
          .set(updateValues)
          .where(eq(signals.id, signalId))
          .returning();

        // Create history record
        const historyEvidence: Record<string, unknown> = {
          source: 'user_review',
          summary: explicitDetails
            ? 'Signal accepted and configured as explicit trigger during batch review'
            : 'Signal accepted during batch review',
        };
        if (explicitDetails) {
          historyEvidence.explicitConfig = explicitDetails;
        }

        await db.insert(signalStatusHistory).values({
          signalId,
          previousStatus: 'recommended',
          newStatus: 'not_triggered',
          evidence: historyEvidence,
          confidence: 'high',
          assessedBy: 'user',
        });

        // Log to journal
        const actionDescription = explicitDetails
          ? `Accepted and configured explicit trigger for signal: "${signal.statement}"`
          : `Accepted recommended signal: "${signal.statement}"`;
        const newState: Record<string, unknown> = { status: 'not_triggered', ...modifications };
        if (explicitDetails) {
          newState.explicitDetails = explicitDetails;
          newState.category = 'explicit';
        }

        await logToJournal({
          objectType: signal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
          objectId: signal.thesisId,
          objectTitle: thesisTitle,
          actionType: explicitDetails ? 'signal_configured_explicit' : 'signal_accepted',
          actionDescription,
          previousState: { status: 'recommended', category: signal.category },
          newState,
          source: 'user',
        });

        // Check if any recommended signals remain and resolve triage if not
        await checkAndResolveTriage(signal.thesisId, signal.thesisType as 'macro' | 'asset');

        return NextResponse.json({
          success: true,
          signal: updatedSignal,
          action: 'accepted',
        });

      } else {
        // Reject - delete the signal
        await db.delete(signals).where(eq(signals.id, signalId));

        // Log to journal
        await logToJournal({
          objectType: signal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
          objectId: signal.thesisId,
          objectTitle: thesisTitle,
          actionType: 'signal_rejected',
          actionDescription: `Rejected recommended signal: "${signal.statement}"`,
          previousState: { status: 'recommended', statement: signal.statement },
          newState: { deleted: true },
          source: 'user',
        });

        // Check if any recommended signals remain and resolve triage if not
        await checkAndResolveTriage(signal.thesisId, signal.thesisType as 'macro' | 'asset');

        return NextResponse.json({
          success: true,
          action: 'rejected',
          signalId,
        });
      }
    }

    // Bulk operations
    if (action === 'accept_all' || action === 'reject_all') {
      if (!thesisId || !thesisType) {
        return NextResponse.json(
          { error: 'thesisId and thesisType required for bulk operations' },
          { status: 400 }
        );
      }

      // Fetch all recommended signals for this thesis
      const recommendedSignals = await db
        .select()
        .from(signals)
        .where(
          and(
            eq(signals.thesisId, thesisId),
            eq(signals.thesisType, thesisType),
            eq(signals.status, 'recommended')
          )
        );

      if (recommendedSignals.length === 0) {
        return NextResponse.json({
          success: true,
          action: action,
          count: 0,
          message: 'No recommended signals to process',
        });
      }

      // Get thesis for logging
      const thesis = thesisType === 'macro'
        ? await getMacroThesisById(thesisId)
        : await getAssetThesisById(thesisId);
      const thesisTitle = thesis?.title || 'Unknown Thesis';

      if (action === 'accept_all') {
        // Accept all - update status to not_triggered
        await db
          .update(signals)
          .set({
            status: 'not_triggered',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(signals.thesisId, thesisId),
              eq(signals.thesisType, thesisType),
              eq(signals.status, 'recommended')
            )
          );

        // Create history records for each
        for (const signal of recommendedSignals) {
          await db.insert(signalStatusHistory).values({
            signalId: signal.id,
            previousStatus: 'recommended',
            newStatus: 'not_triggered',
            evidence: {
              source: 'user_review',
              summary: 'Signal accepted during bulk batch review',
            },
            confidence: 'high',
            assessedBy: 'user',
          });
        }

        // Log to journal
        await logToJournal({
          objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
          objectId: thesisId,
          objectTitle: thesisTitle,
          actionType: 'signals_bulk_accepted',
          actionDescription: `Accepted all ${recommendedSignals.length} recommended signals`,
          previousState: { recommendedCount: recommendedSignals.length },
          newState: { acceptedCount: recommendedSignals.length },
          source: 'user',
        });

      } else {
        // Reject all - delete signals
        await db
          .delete(signals)
          .where(
            and(
              eq(signals.thesisId, thesisId),
              eq(signals.thesisType, thesisType),
              eq(signals.status, 'recommended')
            )
          );

        // Log to journal
        await logToJournal({
          objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
          objectId: thesisId,
          objectTitle: thesisTitle,
          actionType: 'signals_bulk_rejected',
          actionDescription: `Rejected all ${recommendedSignals.length} recommended signals`,
          previousState: { recommendedCount: recommendedSignals.length },
          newState: { deletedCount: recommendedSignals.length },
          source: 'user',
        });
      }

      // Resolve triage since no more recommended signals
      await checkAndResolveTriage(thesisId, thesisType);

      return NextResponse.json({
        success: true,
        action: action,
        count: recommendedSignals.length,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be one of: accept, reject, accept_all, reject_all' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in signal batch review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper to check if any recommended signals remain and resolve triage if not.
 */
async function checkAndResolveTriage(thesisId: string, thesisType: 'macro' | 'asset') {
  // Count remaining recommended signals
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signals)
    .where(
      and(
        eq(signals.thesisId, thesisId),
        eq(signals.thesisType, thesisType),
        eq(signals.status, 'recommended')
      )
    );

  if (count === 0) {
    // No more recommended signals - resolve the triage record
    const [triageRecord] = await db
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

    if (triageRecord) {
      await db
        .update(thesisTriageRecords)
        .set({
          status: 'complete',
          completedAt: new Date(),
          completedBy: 'user',
          userNotes: 'All recommended signals reviewed',
          updatedAt: new Date(),
        })
        .where(eq(thesisTriageRecords.id, triageRecord.id));

      // Log resolution
      await logToJournal({
        objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
        objectId: thesisId,
        objectTitle: triageRecord.thesisTitle,
        actionType: 'triage_resolved',
        actionDescription: 'REVIEW_RECOMMENDED_SIGNALS triage resolved - all signals reviewed',
        triageRecordId: triageRecord.id,
        previousState: { status: triageRecord.status },
        newState: { status: 'complete' },
        source: 'user',
      });
    }
  }
}

/**
 * GET /api/signals/batch-review?thesisId=xxx&thesisType=macro
 *
 * Get all recommended signals for a thesis for batch review.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const thesisId = searchParams.get('thesisId');
    const thesisType = searchParams.get('thesisType') as 'macro' | 'asset' | null;

    if (!thesisId || !thesisType) {
      return NextResponse.json(
        { error: 'Missing required params: thesisId, thesisType' },
        { status: 400 }
      );
    }

    // Fetch recommended signals
    const recommendedSignals = await db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.thesisId, thesisId),
          eq(signals.thesisType, thesisType),
          eq(signals.status, 'recommended')
        )
      )
      .orderBy(signals.importance, signals.type);

    // Get thesis info
    const thesis = thesisType === 'macro'
      ? await getMacroThesisById(thesisId)
      : await getAssetThesisById(thesisId);

    return NextResponse.json({
      signals: recommendedSignals,
      thesis: thesis ? { id: thesis.id, title: thesis.title } : null,
      count: recommendedSignals.length,
    });

  } catch (error) {
    console.error('Error fetching recommended signals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
