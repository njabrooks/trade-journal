import { NextRequest, NextResponse } from 'next/server';
import { updateThesisTriageStatus } from '@/db/queries/triage';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating thesis triage record:', error);
    return NextResponse.json(
      { error: 'Failed to update thesis triage record' },
      { status: 500 }
    );
  }
}
