import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions, triageRecords, strategies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triageId, actionType, notes, strategyId, positionId, monitorDays } = body;

    if (!triageId || !actionType) {
      return NextResponse.json(
        { error: "triageId and actionType are required" },
        { status: 400 }
      );
    }

    // Get triage record for context
    const triageRecord = await db
      .select()
      .from(triageRecords)
      .where(eq(triageRecords.id, triageId))
      .limit(1);

    if (triageRecord.length === 0) {
      return NextResponse.json({ error: "Triage record not found" }, { status: 404 });
    }

    const triage = triageRecord[0];

    // Generate blotter ID
    const blotterId = `${triage.snapshotDate}_${triage.strategyId ?? "unknown"}_${Date.now()}`;

    // Map action types to action classes
    const actionClassMap: Record<string, string> = {
      TRADE: "TRADE",
      MONITOR: "NOTE_ONLY",
      DISMISS: "NOTE_ONLY",
      UPDATE: "NOTE_ONLY",
      // Legacy action types (for backward compatibility)
      ROLL: "ROLL",
      CLOSE: "CLOSE",
      REDUCE_SIZE: "SIZE_DOWN",
      REVIEW: "NOTE_ONLY",
      MARK_REVIEWED: "NOTE_ONLY",
      CONFIRM_STRATEGY: "OPEN",
      REVIEW_STATE_CODE: "NOTE_ONLY",
      MANAGE_ASSIGNMENT: "DEFENSE",
    };

    const actionClass = actionClassMap[actionType] || "NOTE_ONLY";

    // Determine severity override and expiration based on action type
    let severityOverride: string | null = null;
    let overrideExpiresDate: string | null = null;
    let monitorDaysValue: number | null = null;

    if (actionType === "DISMISS") {
      severityOverride = "info";
      overrideExpiresDate = null; // Permanent
    } else if (actionType === "MONITOR") {
      severityOverride = "monitor";
      const days = monitorDays || 7; // Default 7 days
      monitorDaysValue = days;
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + days);
      overrideExpiresDate = expiresDate.toISOString().split("T")[0];
    } else if (actionType === "TRADE") {
      severityOverride = "pending";
      // Will be updated to 'complete' after trade validation
    } else if (actionType === "UPDATE") {
      // For PROVIDE_STRATEGY_METADATA, only set to 'complete' if all required fields are filled
      if (triage.recommendedAction === "PROVIDE_STRATEGY_METADATA" && triage.strategyId) {
        // Fetch the strategy to check if all required fields are filled
        // Note: Strategy should already be updated by the time this API is called
        const strategyResult = await db
          .select({
            strategyType: strategies.strategyType,
            thesis: strategies.thesis,
            profitRules: strategies.profitRules,
            defenseRules: strategies.defenseRules,
            timeRules: strategies.timeRules,
          })
          .from(strategies)
          .where(eq(strategies.id, triage.strategyId))
          .limit(1);

        const strategy = strategyResult[0];
        if (strategy) {
          // Check if all required fields are filled (not null and not empty string)
          const allFieldsFilled =
            strategy.strategyType &&
            strategy.strategyType.trim() !== "" &&
            strategy.thesis &&
            strategy.thesis.trim() !== "" &&
            strategy.profitRules &&
            strategy.profitRules.trim() !== "" &&
            strategy.defenseRules &&
            strategy.defenseRules.trim() !== "" &&
            strategy.timeRules &&
            strategy.timeRules.trim() !== "";

          if (allFieldsFilled) {
            severityOverride = "complete";
          } else {
            // Don't set override if fields are still missing - let triage recompute handle it
            // This ensures the trigger will remain active until all fields are filled
            severityOverride = null;
          }
        } else {
          // Strategy not found, keep current severity (don't override)
          severityOverride = null;
        }
      } else {
        // For other UPDATE actions (like CONFIRM_STRATEGIES), set to 'complete'
        severityOverride = "complete";
      }
    }

    // Create blotter action
    await db.insert(blotterActions).values({
      blotterId,
      actionDate: new Date().toISOString().split("T")[0],
      snapshotDate: triage.snapshotDate,
      strategyId: strategyId || triage.strategyId,
      positionId: positionId || triage.positionId,
      strategyKey: triage.symbol,
      triageFlagAtAction: triage.recommendedAction,
      actionClass,
      actionDetail: actionType,
      reasonCode: triage.recommendedAction || null,
      notes: notes || triage.notes || null,
      completed: actionType === "UPDATE" || actionType === "MARK_REVIEWED",
      severityOverride,
      overrideExpiresDate,
      monitorDays: monitorDaysValue,
      createdAt: new Date(),
    });

    // Update triage record severity immediately for actions with overrides
    // This provides immediate feedback to the user
    // Note: For PROVIDE_STRATEGY_METADATA, only update if all fields are filled (severityOverride = 'complete')
    // Otherwise, severityOverride will be null and we won't update, keeping the trigger active
    if (severityOverride && (actionType === "MONITOR" || actionType === "DISMISS" || actionType === "TRADE" || actionType === "UPDATE")) {
      await db
        .update(triageRecords)
        .set({
          severity: severityOverride,
          updatedAt: new Date(),
        })
        .where(eq(triageRecords.id, triageId));
    }

    return NextResponse.json({
      success: true,
      message: "Action recorded in blotter",
      blotterId,
    });
  } catch (error) {
    console.error("Error recording triage action:", error);
    return NextResponse.json(
      {
        error: "Failed to record action",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

