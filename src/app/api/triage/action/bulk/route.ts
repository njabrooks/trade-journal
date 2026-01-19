import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { triageRecords, strategies, positions, underlyings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logToJournal } from "@/lib/workflow";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triageIds, actionType, notes, monitorDays, tradeReason, tradeStage, tradePositions } = body;

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

    // Get common trigger type (used for logic decisions)
    const commonTrigger = Array.from(triggerTypes)[0];

    // Determine triage record updates based on action type
    // Override fields (overrideSource, overrideExpiresDate, overrideAt) persist across triage recomputes
    let triageStatusUpdate: string | null = null;
    let triageSeverityUpdate: string | null = null;
    let overrideSource: string | null = null;
    let overrideExpiresDate: string | null = null;
    let monitorDaysValue: number | null = null;

    if (actionType === "DISMISS") {
      triageStatusUpdate = "done";
      triageSeverityUpdate = "info";
      overrideSource = "user_dismiss";
      overrideExpiresDate = null;
    } else if (actionType === "MONITOR") {
      triageStatusUpdate = "in_progress";
      triageSeverityUpdate = "monitor";
      overrideSource = "user_monitor";
      const days = monitorDays || 7;
      monitorDaysValue = days;
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + days);
      overrideExpiresDate = expiresDate.toISOString().split("T")[0];
    } else if (actionType === "TRADE") {
      // For QUANTITY_CHANGE or TRADE_INGESTION triggers with trade metadata captured, mark as done
      const isTradeMetadataTrigger = commonTrigger === "QUANTITY_CHANGE" || commonTrigger === "TRADE_INGESTION";
      if (isTradeMetadataTrigger && tradeReason && tradeStage) {
        triageStatusUpdate = "done";
      } else {
        triageStatusUpdate = "in_progress";
      }
    } else if (actionType === "UPDATE") {
      if (commonTrigger === "CONFIRM_STRATEGIES") {
        triageStatusUpdate = "done";
      }
    }

    // Handle TRADE action with multiple positions
    const needsTradeActions = actionType === "TRADE" && tradePositions;

    if (needsTradeActions) {
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

      // Process each triage record
      const results = [];
      const errors = [];

      for (const triage of triageRecordsList) {
        try {
          const previousSeverity = triage.severity;

          // Fetch strategy key for journal context
          let strategyKey: string | null = null;
          if (triage.strategyId) {
            const strategyResult = await db
              .select({ strategyKey: strategies.strategyKey })
              .from(strategies)
              .where(eq(strategies.id, triage.strategyId))
              .limit(1);
            strategyKey = strategyResult[0]?.strategyKey ?? null;
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
            .where(eq(triageRecords.id, triage.id));

          // Log to journal for unified audit trail
          await logToJournal({
            objectType: 'strategy',
            objectId: triage.strategyId || triage.id,
            objectTitle: strategyKey || triage.symbol || 'Unknown Strategy',
            actionType: 'triage_trade_action',
            actionDescription: `User recorded bulk TRADE action for ${triage.recommendedAction || 'triage'} trigger. ${tradePositions.length} position(s) affected.`,
            triageRecordId: triage.id,
            previousState: {
              severity: previousSeverity,
              status: triage.status,
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
              bulkAction: true,
              tradePositions: positionDetails,
            },
          });

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
        errorCount: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // Process non-TRADE actions (DISMISS, MONITOR, UPDATE)
    const results = [];
    const errors = [];

    for (const triage of triageRecordsList) {
      try {
        const previousSeverity = triage.severity;

        // Fetch strategy key for journal context
        let strategyKey: string | null = null;
        if (triage.strategyId) {
          const strategyResult = await db
            .select({ strategyKey: strategies.strategyKey })
            .from(strategies)
            .where(eq(strategies.id, triage.strategyId))
            .limit(1);
          strategyKey = strategyResult[0]?.strategyKey ?? null;
        }

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
          .where(eq(triageRecords.id, triage.id));

        // Log to journal for unified audit trail
        const actionTypeMap: Record<string, string> = {
          TRADE: 'triage_trade_action',
          MONITOR: 'triage_monitored',
          DISMISS: 'triage_dismissed',
          UPDATE: 'triage_updated',
        };

        await logToJournal({
          objectType: triage.strategyId ? 'strategy' : 'position',
          objectId: triage.strategyId || triage.positionId || triage.id,
          objectTitle: strategyKey || triage.symbol || 'Unknown',
          actionType: actionTypeMap[actionType] || 'triage_action',
          actionDescription: `User ${actionType.toLowerCase()} bulk triage: ${triage.recommendedAction || 'general'}${notes ? `. Notes: ${notes}` : ''}`,
          triageRecordId: triage.id,
          previousState: {
            severity: previousSeverity,
            status: triage.status,
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
            bulkAction: true,
            positionId: triage.positionId,
            strategyId: triage.strategyId,
          },
        });

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
      errorCount: errors.length,
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
