import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, signalStatusHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      signalId,
      validationPointId, // Legacy support
      newStatus,
      evidence,
      confidence,
      userActionTaken,
    } = body;

    const resolvedSignalId = signalId || validationPointId;

    // Validate required fields
    if (!resolvedSignalId || !newStatus || !evidence || !confidence) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!evidence.source || !evidence.summary) {
      return NextResponse.json(
        { error: 'Evidence must include source and summary' },
        { status: 400 }
      );
    }

    // Get current status
    const [currentSignal] = await db
      .select()
      .from(signals)
      .where(eq(signals.id, resolvedSignalId))
      .limit(1);

    if (!currentSignal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    // Insert status history record
    const [historyRecord] = await db
      .insert(signalStatusHistory)
      .values({
        signalId: resolvedSignalId,
        previousStatus: currentSignal.status,
        newStatus,
        evidence: {
          source: evidence.source,
          summary: evidence.summary,
          link: evidence.link || null,
        },
        confidence,
        assessedBy: 'user',
        userActionRequired: newStatus === 'triggered',
        userActionTaken: userActionTaken || null,
        userActionTimestamp: userActionTaken ? new Date() : null,
      })
      .returning();

    // Update the signal status
    const [updatedSignal] = await db
      .update(signals)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(signals.id, resolvedSignalId))
      .returning();

    return NextResponse.json({
      success: true,
      historyRecord,
      signal: updatedSignal,
      validationPoint: updatedSignal, // Legacy support
    });
  } catch (error) {
    console.error('Error updating signal status:', error);
    return NextResponse.json(
      { error: 'Failed to update signal status' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch status history for a signal
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const signalId = searchParams.get('signalId') || searchParams.get('validationPointId'); // Legacy support

    if (!signalId) {
      return NextResponse.json(
        { error: 'signalId is required' },
        { status: 400 }
      );
    }

    const history = await db
      .select()
      .from(signalStatusHistory)
      .where(eq(signalStatusHistory.signalId, signalId))
      .orderBy(signalStatusHistory.timestamp);

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching signal status history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status history' },
      { status: 500 }
    );
  }
}
