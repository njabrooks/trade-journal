import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Manually link two blotter actions together
 * POST /api/blotter/link
 * Body: { action1Id: string, action2Id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action1Id, action2Id } = body;

    if (!action1Id || !action2Id) {
      return NextResponse.json(
        { error: "action1Id and action2Id are required" },
        { status: 400 }
      );
    }

    if (action1Id === action2Id) {
      return NextResponse.json(
        { error: "Cannot link an action to itself" },
        { status: 400 }
      );
    }

    // Verify both actions exist and get their details
    const [action1, action2] = await Promise.all([
      db
        .select({
          id: blotterActions.id,
          source: blotterActions.source,
          actionClass: blotterActions.actionClass,
          reasonCode: blotterActions.reasonCode,
        })
        .from(blotterActions)
        .where(eq(blotterActions.id, action1Id))
        .limit(1),
      db
        .select({
          id: blotterActions.id,
          source: blotterActions.source,
          actionClass: blotterActions.actionClass,
          reasonCode: blotterActions.reasonCode,
        })
        .from(blotterActions)
        .where(eq(blotterActions.id, action2Id))
        .limit(1),
    ]);

    if (action1.length === 0 || action2.length === 0) {
      return NextResponse.json(
        { error: "One or both blotter actions not found" },
        { status: 404 }
      );
    }

    const a1 = action1[0];
    const a2 = action2[0];

    // Enforce matching restrictions:
    // Only allow: trade_ingestion ↔ triage_action (where actionClass = 'TRADE' OR reasonCode = 'QUANTITY_CHANGE')
    // Do NOT allow: trade_ingestion ↔ trade_ingestion, triage_action ↔ triage_action, or other triage action types

    // Check if both are same source (not allowed)
    if (a1.source === a2.source) {
      return NextResponse.json(
        {
          error: "Cannot link entries from the same source. Only trade ingestion entries can be linked to TRADE or QUANTITY_CHANGE triage actions.",
        },
        { status: 400 }
      );
    }

    // Determine which is the triage action and which is the trade
    const triageAction = a1.source === "triage_action" ? a1 : a2;
    const tradeAction = a1.source === "trade_ingestion" ? a1 : a2;

    // Validate that the triage action is a valid type for matching
    const isValidTriageAction =
      triageAction.actionClass === "TRADE" ||
      triageAction.reasonCode === "QUANTITY_CHANGE";

    if (!isValidTriageAction) {
      return NextResponse.json(
        {
          error: "Only TRADE actions and QUANTITY_CHANGE actions can be linked to trade ingestion entries.",
        },
        { status: 400 }
      );
    }

    // Handle triage action + trade action linking
    // Check if triage action is QUANTITY_CHANGE (needs multi-link support)
    const triageActionFull = await db
      .select({
        id: blotterActions.id,
        reasonCode: blotterActions.reasonCode,
        linkedBlotterActionId: blotterActions.linkedBlotterActionId,
        linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
      })
      .from(blotterActions)
      .where(eq(blotterActions.id, triageAction.id))
      .limit(1);

    const isQuantityChange = triageActionFull[0]?.reasonCode === "QUANTITY_CHANGE";

    if (isQuantityChange) {
      // For QUANTITY_CHANGE, add to linkedTradeBlotterIds array
      const existingLinkedIds =
        (triageActionFull[0]?.linkedTradeBlotterIds as string[] | null) || [];
      
      if (!existingLinkedIds.includes(tradeAction.id)) {
        const allLinkedIds = [...existingLinkedIds, tradeAction.id];

        await db.transaction(async (tx) => {
          // Update QUANTITY_CHANGE with all linked trades
          await tx
            .update(blotterActions)
            .set({
              linkedTradeBlotterIds: allLinkedIds,
              // Set primary link if not already set
              linkedBlotterActionId:
                triageActionFull[0]?.linkedBlotterActionId || tradeAction.id,
              updatedAt: sql`now()`,
            })
            .where(eq(blotterActions.id, triageAction.id));

          // Link trade back to QUANTITY_CHANGE
          await tx
            .update(blotterActions)
            .set({
              linkedBlotterActionId: triageAction.id,
              updatedAt: sql`now()`,
            })
            .where(eq(blotterActions.id, tradeAction.id));
        });
      }
    } else {
      // Simple bidirectional link for TRADE actions
      await db.transaction(async (tx) => {
        await tx
          .update(blotterActions)
          .set({
            linkedBlotterActionId: tradeAction.id,
            updatedAt: sql`now()`,
          })
          .where(eq(blotterActions.id, triageAction.id));

        await tx
          .update(blotterActions)
          .set({
            linkedBlotterActionId: triageAction.id,
            updatedAt: sql`now()`,
          })
          .where(eq(blotterActions.id, tradeAction.id));
      });
    }

    return NextResponse.json({
      success: true,
      message: "Blotter actions linked successfully",
    });
  } catch (error) {
    console.error("Failed to link blotter actions:", error);
    return NextResponse.json(
      {
        error: "Failed to link blotter actions",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Unlink two blotter actions
 * DELETE /api/blotter/link
 * Body: { action1Id: string, action2Id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { action1Id, action2Id } = body;

    if (!action1Id || !action2Id) {
      return NextResponse.json(
        { error: "action1Id and action2Id are required" },
        { status: 400 }
      );
    }

    // Get both actions to check their current links
    const [action1, action2] = await Promise.all([
      db
        .select({
          id: blotterActions.id,
          source: blotterActions.source,
          linkedBlotterActionId: blotterActions.linkedBlotterActionId,
          linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
          reasonCode: blotterActions.reasonCode,
        })
        .from(blotterActions)
        .where(eq(blotterActions.id, action1Id))
        .limit(1),
      db
        .select({
          id: blotterActions.id,
          source: blotterActions.source,
          linkedBlotterActionId: blotterActions.linkedBlotterActionId,
          linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
          reasonCode: blotterActions.reasonCode,
        })
        .from(blotterActions)
        .where(eq(blotterActions.id, action2Id))
        .limit(1),
    ]);

    if (action1.length === 0 || action2.length === 0) {
      return NextResponse.json(
        { error: "One or both blotter actions not found" },
        { status: 404 }
      );
    }

    const a1 = action1[0];
    const a2 = action2[0];

    // Determine which is the QUANTITY_CHANGE (if any) and which is the trade
    const qcAction = a1.reasonCode === "QUANTITY_CHANGE" ? a1 : a2.reasonCode === "QUANTITY_CHANGE" ? a2 : null;
    const tradeAction = a1.source === "trade_ingestion" ? a1 : a2.source === "trade_ingestion" ? a2 : null;

    await db.transaction(async (tx) => {
      // Handle QUANTITY_CHANGE multi-link removal
      if (qcAction && qcAction.linkedTradeBlotterIds) {
        const linkedIds = qcAction.linkedTradeBlotterIds as string[];
        const tradeId = tradeAction?.id || (qcAction.id === a1.id ? action2Id : action1Id);
        const updatedIds = linkedIds.filter((id) => id !== tradeId);

        await tx
          .update(blotterActions)
          .set({
            linkedTradeBlotterIds: updatedIds.length > 0 ? updatedIds : null,
            // Clear primary link if it was the one being removed
            linkedBlotterActionId:
              qcAction.linkedBlotterActionId === tradeId ? null : qcAction.linkedBlotterActionId,
            updatedAt: sql`now()`,
          })
          .where(eq(blotterActions.id, qcAction.id));

        // Unlink the trade from QUANTITY_CHANGE
        if (tradeAction) {
          await tx
            .update(blotterActions)
            .set({
              linkedBlotterActionId: tradeAction.linkedBlotterActionId === qcAction.id ? null : tradeAction.linkedBlotterActionId,
              updatedAt: sql`now()`,
            })
            .where(eq(blotterActions.id, tradeAction.id));
        }
      } else {
        // Simple bidirectional unlink for TRADE actions
        await tx
          .update(blotterActions)
          .set({
            linkedBlotterActionId: a1.linkedBlotterActionId === action2Id ? null : a1.linkedBlotterActionId,
            updatedAt: sql`now()`,
          })
          .where(eq(blotterActions.id, action1Id));

        await tx
          .update(blotterActions)
          .set({
            linkedBlotterActionId: a2.linkedBlotterActionId === action1Id ? null : a2.linkedBlotterActionId,
            updatedAt: sql`now()`,
          })
          .where(eq(blotterActions.id, action2Id));
      }
    });

    return NextResponse.json({
      success: true,
      message: "Blotter actions unlinked successfully",
    });
  } catch (error) {
    console.error("Failed to unlink blotter actions:", error);
    return NextResponse.json(
      {
        error: "Failed to unlink blotter actions",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
