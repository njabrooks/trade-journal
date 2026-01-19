import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { triageRecords, strategies, positions, underlyings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logToJournal } from "@/lib/workflow";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triageId, actionType, notes, strategyId, positionId, monitorDays, tradeReason, tradeStage, tradePositions } = body;

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

    // Fetch strategy key for journal context
    let strategyKey: string | null = null;
    if (strategyId || triage.strategyId) {
      const strategyResult = await db
        .select({ strategyKey: strategies.strategyKey })
        .from(strategies)
        .where(eq(strategies.id, strategyId || triage.strategyId!))
        .limit(1);
      strategyKey = strategyResult[0]?.strategyKey ?? null;
    }

    const previousSeverity = triage.severity;
    const previousStatus = triage.status;

    // Determine triage record updates based on action type
    // Note: Triage records have separate status (workflow) and severity (importance) fields
    // Override fields (overrideSource, overrideExpiresDate, overrideAt) persist across triage recomputes
    let triageStatusUpdate: string | null = null;  // Status for triage record
    let triageSeverityUpdate: string | null = null;  // Severity for triage record (only for overrides)
    let overrideSource: string | null = null;  // 'user_dismiss' | 'user_monitor' | null
    let overrideExpiresDate: string | null = null;
    let monitorDaysValue: number | null = null;

    if (actionType === "DISMISS") {
      // Dismiss: mark as done, override severity to 'info'
      triageStatusUpdate = "done";
      triageSeverityUpdate = "info";
      overrideSource = "user_dismiss";  // Persists across triage recomputes
      overrideExpiresDate = null; // Permanent
    } else if (actionType === "MONITOR") {
      // Monitor: keep in_progress, override severity to 'monitor'
      triageStatusUpdate = "in_progress";
      triageSeverityUpdate = "monitor";
      overrideSource = "user_monitor";  // Persists across triage recomputes
      const days = monitorDays || 7; // Default 7 days
      monitorDaysValue = days;
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + days);
      overrideExpiresDate = expiresDate.toISOString().split("T")[0];
    } else if (actionType === "TRADE") {
      // Trade: mark workflow status
      // For QUANTITY_CHANGE or TRADE_INGESTION triggers with trade metadata captured, mark as done
      const isTradeMetadataTrigger = triage.recommendedAction === "QUANTITY_CHANGE" || triage.recommendedAction === "TRADE_INGESTION";
      if (isTradeMetadataTrigger && tradeReason && tradeStage) {
        // Trade metadata captured - mark as done
        triageStatusUpdate = "done";
      } else {
        // Trade action in progress - will be completed when quantity change detected
        triageStatusUpdate = "in_progress";
      }
    } else if (actionType === "UPDATE") {
      // Update actions (like CONFIRM_STRATEGY) - mark as done
      triageStatusUpdate = "done";
    }

    // Handle TRADE action with multiple positions
    // Trade actions are recorded in the journal and update triage record status
    if (actionType === "TRADE" && tradePositions) {
      if (!tradePositions || !Array.isArray(tradePositions) || tradePositions.length === 0) {
        return NextResponse.json(
          { error: "tradePositions array is required for TRADE action" },
          { status: 400 }
        );
      }

      if (!tradeReason || !tradeStage) {
        return NextResponse.json(
          { error: "tradeReason and tradeStage are required for TRADE action" },
          { status: 400 }
        );
      }

      // Collect position details for journal metadata
      const positionDetails = [];
      for (const tradePosition of tradePositions) {
        const positionResult = await db
          .select({
            conid: positions.conid,
            symbol: positions.symbol,
            assetClass: positions.assetClass,
            quantity: positions.quantity,
            expiry: positions.expiry,
            strike: positions.strike,
            optionRight: positions.optionRight,
            underlyingId: positions.underlyingId,
          })
          .from(positions)
          .where(eq(positions.id, tradePosition.positionId))
          .limit(1);

        if (positionResult.length === 0) {
          console.error(`Position ${tradePosition.positionId} not found`);
          return NextResponse.json(
            { error: `Position ${tradePosition.positionId} not found` },
            { status: 400 }
          );
        }

        const position = positionResult[0];

        // Fetch underlying symbol if needed (for options)
        let underlyingSymbol: string | null = null;
        if (position.assetClass !== 'STK' && position.underlyingId) {
          const underlyingResult = await db
            .select({ ticker: underlyings.ticker })
            .from(underlyings)
            .where(eq(underlyings.id, position.underlyingId))
            .limit(1);
          underlyingSymbol = underlyingResult[0]?.ticker ?? null;
        } else if (position.assetClass === 'STK') {
          underlyingSymbol = position.symbol;
        }

        positionDetails.push({
          positionId: tradePosition.positionId,
          quantity: tradePosition.quantity,
          symbol: position.symbol,
          underlying: underlyingSymbol || position.symbol,
          assetClass: position.assetClass,
          expiry: position.expiry,
          strike: position.strike,
          optionRight: position.optionRight,
        });
      }

      // Update triage record status
      const triageUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (triageStatusUpdate) {
        triageUpdate.status = triageStatusUpdate;
      }
      if (triageSeverityUpdate) {
        triageUpdate.severity = triageSeverityUpdate;
      }
      await db
        .update(triageRecords)
        .set(triageUpdate)
        .where(eq(triageRecords.id, triageId));

      // Log to journal for unified audit trail
      await logToJournal({
        objectType: 'strategy',
        objectId: strategyId || triage.strategyId || triageId,
        objectTitle: strategyKey || triage.symbol || 'Unknown Strategy',
        actionType: 'triage_trade_action',
        actionDescription: `User recorded TRADE action for ${triage.recommendedAction || 'triage'} trigger. ${tradePositions.length} position(s) affected.`,
        triageRecordId: triageId,
        previousState: {
          severity: previousSeverity,
          status: previousStatus,
          recommendedAction: triage.recommendedAction,
        },
        newState: {
          severity: triageSeverityUpdate || previousSeverity,
          status: triageStatusUpdate,
          actionType: actionType,
          tradeReason,
          tradeStage,
          positionsCount: tradePositions.length,
        },
        rationale: notes || undefined,
        source: 'user',
        metadata: {
          tradePositions: positionDetails,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Trade action recorded",
        positionsAffected: positionDetails.length,
      });
    }

    // Handle non-TRADE actions (DISMISS, MONITOR, UPDATE)
    // Update triage record with status, severity, and override fields
    const triageUpdateNonTrade: Record<string, unknown> = { updatedAt: new Date() };
    if (triageStatusUpdate) {
      triageUpdateNonTrade.status = triageStatusUpdate;
    }
    if (triageSeverityUpdate) {
      triageUpdateNonTrade.severity = triageSeverityUpdate;
    }
    // Set override fields for DISMISS/MONITOR actions (persists across triage recomputes)
    if (overrideSource) {
      triageUpdateNonTrade.overrideSource = overrideSource;
      triageUpdateNonTrade.overrideExpiresDate = overrideExpiresDate;
      triageUpdateNonTrade.overrideAt = new Date();
    }

    await db
      .update(triageRecords)
      .set(triageUpdateNonTrade)
      .where(eq(triageRecords.id, triageId));

    // Log to journal for unified audit trail
    const actionTypeMap: Record<string, string> = {
      TRADE: 'triage_trade_action',
      MONITOR: 'triage_monitored',
      DISMISS: 'triage_dismissed',
      UPDATE: 'triage_updated',
      ROLL: 'triage_roll_action',
      CLOSE: 'triage_close_action',
      REDUCE_SIZE: 'triage_size_action',
      REVIEW: 'triage_reviewed',
      MARK_REVIEWED: 'triage_reviewed',
      CONFIRM_STRATEGY: 'triage_strategy_confirmed',
      REVIEW_STATE_CODE: 'triage_state_code_reviewed',
      MANAGE_ASSIGNMENT: 'triage_assignment_managed',
    };

    await logToJournal({
      objectType: triage.strategyId ? 'strategy' : 'position',
      objectId: triage.strategyId || triage.positionId || triageId,
      objectTitle: strategyKey || triage.symbol || 'Unknown',
      actionType: actionTypeMap[actionType] || 'triage_action',
      actionDescription: `User ${actionType.toLowerCase().replace('_', ' ')} triage: ${triage.recommendedAction || 'general'}${notes ? `. Notes: ${notes}` : ''}`,
      triageRecordId: triageId,
      previousState: {
        severity: previousSeverity,
        status: previousStatus,
        recommendedAction: triage.recommendedAction,
      },
      newState: {
        severity: triageSeverityUpdate || previousSeverity,
        status: triageStatusUpdate,
        actionType: actionType,
        overrideSource,
        monitorDays: monitorDaysValue,
        overrideExpiresDate,
      },
      rationale: notes || undefined,
      source: 'user',
      metadata: {
        positionId: positionId || triage.positionId,
        strategyId: strategyId || triage.strategyId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Action recorded",
      triageId,
    });
  } catch (error) {
    console.error("Error recording triage action:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error stack:", errorStack);
    return NextResponse.json(
      {
        error: "Failed to record action",
        message: errorMessage,
        details: errorStack, // Include stack trace in development
      },
      { status: 500 }
    );
  }
}

