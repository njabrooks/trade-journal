import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { validationPoints, validationStatusHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';
import { getMacroThesisById } from '@/db/queries/macroTheses';
import { getAssetThesisById } from '@/db/queries/assetTheses';

const VALID_STATUSES = ['not_triggered', 'monitoring', 'triggered', 'superseded'];
const VALID_CONFIDENCE = ['low', 'medium', 'high'];
const VALID_SOURCES = ['user', 'automation'];

interface PatchRequestBody {
  newStatus: string;
  evidence: {
    source: string;
    summary: string;
    link?: string;
  };
  confidence: string;
  source?: 'user' | 'automation';
  userActionTaken?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: PatchRequestBody = await request.json();

    // 1. Validate input
    const { newStatus, evidence, confidence, source = 'user', userActionTaken } = body;

    if (!newStatus || !evidence || !confidence) {
      return NextResponse.json(
        { error: 'Missing required fields: newStatus, evidence, confidence' },
        { status: 400 }
      );
    }

    if (!evidence.source || !evidence.summary) {
      return NextResponse.json(
        { error: 'Evidence must include source and summary' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_CONFIDENCE.includes(confidence)) {
      return NextResponse.json(
        { error: `Invalid confidence. Must be one of: ${VALID_CONFIDENCE.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_SOURCES.includes(source)) {
      return NextResponse.json(
        { error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` },
        { status: 400 }
      );
    }

    // 2. Fetch current validation point
    const [currentPoint] = await db
      .select()
      .from(validationPoints)
      .where(eq(validationPoints.id, id))
      .limit(1);

    if (!currentPoint) {
      return NextResponse.json(
        { error: 'Validation point not found' },
        { status: 404 }
      );
    }

    const previousStatus = currentPoint.status;

    // 3. Fetch thesis for journal context
    const thesis = currentPoint.thesisType === 'macro'
      ? await getMacroThesisById(currentPoint.thesisId)
      : await getAssetThesisById(currentPoint.thesisId);
    const thesisTitle = thesis?.title || 'Unknown Thesis';

    // 4. Create validation_status_history entry
    const [historyRecord] = await db
      .insert(validationStatusHistory)
      .values({
        validationPointId: id,
        previousStatus: previousStatus,
        newStatus,
        evidence: {
          source: evidence.source,
          summary: evidence.summary,
          link: evidence.link || null,
        },
        confidence,
        assessedBy: source === 'automation' ? 'claude' : 'user',
        userActionRequired: newStatus === 'triggered',
        userActionTaken: userActionTaken || null,
        userActionTimestamp: userActionTaken ? new Date() : null,
      })
      .returning();

    // 5. Update validation_points.status
    const [updatedPoint] = await db
      .update(validationPoints)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(validationPoints.id, id))
      .returning();

    // 6. Log to journal
    const statementPreview = currentPoint.statement.length > 50
      ? `${currentPoint.statement.slice(0, 50)}...`
      : currentPoint.statement;

    const journalEntryId = await logToJournal({
      objectType: currentPoint.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: currentPoint.thesisId,
      objectTitle: thesisTitle,
      actionType: 'vi_status_changed',
      actionDescription: `V&I point "${statementPreview}" status: ${previousStatus} → ${newStatus}`,
      previousState: {
        status: previousStatus,
        validationPointId: id,
        validationType: currentPoint.type,
      },
      newState: {
        status: newStatus,
        confidence,
        evidenceSource: evidence.source,
      },
      source,
      metadata: {
        validationPointId: id,
        validationType: currentPoint.type,
        importance: currentPoint.importance,
        evidenceSummary: evidence.summary,
        evidenceLink: evidence.link,
        userActionTaken,
      },
    });

    // 7. Return response
    return NextResponse.json({
      success: true,
      validationPoint: updatedPoint,
      historyRecord,
      journalEntryId,
    });
  } catch (error) {
    console.error('Error updating validation point:', error);
    return NextResponse.json(
      { error: 'Failed to update validation point' },
      { status: 500 }
    );
  }
}
