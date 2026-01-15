import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, strategies } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';

/**
 * GET /api/signals/[id]
 *
 * Get a single signal by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [signal] = await db
      .select()
      .from(signals)
      .where(eq(signals.id, id))
      .limit(1);

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ signal });
  } catch (error) {
    console.error('Error fetching signal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signal' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/signals/[id]
 *
 * Update a signal.
 *
 * Body:
 * {
 *   statement?: string;
 *   type?: 'confirmation' | 'warning';
 *   importance?: 'critical' | 'significant' | 'supporting';
 *   status?: 'not_triggered' | 'monitoring' | 'triggered' | 'superseded';
 *   notes?: string;
 *   explicitDetails?: {
 *     logic: 'all' | 'any';
 *     conditions: Array<{
 *       id: string;
 *       type: string;
 *       value: number;
 *       ticker?: string;
 *     }>;
 *     recommendedAction: string;
 *     actionNotes?: string;
 *     tvAlertName?: string;
 *   };
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { statement, type, importance, status, notes, explicitDetails } = body;

    // Get existing signal
    const [existingSignal] = await db
      .select()
      .from(signals)
      .where(eq(signals.id, id))
      .limit(1);

    if (!existingSignal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    // Validate type if provided
    if (type && !['confirmation', 'warning'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "confirmation" or "warning"' },
        { status: 400 }
      );
    }

    // Validate importance if provided
    if (importance && !['critical', 'significant', 'supporting'].includes(importance)) {
      return NextResponse.json(
        { error: 'importance must be "critical", "significant", or "supporting"' },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !['not_triggered', 'monitoring', 'triggered', 'superseded'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "not_triggered", "monitoring", "triggered", or "superseded"' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (statement !== undefined) updateData.statement = statement;
    if (type !== undefined) updateData.type = type;
    if (importance !== undefined) updateData.importance = importance;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes || null;
    if (explicitDetails !== undefined) updateData.explicitDetails = explicitDetails;

    // Update the signal
    const [updatedSignal] = await db
      .update(signals)
      .set(updateData)
      .where(eq(signals.id, id))
      .returning();

    // Get strategy for logging
    let strategyTitle = 'Unknown Strategy';
    if (existingSignal.strategyId) {
      const [strategy] = await db
        .select()
        .from(strategies)
        .where(eq(strategies.id, existingSignal.strategyId))
        .limit(1);
      if (strategy) {
        strategyTitle = strategy.autoDerivedLabel || strategy.strategyKey;
      }
    }

    // Determine action type based on what changed
    let actionType = 'signal_updated';
    let actionDescription = `Updated signal: "${updatedSignal.statement}"`;

    if (status && status !== existingSignal.status) {
      if (status === 'not_triggered' && existingSignal.status === 'triggered') {
        actionType = 'signal_reset';
        actionDescription = `Reset signal to not_triggered: "${updatedSignal.statement}"`;
      } else {
        actionType = 'signal_status_changed';
        actionDescription = `Changed signal status from ${existingSignal.status} to ${status}: "${updatedSignal.statement}"`;
      }
    }

    // Log to journal
    await logToJournal({
      objectType: 'strategy',
      objectId: existingSignal.strategyId || id,
      objectTitle: strategyTitle,
      actionType,
      actionDescription,
      previousState: {
        statement: existingSignal.statement,
        type: existingSignal.type,
        importance: existingSignal.importance,
        status: existingSignal.status,
      },
      newState: {
        statement: updatedSignal.statement,
        type: updatedSignal.type,
        importance: updatedSignal.importance,
        status: updatedSignal.status,
      },
      source: 'user',
      metadata: {
        signalId: id,
      },
    });

    return NextResponse.json({
      success: true,
      signal: updatedSignal,
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
 * DELETE /api/signals/[id]
 *
 * Delete a signal.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get existing signal for logging
    const [existingSignal] = await db
      .select()
      .from(signals)
      .where(eq(signals.id, id))
      .limit(1);

    if (!existingSignal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    // Get strategy for logging
    let strategyTitle = 'Unknown Strategy';
    if (existingSignal.strategyId) {
      const [strategy] = await db
        .select()
        .from(strategies)
        .where(eq(strategies.id, existingSignal.strategyId))
        .limit(1);
      if (strategy) {
        strategyTitle = strategy.autoDerivedLabel || strategy.strategyKey;
      }
    }

    // Delete the signal
    await db
      .delete(signals)
      .where(eq(signals.id, id));

    // Log to journal
    await logToJournal({
      objectType: 'strategy',
      objectId: existingSignal.strategyId || id,
      objectTitle: strategyTitle,
      actionType: 'signal_deleted',
      actionDescription: `Deleted ${existingSignal.type} signal: "${existingSignal.statement}"`,
      previousState: {
        signalId: id,
        statement: existingSignal.statement,
        type: existingSignal.type,
        importance: existingSignal.importance,
        status: existingSignal.status,
      },
      newState: { deleted: true },
      source: 'user',
      metadata: {
        signalId: id,
        strategyId: existingSignal.strategyId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Signal deleted',
    });
  } catch (error) {
    console.error('Error deleting signal:', error);
    return NextResponse.json(
      { error: 'Failed to delete signal' },
      { status: 500 }
    );
  }
}
