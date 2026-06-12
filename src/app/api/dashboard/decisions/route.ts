import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { isUuid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * "Needs decision" strip (v2 spec §3) — the only inbox-like element.
 * Contract: Claude review jobs (W8 thesis-review / retrospective) write
 * journal entries with action_type='decision_required'; the strip surfaces
 * ACTIVE ones, hard-capped, newest first. Dismissing sets status='dismissed'.
 */
const HARD_CAP = 5;

export async function GET() {
  try {
    const rows = await db
      .select({
        id: journalEntries.id,
        objectType: journalEntries.objectType,
        objectId: journalEntries.objectId,
        objectTitle: journalEntries.objectTitle,
        actionDescription: journalEntries.actionDescription,
        rationale: journalEntries.rationale,
        timestamp: journalEntries.timestamp,
        source: journalEntries.source,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.actionType, 'decision_required'),
          eq(journalEntries.status, 'active')
        )
      )
      .orderBy(desc(journalEntries.timestamp))
      .limit(HARD_CAP);

    return NextResponse.json({ decisions: rows });
  } catch (error) {
    console.error('Error fetching decisions:', error);
    return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };

    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }
    if (status !== 'dismissed' && status !== 'resolved') {
      return NextResponse.json(
        { error: "status must be 'dismissed' or 'resolved'" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(journalEntries)
      .set({ status })
      .where(
        and(
          eq(journalEntries.id, id),
          eq(journalEntries.actionType, 'decision_required')
        )
      )
      .returning({ id: journalEntries.id });

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating decision:', error);
    return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 });
  }
}
