import { NextRequest, NextResponse } from "next/server";
import {
  getReconciliation,
  createCheckpoint,
  getCheckpoints,
} from "@/db/queries/reconciliation";
import { logToJournal } from "@/lib/workflow";

export async function GET() {
  try {
    const checkpoints = await getCheckpoints();
    return NextResponse.json(checkpoints);
  } catch (error) {
    console.error("Error fetching checkpoints:", error);
    return NextResponse.json(
      { error: "Failed to fetch checkpoints" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notes } = body as { notes?: string };

    // Get current reconciliation state
    const reconciliationData = await getReconciliation();
    const { summary } = reconciliationData;

    // Create checkpoint
    const checkpoint = await createCheckpoint({
      reconciliationData,
      notes,
    });

    // Log to journal
    await logToJournal({
      objectType: "reconciliation",
      objectId: checkpoint.id,
      objectTitle: `Checkpoint at ${summary.comparisonDate}`,
      actionType: "reconciliation_checkpoint",
      actionDescription: `Reconciliation checkpoint created at ${summary.comparisonDate}. NAV delta: ${summary.navDeltaPct.toFixed(2)}%. ${summary.matchedPositions}/${summary.totalPositions} positions matched. ${summary.acceptedCount} accepted, ${summary.unresolvedCount} unresolved.`,
      newState: {
        comparisonDate: summary.comparisonDate,
        snapshotNav: summary.snapshotNav,
        eventSourcedNav: summary.eventSourcedNav,
        navDeltaPct: summary.navDeltaPct,
        matchedPositions: summary.matchedPositions,
        totalPositions: summary.totalPositions,
        acceptedCount: summary.acceptedCount,
        unresolvedCount: summary.unresolvedCount,
      },
      rationale: notes,
      source: "user",
    });

    return NextResponse.json({ success: true, checkpoint });
  } catch (error) {
    console.error("Error creating checkpoint:", error);
    return NextResponse.json(
      {
        error: "Failed to create checkpoint",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
