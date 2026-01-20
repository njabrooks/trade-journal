import { NextRequest, NextResponse } from 'next/server';
import { updateThesisTriageStatus, getThesisTriageById } from '@/db/queries/triage';
import { logToJournal } from '@/lib/workflow';
import { db } from '@/db';
import { signals } from '@/db/schema';
import { eq, and, isNotNull, desc } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Fetch triage record for journal context before updating
    const triageRecord = await getThesisTriageById(id);
    if (!triageRecord) {
      return NextResponse.json(
        { error: 'Triage record not found' },
        { status: 404 }
      );
    }

    const previousStatus = triageRecord.status;
    const previousSeverity = triageRecord.severity;

    const update: {
      status?: string;
      userNotes?: string;
      completedBy?: string;
    } = {};

    if (body.status) {
      update.status = body.status;
    }

    if (body.userNotes !== undefined) {
      update.userNotes = body.userNotes;
    }

    if (body.completedBy) {
      update.completedBy = body.completedBy;
    }

    await updateThesisTriageStatus(id, update);

    // Log user action to journal when status changes to 'done'
    // Note: 'done' replaces old 'actioned'/'dismissed' values
    // body.severity = 'info' indicates dismissed (vs. just completed)
    if (body.status === 'done') {
      const isDismissed = body.severity === 'info';

      // For signal-related triage rules, look up articulation_id for batch grouping
      let batchId: string | undefined;
      if (triageRecord.triageRule === 'REVIEW_DRAFT_SIGNALS' || triageRecord.triageRule === 'REVIEW_RECOMMENDED_SIGNALS') {
        const [anySignal] = await db
          .select({ articulationId: signals.articulationId })
          .from(signals)
          .where(
            and(
              eq(signals.thesisId, triageRecord.thesisId),
              eq(signals.thesisType, triageRecord.thesisType),
              isNotNull(signals.articulationId)
            )
          )
          .orderBy(desc(signals.updatedAt))
          .limit(1);
        batchId = anySignal?.articulationId || undefined;
      }

      await logToJournal({
        objectType: triageRecord.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
        objectId: triageRecord.thesisId,
        objectTitle: triageRecord.thesisTitle,
        actionType: isDismissed ? 'triage_dismissed' : 'triage_completed',
        actionDescription: `User ${isDismissed ? 'dismissed' : 'completed'} triage: ${triageRecord.triageRule}${body.userNotes ? `. Notes: ${body.userNotes}` : ''}`,
        triageRecordId: id,
        previousState: {
          status: previousStatus,
          severity: previousSeverity,
          triageRule: triageRecord.triageRule,
        },
        newState: {
          status: body.status,
          severity: body.severity,
          completedBy: 'user',
          userNotes: body.userNotes,
        },
        rationale: body.userNotes,
        source: 'user',
        batchId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating thesis triage record:', error);
    return NextResponse.json(
      { error: 'Failed to update thesis triage record' },
      { status: 500 }
    );
  }
}
