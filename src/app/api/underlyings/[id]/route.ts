import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { parentUnderlyingId } = body;

    // Only parentUnderlyingId is supported for now
    if (parentUnderlyingId === undefined) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Prevent self-referential parent
    if (parentUnderlyingId === id) {
      return NextResponse.json(
        { error: 'An underlying cannot be its own parent' },
        { status: 400 }
      );
    }

    // If setting a parent, validate it exists and isn't circular
    if (parentUnderlyingId !== null) {
      const [parent] = await db
        .select({ id: underlyings.id, parentUnderlyingId: underlyings.parentUnderlyingId })
        .from(underlyings)
        .where(eq(underlyings.id, parentUnderlyingId))
        .limit(1);

      if (!parent) {
        return NextResponse.json(
          { error: 'Parent underlying not found' },
          { status: 404 }
        );
      }

      // Prevent circular: if the proposed parent already has this underlying as its parent
      if (parent.parentUnderlyingId === id) {
        return NextResponse.json(
          { error: 'Circular reference: the selected parent already lists this underlying as its parent' },
          { status: 400 }
        );
      }
    }

    const [updated] = await db
      .update(underlyings)
      .set({ parentUnderlyingId, updatedAt: new Date() })
      .where(eq(underlyings.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Underlying not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, underlying: updated });
  } catch (error) {
    console.error('Underlying update error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update underlying',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
