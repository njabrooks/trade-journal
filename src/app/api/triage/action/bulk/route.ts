import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions, triageRecords, strategies, positions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { matchTriageActionToTradeBlotter } from "@/lib/derived/blotter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triageIds, actionType, notes, monitorDays, tradeReason, tradeStage } = body;

    if (!triageIds || !Array.isArray(triageIds) || triageIds.length === 0) {
      return NextResponse.json(
        { error: "triageIds array is required" },
        { status: 400 }
      );
    }

    if (!actionType) {
      return NextResponse.json(
        { error: "actionType is required" },
        { status: 400 }
      );
    }

    // Fetch all triage records
    const triageRecordsList = await db
      .select()
      .from(triageRecords)
      .where(inArray(triageRecords.id, triageIds));

    if (triageRecordsList.length !== triageIds.length) {
      return NextResponse.json(
        { error: "Some triage records not found" },
        { status: 404 }
      );
    }

    // Validate all records have the same trigger type
    const triggerTypes = new Set(
      triageRecordsList.map((t) => t.recommendedAction).filter(Boolean)
    );
    if (triggerTypes.size > 1) {
      return NextResponse.json(
        { error: "All selected records must have the same trigger type" },
        { status: 400 }
      );
    }

    // Map action types to action classes
    const actionClassMap: Record<string, string> = {
      TRADE: "TRADE",
      MONITOR: "NOTE_ONLY",
      DISMISS: "NOTE_ONLY",
      UPDATE: "NOTE_ONLY",
    };

    const actionClass = actionClassMap[actionType] || "NOTE_ONLY";

    // Determine severity override and expiration based on action type
    let severityOverride: string | null = null;
    let overrideExpiresDate: string | null = null;
    let monitorDaysValue: number | null = null;

    if (actionType === "DISMISS") {
      severityOverride = "info";
      overrideExpiresDate = null;
    } else if (actionType === "MONITOR") {
      severityOverride = "monitor";
      const days = monitorDays || 7;
      monitorDaysValue = days;
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + days);
      overrideExpiresDate = expiresDate.toISOString().split("T")[0];
    } else if (actionType === "TRADE") {
      severityOverride = "pending";
    } else if (actionType === "UPDATE") {
      const commonTrigger = Array.from(triggerTypes)[0];
      if (commonTrigger === "CONFIRM_STRATEGIES") {
        severityOverride = "complete";
      } else if (commonTrigger === "QUANTITY_CHANGE") {
        // For QUANTITY_CHANGE, set to 'complete' when trade reason and stage are provided
        if (tradeReason && tradeStage) {
          severityOverride = "complete";
        } else {
          // Don't set override if required fields are missing
          severityOverride = null;
        }
      }
      // For PROVIDE_STRATEGY_METADATA, we'd need more data, so we'll leave severityOverride as null
    }

    // Process each triage record
    const results = [];
    const errors = [];

    for (const triage of triageRecordsList) {
      try {
        // Generate blotter ID
        const blotterId = `${triage.snapshotDate}_${triage.strategyId ?? "unknown"}_${Date.now()}_${triage.id.slice(0, 8)}`;

        // Resolve identifiers for matching
        let conid: number | null = null;
        let ticker: string | null = triage.symbol ?? null;

        // From explicit position
        if (triage.positionId) {
          const position = await db
            .select({
              conid: positions.conid,
              symbol: positions.symbol,
            })
            .from(positions)
            .where(eq(positions.id, triage.positionId))
            .limit(1);
          if (position.length > 0) {
            conid = position[0].conid ?? conid;
            ticker = ticker ?? position[0].symbol ?? ticker;
          }
        }

        // Fallback: latest position for the strategy
        if ((!conid || !ticker) && triage.strategyId) {
          const latestPosition = await db
            .select({
              conid: positions.conid,
              symbol: positions.symbol,
            })
            .from(positions)
            .where(eq(positions.strategyId, triage.strategyId))
            .limit(1);
          if (latestPosition.length > 0) {
            conid = conid ?? latestPosition[0].conid;
            ticker = ticker ?? latestPosition[0].symbol ?? ticker;
          }
        }

        // Create blotter action
        const [insertedBlotterAction] = await db
          .insert(blotterActions)
          .values({
            blotterId,
            actionDate: triage.snapshotDate,
            snapshotDate: triage.snapshotDate,
            strategyId: triage.strategyId,
            positionId: triage.positionId,
            strategyKey: triage.symbol,
            ticker: ticker,
            triageFlagAtAction: triage.recommendedAction,
            actionClass,
            actionDetail: actionType,
            reasonCode: triage.recommendedAction || null,
            notes: notes || triage.notes || null,
            completed: actionType === "UPDATE",
            severityOverride,
            overrideExpiresDate,
            monitorDays: monitorDaysValue,
            tradeReason: tradeReason || null, // Store trade reason for QUANTITY_CHANGE triggers
            tradeStage: tradeStage || null, // Store trade stage for QUANTITY_CHANGE triggers
            source: "triage_action",
            conid: conid ?? null,
            createdAt: new Date(),
          })
          .returning({ id: blotterActions.id });

        // Attempt to match with existing trade blotter entry
        if (
          insertedBlotterAction &&
          (actionType === "TRADE" || triage.recommendedAction === "QUANTITY_CHANGE")
        ) {
          try {
            await matchTriageActionToTradeBlotter(
              insertedBlotterAction.id,
              triage.strategyId,
              ticker ?? triage.symbol,
              conid,
              triage.snapshotDate
            );
          } catch (error) {
            console.error(
              `Failed to match triage action ${triage.id} to trade blotter:`,
              error
            );
            // Continue - matching is optional
          }
        }

        // Update triage record severity
        if (severityOverride && (actionType === "MONITOR" || actionType === "DISMISS" || actionType === "TRADE" || actionType === "UPDATE")) {
          await db
            .update(triageRecords)
            .set({
              severity: severityOverride,
              updatedAt: new Date(),
            })
            .where(eq(triageRecords.id, triage.id));
        }

        results.push({ triageId: triage.id, success: true });
      } catch (error) {
        console.error(`Error processing triage record ${triage.id}:`, error);
        errors.push({
          triageId: triage.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      errors: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error processing bulk triage action:", error);
    return NextResponse.json(
      {
        error: "Failed to process bulk action",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

