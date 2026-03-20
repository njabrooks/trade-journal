import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signalDataSnapshots, claimSignalEvidences } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * PATCH /api/signals/snapshots/[id]/reject
 *
 * Reject a pending signal data snapshot.
 * - Sets signal_data_snapshots.status = 'rejected'
 * - Deletes claim_signal_evidences row if data_source = 'research_routing'
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch the snapshot to check it exists and is pending
    const [snapshot] = await db
      .select({
        id: signalDataSnapshots.id,
        status: signalDataSnapshots.status,
        dataSource: signalDataSnapshots.dataSource,
      })
      .from(signalDataSnapshots)
      .where(eq(signalDataSnapshots.id, id))
      .limit(1);

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    if (snapshot.status === 'rejected') {
      return NextResponse.json({ error: 'Snapshot already rejected' }, { status: 400 });
    }

    // Reject the snapshot
    await db
      .update(signalDataSnapshots)
      .set({ status: 'rejected' })
      .where(eq(signalDataSnapshots.id, id));

    // If research_routing, also remove the claim_signal_evidences link
    if (snapshot.dataSource === 'research_routing') {
      await db
        .delete(claimSignalEvidences)
        .where(eq(claimSignalEvidences.snapshotId, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error rejecting snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to reject snapshot' },
      { status: 500 }
    );
  }
}
