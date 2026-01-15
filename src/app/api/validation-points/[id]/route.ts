import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, signalStatusHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';
import { getMacroThesisById } from '@/db/queries/macroTheses';
import { getAssetThesisById } from '@/db/queries/assetTheses';

const VALID_STATUSES = ['not_triggered', 'triggered', 'superseded', 'recommended'];
const VALID_CONFIDENCE = ['low', 'medium', 'high'];
const VALID_SOURCES = ['user', 'automation'];

interface StatusUpdateBody {
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

interface UpgradeToExplicitBody {
  category: 'data_driven';
  explicitDetails: {
    dataSource: string;
    metric: string;
    operator: string;
    threshold: number;
    thresholdUnit?: string;
    durationCount?: number;
    durationPeriod?: string;
    checkFrequency: string;
    notes?: string;
  };
}

type PatchRequestBody = StatusUpdateBody | UpgradeToExplicitBody;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as PatchRequestBody;

    // Detect if this is an upgrade-to-data-driven request or a status update
    if ('category' in body && body.category === 'data_driven' && 'explicitDetails' in body) {
      return handleUpgradeToExplicit(id, body as UpgradeToExplicitBody);
    }

    // Handle status update
    const statusBody = body as StatusUpdateBody;

    // 1. Validate input
    const { newStatus, evidence, confidence, source = 'user', userActionTaken } = statusBody;

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

    // 3. Fetch context for journal (thesis or strategy)
    let thesisTitle = 'Unknown';
    if (currentSignal.entityType === 'thesis' && currentSignal.thesisId) {
      const thesis = currentSignal.thesisType === 'macro'
        ? await getMacroThesisById(currentSignal.thesisId)
        : await getAssetThesisById(currentSignal.thesisId);
      thesisTitle = thesis?.title || 'Unknown Thesis';
    } else if (currentSignal.entityType === 'strategy') {
      thesisTitle = 'Strategy Signal';
    }

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

    // Log to journal (only for thesis signals with valid thesisId)
    let journalEntryId: string | undefined;
    if (currentSignal.entityType === 'thesis' && currentSignal.thesisId && currentSignal.thesisType) {
      journalEntryId = await logToJournal({
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
    }

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

/**
 * Handle upgrading a judgment-based signal to an explicit (data-driven) signal
 */
async function handleUpgradeToExplicit(
  id: string,
  body: UpgradeToExplicitBody
): Promise<NextResponse> {
  // 1. Fetch current signal
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

  // 2. Verify signal is judgment-based
  if (currentSignal.category !== 'judgment') {
    return NextResponse.json(
      { error: 'Signal is not a judgment-based signal. Only judgment signals can be upgraded to data-driven.' },
      { status: 400 }
    );
  }

  // 3. Fetch context for journal (thesis or strategy)
  let thesisTitle = 'Unknown';
  if (currentSignal.entityType === 'thesis' && currentSignal.thesisId) {
    const thesis = currentSignal.thesisType === 'macro'
      ? await getMacroThesisById(currentSignal.thesisId)
      : await getAssetThesisById(currentSignal.thesisId);
    thesisTitle = thesis?.title || 'Unknown Thesis';
  } else if (currentSignal.entityType === 'strategy') {
    thesisTitle = 'Strategy Signal';
  }

  // 4. Update signal with new category and explicit details
  const [updatedSignal] = await db
    .update(signals)
    .set({
      category: 'data_driven',
      explicitDetails: body.explicitDetails,
      updatedAt: new Date(),
    })
    .where(eq(signals.id, id))
    .returning();

  // 5. Create history record
  await db.insert(signalStatusHistory).values({
    signalId: id,
    previousStatus: currentSignal.status,
    newStatus: currentSignal.status, // Status unchanged
    evidence: {
      source: 'user_configuration',
      summary: `Converted to explicit signal with data-driven trigger: ${body.explicitDetails.metric} ${body.explicitDetails.operator} ${body.explicitDetails.threshold}`,
    },
    confidence: 'high',
    assessedBy: 'user',
  });

  // 6. Log to journal (only for thesis signals)
  const statementPreview = currentSignal.statement.length > 50
    ? `${currentSignal.statement.slice(0, 50)}...`
    : currentSignal.statement;

  if (currentSignal.entityType === 'thesis' && currentSignal.thesisId && currentSignal.thesisType) {
    await logToJournal({
      objectType: currentSignal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: currentSignal.thesisId,
      objectTitle: thesisTitle,
      actionType: 'signal_upgraded_to_data_driven',
      actionDescription: `Signal "${statementPreview}" upgraded from judgment to data-driven with data trigger`,
      previousState: {
        category: 'judgment',
        signalId: id,
        signalType: currentSignal.type,
      },
      newState: {
        category: 'data_driven',
        explicitDetails: body.explicitDetails,
      },
      source: 'user',
      metadata: {
        signalId: id,
        signalType: currentSignal.type,
        importance: currentSignal.importance,
        dataSource: body.explicitDetails.dataSource,
        metric: body.explicitDetails.metric,
      },
    });
  }

  // 7. Return response
  return NextResponse.json({
    success: true,
    signal: updatedSignal,
    validationPoint: updatedSignal, // Legacy support
    message: 'Signal upgraded to explicit',
  });
}
