import { NextRequest, NextResponse } from 'next/server';
import {
  getMonitoringEventById,
  updateMonitoringEventAssessment,
} from '@/db/queries/monitoring';
import { getValidationPointById } from '@/db/queries/thesisSynthesis';
import { db } from '@/db';
import { validationStatusHistory, validationPoints } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/monitoring/events/:eventId/assess
 * Save user assessment of monitoring event
 * Optionally trigger validation point status change
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    // Await params (Next.js 16 requirement)
    const { eventId } = await params;

    // Get event
    const eventData = await getMonitoringEventById(eventId);
    if (!eventData) {
      return NextResponse.json({ error: 'Monitoring event not found' }, { status: 404 });
    }

    const { event, validationPoint } = eventData;

    // Parse request body
    const body = await request.json();
    const {
      userRelevanceScore,
      userAssessmentNotes,
      triggerStatusChange,
      statusUpdate,
    } = body;

    // Validate relevance score
    if (
      userRelevanceScore !== undefined &&
      (userRelevanceScore < 0 || userRelevanceScore > 10)
    ) {
      return NextResponse.json(
        { error: 'User relevance score must be between 0 and 10' },
        { status: 400 }
      );
    }

    let statusHistoryRecord = null;

    // If triggering status change, create validation status history entry
    if (triggerStatusChange && statusUpdate) {
      const { newStatus, evidence, confidence, userActionTaken } = statusUpdate;

      // Validate required fields
      if (!newStatus || !evidence || !confidence) {
        return NextResponse.json(
          { error: 'Status update requires newStatus, evidence, and confidence' },
          { status: 400 }
        );
      }

      // Create status history entry
      const [statusHistory] = await db
        .insert(validationStatusHistory)
        .values({
          validationPointId: validationPoint.id,
          previousStatus: validationPoint.status,
          newStatus,
          evidence,
          confidence,
          assessedBy: 'user',
          userActionRequired: false,
          userActionTaken: userActionTaken || null,
        })
        .returning();

      statusHistoryRecord = statusHistory;

      // Update validation point status
      await db
        .update(validationPoints)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(validationPoints.id, validationPoint.id));
    }

    // Update monitoring event with assessment
    const updatedEvent = await updateMonitoringEventAssessment(eventId, {
      userRelevanceScore,
      userAssessmentNotes,
      triggeredStatusChange: triggerStatusChange || false,
      statusHistoryId: statusHistoryRecord?.id,
    });

    return NextResponse.json({
      success: true,
      event: updatedEvent,
      statusHistory: statusHistoryRecord,
    });
  } catch (error) {
    console.error('Error assessing monitoring event:', error);
    return NextResponse.json(
      {
        error: 'Failed to assess monitoring event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
