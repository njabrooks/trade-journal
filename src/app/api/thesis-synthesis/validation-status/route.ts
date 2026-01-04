import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { validationPoints, validationStatusHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      validationPointId,
      newStatus,
      evidence,
      confidence,
      userActionTaken,
    } = body;

    // Validate required fields
    if (!validationPointId || !newStatus || !evidence || !confidence) {
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
    const [currentPoint] = await db
      .select()
      .from(validationPoints)
      .where(eq(validationPoints.id, validationPointId))
      .limit(1);

    if (!currentPoint) {
      return NextResponse.json(
        { error: 'Validation point not found' },
        { status: 404 }
      );
    }

    // Insert status history record
    const [historyRecord] = await db
      .insert(validationStatusHistory)
      .values({
        validationPointId,
        previousStatus: currentPoint.status,
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

    // Update the validation point status
    const [updatedPoint] = await db
      .update(validationPoints)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(validationPoints.id, validationPointId))
      .returning();

    return NextResponse.json({
      success: true,
      historyRecord,
      validationPoint: updatedPoint,
    });
  } catch (error) {
    console.error('Error updating validation status:', error);
    return NextResponse.json(
      { error: 'Failed to update validation status' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch status history for a validation point
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const validationPointId = searchParams.get('validationPointId');

    if (!validationPointId) {
      return NextResponse.json(
        { error: 'validationPointId is required' },
        { status: 400 }
      );
    }

    const history = await db
      .select()
      .from(validationStatusHistory)
      .where(eq(validationStatusHistory.validationPointId, validationPointId))
      .orderBy(validationStatusHistory.timestamp);

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching validation status history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status history' },
      { status: 500 }
    );
  }
}
