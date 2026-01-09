import { NextRequest, NextResponse } from 'next/server';
import { updateThesisTriageStatus, getThesisTriageById } from '@/db/queries/triage';
import { logToJournal } from '@/lib/workflow';

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

    // Log user action to journal
    if (body.status === 'actioned' || body.status === 'dismissed') {
      await logToJournal({
        objectType: triageRecord.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
        objectId: triageRecord.thesisId,
        objectTitle: triageRecord.thesisTitle,
        actionType: body.status === 'actioned' ? 'triage_actioned' : 'triage_dismissed',
        actionDescription: `User ${body.status} triage: ${triageRecord.triageRule}${body.userNotes ? `. Notes: ${body.userNotes}` : ''}`,
        triageRecordId: id,
        previousState: {
          status: previousStatus,
          triageRule: triageRecord.triageRule,
        },
        newState: {
          status: body.status,
          completedBy: 'user',
          userNotes: body.userNotes,
        },
        rationale: body.userNotes,
        source: 'user',
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
