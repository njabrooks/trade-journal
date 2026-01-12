import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, signalStatusHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';
import { getMacroThesisById } from '@/db/queries/macroTheses';
import { getAssetThesisById } from '@/db/queries/assetTheses';

const VALID_STATUSES = ['not_triggered', 'monitoring', 'triggered', 'superseded', 'recommended'];
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

    // 2. Fetch current signal
    const [currentSignal] = await db
      .select()
      .from(signals)
      .where(eq(signals.id, id))
      .limit(1);

    if (!currentSignal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    const previousStatus = currentSignal.status;

    // 3. Fetch thesis for journal context
    const thesis = currentSignal.thesisType === 'macro'
      ? await getMacroThesisById(currentSignal.thesisId)
      : await getAssetThesisById(currentSignal.thesisId);
    const thesisTitle = thesis?.title || 'Unknown Thesis';

    // 4. Create signal_status_history entry
    const [historyRecord] = await db
      .insert(signalStatusHistory)
      .values({
        signalId: id,
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

    // 5. Update signals.status
    const [updatedSignal] = await db
      .update(signals)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(signals.id, id))
      .returning();

    // 6. Log to journal
    const statementPreview = currentSignal.statement.length > 50
      ? `${currentSignal.statement.slice(0, 50)}...`
      : currentSignal.statement;

    const journalEntryId = await logToJournal({
      objectType: currentSignal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: currentSignal.thesisId,
      objectTitle: thesisTitle,
      actionType: 'vi_status_changed',
      actionDescription: `Signal "${statementPreview}" status: ${previousStatus} → ${newStatus}`,
      previousState: {
        status: previousStatus,
        signalId: id,
        signalType: currentSignal.type,
      },
      newState: {
        status: newStatus,
        confidence,
        evidenceSource: evidence.source,
      },
      source,
      metadata: {
        signalId: id,
        signalType: currentSignal.type,
        importance: currentSignal.importance,
        evidenceSummary: evidence.summary,
        evidenceLink: evidence.link,
        userActionTaken,
      },
    });

    // 7. Return response
    return NextResponse.json({
      success: true,
      signal: updatedSignal,
      validationPoint: updatedSignal, // Legacy support
      historyRecord,
      journalEntryId,
    });
  } catch (error) {
    console.error('Error updating signal:', error);
    return NextResponse.json(
      { error: 'Failed to update signal' },
      { status: 500 }
    );
  }
}
