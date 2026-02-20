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

interface BulkItem {
  owner: string;
  ticker: string;
  discrepancyType?: string;
  qtyDelta?: number;
  mvDelta?: number;
}

async function resolveOne(
  item: { owner: string; ticker: string; discrepancyType?: string; qtyDelta?: number; mvDelta?: number },
  typedAction: ResolutionAction,
  newStatus: ResolutionStatus,
  nature?: string,
  notes?: string,
) {
  const previous = await getResolution(item.owner, item.ticker);
  const previousStatus = previous?.status ?? "unresolved";
  const previousNature = previous?.nature ?? null;

  const resolution = await upsertResolution({
    owner: item.owner,
    ticker: item.ticker,
    status: newStatus,
    nature: (nature as DiscrepancyNature) ?? null,
    notes: notes ?? null,
    discrepancyType: item.discrepancyType ?? null,
    qtyDeltaAtAction: item.qtyDelta ?? null,
    mvDeltaAtAction: item.mvDelta ?? null,
  });

  await logToJournal({
    objectType: "reconciliation",
    objectId: resolution.id,
    objectTitle: `${item.owner} / ${item.ticker}`,
    actionType: `reconciliation_${typedAction}`,
    actionDescription: buildDescription(typedAction, item.owner, item.ticker, nature, notes),
    previousState: { status: previousStatus, nature: previousNature },
    newState: {
      status: newStatus,
      nature: nature ?? null,
      discrepancyType: item.discrepancyType,
      qtyDelta: item.qtyDelta,
      mvDelta: item.mvDelta,
    },
    rationale: notes ?? undefined,
    source: "user",
    metadata: { owner: item.owner, ticker: item.ticker },
  });

  return resolution;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, nature, notes } = body as {
      action?: string;
      nature?: string;
      notes?: string;
    };

    if (!action || !VALID_ACTIONS.includes(action as ResolutionAction)) {
      return NextResponse.json(
        { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const typedAction = action as ResolutionAction;
    const newStatus = ACTION_TO_STATUS[typedAction];

    // Bulk mode: items array
    if (body.items && Array.isArray(body.items)) {
      const items = body.items as BulkItem[];
      if (items.length === 0) {
        return NextResponse.json({ error: "items array is empty" }, { status: 400 });
      }
      for (const item of items) {
        if (!item.owner || !item.ticker) {
          return NextResponse.json(
            { error: "each item must have owner and ticker" },
            { status: 400 }
          );
        }
      }

      const results = [];
      for (const item of items) {
        const resolution = await resolveOne(item, typedAction, newStatus, nature, notes);
        results.push(resolution);
      }

      return NextResponse.json({ success: true, count: results.length, resolutions: results });
    }

    // Single mode: owner + ticker on body
    const { owner, ticker, discrepancyType, qtyDelta, mvDelta } = body as {
      owner?: string;
      ticker?: string;
      discrepancyType?: string;
      qtyDelta?: number;
      mvDelta?: number;
    };

    if (!owner || !ticker) {
      return NextResponse.json(
        { error: "owner and ticker are required (or provide items array for bulk)" },
        { status: 400 }
      );
    }

    const resolution = await resolveOne(
      { owner, ticker, discrepancyType, qtyDelta, mvDelta },
      typedAction, newStatus, nature, notes,
    );

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
