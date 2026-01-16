import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId, status } = body;

    if (!claimId || typeof claimId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid claimId provided' },
        { status: 400 }
      );
    }

    if (!status || !['draft', 'active', 'complete', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: draft, active, complete, rejected' },
        { status: 400 }
      );
    }

    // Fetch existing claim for logging
    const [existing] = await db
      .select({ id: mainClaims.id, claim: mainClaims.claim, status: mainClaims.status })
      .from(mainClaims)
      .where(eq(mainClaims.id, claimId));

    if (!existing) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    // Update the status
    await db
      .update(mainClaims)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(mainClaims.id, claimId));

    // Log to journal
    await logToJournal({
      objectType: 'claim',
      objectId: claimId,
      objectTitle: existing.claim?.slice(0, 100),
      actionType: 'CLAIM_STATUS_CHANGED',
      actionDescription: `Changed claim status from ${existing.status} to ${status}`,
      previousState: { status: existing.status },
      newState: { status },
      source: 'user',
    });

    return NextResponse.json(
      { success: true, message: 'Claim status updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating claim status:', error);
    return NextResponse.json(
      { error: 'Failed to update claim status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
