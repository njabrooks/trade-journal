import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Extract fields that can be updated
    const { assetThesisId, macroThesisId, label, description, rationale, status } = body;

    // Build update object with only provided fields
    const updates: any = {};
    
    if (assetThesisId !== undefined) updates.assetThesisId = assetThesisId;
    if (macroThesisId !== undefined) updates.macroThesisId = macroThesisId;
    if (label !== undefined) updates.label = label;
    if (description !== undefined) updates.description = description;
    if (rationale !== undefined) updates.rationale = rationale;
    if (status !== undefined) updates.status = status;

    // Perform the update
    const [updated] = await db
      .update(strategies)
      .set(updates)
      .where(eq(strategies.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, strategy: updated });
  } catch (error) {
    console.error('Strategy update error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [strategy] = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, id))
      .limit(1);

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(strategy);
  } catch (error) {
    console.error('Strategy fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(strategies)
      .where(eq(strategies.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Strategy deleted' });
  } catch (error) {
    console.error('Strategy delete error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

