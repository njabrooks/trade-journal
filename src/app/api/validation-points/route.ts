import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';
import { getMacroThesisById } from '@/db/queries/macroTheses';
import { getAssetThesisById } from '@/db/queries/assetTheses';

/**
 * GET /api/validation-points
 *
 * Query params:
 * - thesisId (required): UUID of the thesis
 * - thesisType (required): 'macro' | 'asset'
 * - status (optional): Filter by status (e.g., 'recommended', 'active', 'triggered')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const thesisId = searchParams.get('thesisId');
    const thesisType = searchParams.get('thesisType') as 'macro' | 'asset' | null;
    const status = searchParams.get('status');

    if (!thesisId || !thesisType) {
      return NextResponse.json(
        { error: 'thesisId and thesisType are required' },
        { status: 400 }
      );
    }

    if (thesisType !== 'macro' && thesisType !== 'asset') {
      return NextResponse.json(
        { error: 'thesisType must be "macro" or "asset"' },
        { status: 400 }
      );
    }

    // Build query conditions
    const conditions = [
      eq(signals.thesisId, thesisId),
      eq(signals.thesisType, thesisType),
    ];

    if (status) {
      conditions.push(eq(signals.status, status));
    }

    const result = await db
      .select()
      .from(signals)
      .where(and(...conditions))
      .orderBy(signals.createdAt);

    return NextResponse.json({ validationPoints: result });
  } catch (error) {
    console.error('Error fetching signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/validation-points
 *
 * Update a signal's statement and/or notes.
 * Logs the edit to the journal for tracking.
 *
 * Body:
 * - id (required): UUID of the signal
 * - statement?: string
 * - notes?: string
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, statement, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    if (statement === undefined && notes === undefined) {
      return NextResponse.json(
        { error: 'At least one of statement or notes must be provided' },
        { status: 400 }
      );
    }

    // Fetch the existing signal
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

    // Build update values
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (statement !== undefined) updateValues.statement = statement;
    if (notes !== undefined) updateValues.notes = notes;

    // Update the signal
    const [updatedSignal] = await db
      .update(signals)
      .set(updateValues)
      .where(eq(signals.id, id))
      .returning();

    // Get thesis for journal (only for thesis signals)
    let thesis: { title: string } | null | undefined;
    if (existingSignal.entityType === 'thesis' && existingSignal.thesisId) {
      thesis = existingSignal.thesisType === 'macro'
        ? await getMacroThesisById(existingSignal.thesisId)
        : await getAssetThesisById(existingSignal.thesisId);
    }

    // Build change description
    const changes: string[] = [];
    if (statement !== undefined && statement !== existingSignal.statement) {
      changes.push('statement');
    }
    if (notes !== undefined && notes !== existingSignal.notes) {
      changes.push('notes');
    }

    // Log to journal
    await logToJournal({
      objectType: 'validation_point',
      objectId: id,
      objectTitle: updatedSignal.statement,
      actionType: 'signal_edited',
      actionDescription: `Edited signal ${changes.join(' and ')}: "${existingSignal.statement.slice(0, 50)}${existingSignal.statement.length > 50 ? '...' : ''}"`,
      previousState: {
        statement: existingSignal.statement,
        notes: existingSignal.notes,
      },
      newState: {
        statement: updatedSignal.statement,
        notes: updatedSignal.notes,
      },
      source: 'user',
      metadata: {
        thesisId: existingSignal.thesisId,
        thesisType: existingSignal.thesisType,
        thesisTitle: thesis?.title,
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
