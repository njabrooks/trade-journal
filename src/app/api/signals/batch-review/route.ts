import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, signalStatusHistory, signalEntityLinks } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
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
 *     notes?: string,
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
    notes?: string;
    importance?: 'critical' | 'significant' | 'supporting';
    // Note: category is NOT modifiable directly - it's derived from explicitDetails
    // Category becomes 'data_driven' only when explicitDetails is configured
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

      if (signal.status !== 'draft') {
        return NextResponse.json(
          { error: 'Signal is not in recommended status' },
          { status: 400 }
        );
      }

      // Look up linked entity from junction table
      const [linkedEntity] = await db
        .select({
          entityType: signalEntityLinks.entityType,
          thesisId: signalEntityLinks.thesisId,
          thesisType: signalEntityLinks.thesisType,
        })
        .from(signalEntityLinks)
        .where(eq(signalEntityLinks.signalId, signalId))
        .limit(1);

      const signalEntityType = linkedEntity?.entityType || 'thesis';
      const signalThesisId = linkedEntity?.thesisId;
      const signalThesisType = linkedEntity?.thesisType as 'macro' | 'asset' | null;

      // Get thesis for logging (only for thesis signals, not strategy signals)
      let thesisTitle = 'Unknown Thesis';
      if (signalEntityType === 'thesis' && signalThesisId) {
        const thesis = signalThesisType === 'macro'
          ? await getMacroThesisById(signalThesisId)
          : await getAssetThesisById(signalThesisId);
        thesisTitle = thesis?.title || 'Unknown Thesis';
      } else if (signalEntityType === 'strategy') {
        thesisTitle = 'Strategy Signal';
      }

      if (action === 'accept') {
        // Apply modifications if provided
        const updateValues: Record<string, unknown> = {
          status: 'active',
          updatedAt: new Date(),
        };

        if (modifications?.statement) updateValues.statement = modifications.statement;
        if (modifications?.notes) updateValues.notes = modifications.notes;
        if (modifications?.importance) updateValues.importance = modifications.importance;
        // Note: category is NOT modified directly - only set to 'data_driven' when explicitDetails provided

        // Store data-driven trigger configuration if provided
        if (explicitDetails) {
          updateValues.explicitDetails = explicitDetails;
          // Ensure category is set to data_driven when explicitDetails are provided
          updateValues.category = 'data_driven';
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
          previousStatus: 'draft',
          newStatus: 'active',
          evidence: historyEvidence,
          confidence: 'high',
          assessedBy: 'user',
        });

        // Log to journal
        const actionDescription = explicitDetails
          ? `Accepted and configured data-driven trigger for signal: "${signal.statement}"`
          : `Accepted recommended signal: "${signal.statement}"`;
        const newState: Record<string, unknown> = { status: 'active', ...modifications };
        if (explicitDetails) {
          newState.explicitDetails = explicitDetails;
          newState.category = 'data_driven';
        }

        // Log to journal and check triage (only for thesis signals)
        // Use articulation_id as batchId to group journal entries from the same synthesis
        if (signalEntityType === 'thesis' && signalThesisId && signalThesisType) {
          await logToJournal({
            objectType: signalThesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
            objectId: signalThesisId,
            objectTitle: thesisTitle,
            actionType: explicitDetails ? 'signal_configured_data_driven' : 'signal_accepted',
            actionDescription,
            previousState: { status: 'draft', category: signal.category },
            newState,
            source: 'user',
            batchId: signal.articulationId || undefined,
          });
        }

        return NextResponse.json({
          success: true,
          signal: updatedSignal,
          action: 'accepted',
        });

      } else {
        // Reject - delete the signal
        await db.delete(signals).where(eq(signals.id, signalId));

        // Log to journal and check triage (only for thesis signals)
        // Use articulation_id as batchId to group journal entries from the same synthesis
        if (signalEntityType === 'thesis' && signalThesisId && signalThesisType) {
          await logToJournal({
            objectType: signalThesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
            objectId: signalThesisId,
            objectTitle: thesisTitle,
            actionType: 'signal_rejected',
            actionDescription: `Rejected recommended signal: "${signal.statement}"`,
            previousState: { status: 'draft', statement: signal.statement },
            newState: { deleted: true },
            source: 'user',
            batchId: signal.articulationId || undefined,
          });
        }

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

      // Fetch all recommended signals for this thesis (via junction table)
      const recommendedSignalRows = await db
        .select({ signals })
        .from(signals)
        .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
        .where(
          and(
            eq(signalEntityLinks.thesisId, thesisId),
            eq(signalEntityLinks.thesisType, thesisType),
            eq(signals.status, 'draft')
          )
        );
      const recommendedSignals = recommendedSignalRows.map(r => r.signals);

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

      const signalIds = recommendedSignals.map(s => s.id);

      if (action === 'accept_all') {
        // Accept all - update status to active (using IDs from earlier fetch)
        await db
          .update(signals)
          .set({
            status: 'active',
            updatedAt: new Date(),
          })
          .where(inArray(signals.id, signalIds));

        // Create history records for each
        for (const signal of recommendedSignals) {
          await db.insert(signalStatusHistory).values({
            signalId: signal.id,
            previousStatus: 'draft',
            newStatus: 'active',
            evidence: {
              source: 'user_review',
              summary: 'Signal accepted during bulk batch review',
            },
            confidence: 'high',
            assessedBy: 'user',
          });
        }

        // Log to journal - use articulation_id as batchId for grouping
        await logToJournal({
          objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
          objectId: thesisId,
          objectTitle: thesisTitle,
          actionType: 'signals_bulk_accepted',
          actionDescription: `Accepted all ${recommendedSignals.length} recommended signals`,
          previousState: { recommendedCount: recommendedSignals.length },
          newState: { acceptedCount: recommendedSignals.length },
          source: 'user',
          batchId: recommendedSignals[0]?.articulationId || undefined,
        });

      } else {
        // Reject all - delete signals (using IDs from earlier fetch)
        await db
          .delete(signals)
          .where(inArray(signals.id, signalIds));

        // Log to journal - use articulation_id as batchId for grouping
        await logToJournal({
          objectType: thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
          objectId: thesisId,
          objectTitle: thesisTitle,
          actionType: 'signals_bulk_rejected',
          actionDescription: `Rejected all ${recommendedSignals.length} recommended signals`,
          previousState: { recommendedCount: recommendedSignals.length },
          newState: { deletedCount: recommendedSignals.length },
          source: 'user',
          batchId: recommendedSignals[0]?.articulationId || undefined,
        });
      }

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

    // Fetch recommended signals (via junction table)
    const recommendedSignalRows = await db
      .select({ signals })
      .from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(
        and(
          eq(signalEntityLinks.thesisId, thesisId),
          eq(signalEntityLinks.thesisType, thesisType),
          eq(signals.status, 'draft')
        )
      )
      .orderBy(signals.importance, signals.type);
    const recommendedSignals = recommendedSignalRows.map(r => r.signals);

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
