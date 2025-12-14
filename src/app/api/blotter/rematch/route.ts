import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { matchTriageActionToTradeBlotter } from "@/lib/derived/blotter";

/**
 * Re-run matching for a specific blotter action (QUANTITY_CHANGE or TRADE action)
 * POST /api/blotter/rematch
 * Body: { blotterActionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blotterActionId } = body;

    if (!blotterActionId) {
      return NextResponse.json(
        { error: "blotterActionId is required" },
        { status: 400 }
      );
    }

    // Get the blotter action
    const action = await db
      .select({
        id: blotterActions.id,
        source: blotterActions.source,
        reasonCode: blotterActions.reasonCode,
        actionClass: blotterActions.actionClass,
        actionDetail: blotterActions.actionDetail,
        strategyId: blotterActions.strategyId,
        positionId: blotterActions.positionId,
        ticker: blotterActions.ticker,
        conid: blotterActions.conid,
        actionDate: blotterActions.actionDate,
      })
      .from(blotterActions)
      .where(eq(blotterActions.id, blotterActionId))
      .limit(1);

    if (action.length === 0) {
      return NextResponse.json(
        { error: "Blotter action not found" },
        { status: 404 }
      );
    }

    const a = action[0];

    // Only allow rematching for TRADE actions or QUANTITY_CHANGE actions
    const isValidForRematch =
      (a.source === "triage_action" &&
        (a.actionClass === "TRADE" || a.reasonCode === "QUANTITY_CHANGE")) ||
      a.source === "trade_ingestion";

    if (!isValidForRematch) {
      return NextResponse.json(
        {
          error:
            "Only TRADE actions, QUANTITY_CHANGE actions, or trade ingestion entries can be rematched",
        },
        { status: 400 }
      );
    }

    // Re-run matching
    if (a.source === "triage_action" && a.actionDate) {
      // For triage actions, match to trade entries
      await matchTriageActionToTradeBlotter(
        a.id,
        a.strategyId,
        a.ticker || "",
        a.conid,
        typeof a.actionDate === "string"
          ? a.actionDate
          : a.actionDate.toISOString().split("T")[0]
      );

      return NextResponse.json({
        success: true,
        message: `Re-matched triage action ${blotterActionId} to trade entries`,
        blotterActionId,
      });
    } else if (a.source === "trade_ingestion") {
      // For trade entries, we'd need to call matchTradeBlotterToTriageAction
      // But that's not exported, so we'll just return an error for now
      return NextResponse.json(
        {
          error:
            "Rematching trade ingestion entries is not yet supported. Use the backfill endpoint instead.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to rematch this action type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to rematch blotter action:", error);
    return NextResponse.json(
      {
        error: "Failed to rematch blotter action",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

