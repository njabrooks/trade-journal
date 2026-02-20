import { NextRequest, NextResponse } from "next/server";
import { upsertResolution, getResolution } from "@/db/queries/reconciliation";
import { logToJournal } from "@/lib/workflow";
import type { ResolutionStatus, DiscrepancyNature } from "@/db/schema";

const VALID_ACTIONS = ["accept", "flag", "resolve", "reopen"] as const;
type ResolutionAction = (typeof VALID_ACTIONS)[number];

const ACTION_TO_STATUS: Record<ResolutionAction, ResolutionStatus> = {
  accept: "accepted",
  flag: "flagged",
  resolve: "resolved",
  reopen: "unresolved",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      owner,
      ticker,
      action,
      nature,
      notes,
      discrepancyType,
      qtyDelta,
      mvDelta,
    } = body as {
      owner?: string;
      ticker?: string;
      action?: string;
      nature?: string;
      notes?: string;
      discrepancyType?: string;
      qtyDelta?: number;
      mvDelta?: number;
    };

    // Validate required fields
    if (!owner || !ticker || !action) {
      return NextResponse.json(
        { error: "owner, ticker, and action are required" },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action as ResolutionAction)) {
      return NextResponse.json(
        { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const typedAction = action as ResolutionAction;
    const newStatus = ACTION_TO_STATUS[typedAction];

    // Get previous state for journal logging
    const previous = await getResolution(owner, ticker);
    const previousStatus = previous?.status ?? "unresolved";
    const previousNature = previous?.nature ?? null;

    // Upsert the resolution record
    const resolution = await upsertResolution({
      owner,
      ticker,
      status: newStatus,
      nature: (nature as DiscrepancyNature) ?? null,
      notes: notes ?? null,
      discrepancyType: discrepancyType ?? null,
      qtyDeltaAtAction: qtyDelta ?? null,
      mvDeltaAtAction: mvDelta ?? null,
    });

    // Log to journal for audit trail
    await logToJournal({
      objectType: "reconciliation",
      objectId: resolution.id,
      objectTitle: `${owner} / ${ticker}`,
      actionType: `reconciliation_${typedAction}`,
      actionDescription: buildDescription(typedAction, owner, ticker, nature, notes),
      previousState: {
        status: previousStatus,
        nature: previousNature,
      },
      newState: {
        status: newStatus,
        nature: nature ?? null,
        discrepancyType,
        qtyDelta,
        mvDelta,
      },
      rationale: notes ?? undefined,
      source: "user",
      metadata: { owner, ticker },
    });

    return NextResponse.json({ success: true, resolution });
  } catch (error) {
    console.error("Error updating reconciliation resolution:", error);
    return NextResponse.json(
      {
        error: "Failed to update resolution",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function buildDescription(
  action: ResolutionAction,
  owner: string,
  ticker: string,
  nature?: string,
  notes?: string,
): string {
  const parts = [`User ${action}ed reconciliation discrepancy for ${ticker} (${owner})`];
  if (nature) parts.push(`Nature: ${nature}`);
  if (notes) parts.push(`Notes: ${notes}`);
  return parts.join(". ");
}
