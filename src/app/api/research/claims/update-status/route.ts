import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

    if (!status || !['unconfirmed', 'confirmed', 'invalidated', 'merged'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: unconfirmed, confirmed, invalidated, merged' },
        { status: 400 }
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
