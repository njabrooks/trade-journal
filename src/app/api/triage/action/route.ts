import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions, triageRecords, strategies, positions, underlyings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { matchTriageActionToTradeBlotter } from "@/lib/derived/blotter";

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
      // Will be updated to 'complete' after trade validation via quantity change detection
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
      } else if (triage.recommendedAction === "QUANTITY_CHANGE" && actionType === "TRADE") {
        // For QUANTITY_CHANGE with TRADE action, set to 'complete' when trade reason and stage are provided
        if (tradeReason && tradeStage) {
          severityOverride = "complete";
        } else {
          // Don't set override if required fields are missing
          severityOverride = null;
        }
      } else if (actionType === "UPDATE") {
        // For other UPDATE actions (like CONFIRM_STRATEGIES), set to 'complete'
        severityOverride = "complete";
      }
    }

    // Handle TRADE action with multiple positions
    // Also handle QUANTITY_CHANGE TRADE action with tradePositions (creates Trade Actions)
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

      // For QUANTITY_CHANGE with TRADE action, create Trade Actions (actionClass='TRADE', actionDetail='TRADE')
      // For regular TRADE action, also create Trade Actions
      const isQuantityChange = triage.recommendedAction === "QUANTITY_CHANGE";
      
      // For QUANTITY_CHANGE, always use TRADE action class/detail
      const finalActionClass = isQuantityChange ? "TRADE" : actionClass;
      const finalActionDetail = isQuantityChange ? "TRADE" : actionType;

      // Determine actionDate based on triage type
      let actionDate: string;
      if (triage.recommendedAction === 'QUANTITY_CHANGE') {
        // For QUANTITY_CHANGE, use snapshotDate directly (matches trade date)
        if (!triage.snapshotDate) {
          return NextResponse.json(
            { error: "Triage record missing snapshotDate" },
            { status: 400 }
          );
        }
        actionDate = typeof triage.snapshotDate === 'string' 
          ? triage.snapshotDate 
          : triage.snapshotDate.toISOString().split('T')[0];
      } else {
        // For other actions, snapshotDate + 1 day (intended for next day's trades)
        if (!triage.snapshotDate) {
          return NextResponse.json(
            { error: "Triage record missing snapshotDate" },
            { status: 400 }
          );
        }
            const date = new Date(triage.snapshotDate);
            date.setDate(date.getDate() + 1);
        actionDate = date.toISOString().split('T')[0];
      }

      const insertedBlotterActions = [];

      // Create one blotter entry per position
      for (const tradePosition of tradePositions) {
        // Fetch position data
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

        if (!position.conid) {
          console.error(`Position ${tradePosition.positionId} missing conid`);
          return NextResponse.json(
            { error: `Position ${tradePosition.positionId} missing conid` },
            { status: 400 }
          );
        }

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
          // For stocks, symbol is the underlying
          underlyingSymbol = position.symbol;
        }

        // Build trade details JSON
        const tradeDetails = {
          assetClass: position.assetClass,
          quantity: tradePosition.quantity, // User-edited quantity (signed)
          underlying: underlyingSymbol || position.symbol,
          expiry: position.expiry,
          strike: position.strike,
          optionRight: position.optionRight, // 'C' or 'P'
        };

        const notesJson = JSON.stringify({
          text: notes || triage.notes || null,
          tradeDetails,
        });

        const blotterId = `${actionDate}_${strategyId || triage.strategyId}_${position.conid}_${Date.now()}`;

        // Create blotter entry
        const [inserted] = await db
          .insert(blotterActions)
          .values({
            blotterId,
            actionDate: actionDate,
            snapshotDate: triage.snapshotDate,
            strategyId: strategyId || triage.strategyId,
            positionId: tradePosition.positionId,
            strategyKey: triage.symbol,
            ticker: position.symbol,
            triageFlagAtAction: triage.recommendedAction,
            actionClass: finalActionClass,
            actionDetail: finalActionDetail,
            reasonCode: triage.recommendedAction || null,
            notes: notesJson,
            qtyChange: tradePosition.quantity.toString(), // Signed quantity (negative for SELL, positive for BUY) - matching uses absolute values
            completed: false,
            severityOverride: 'pending',
            tradeReason: tradeReason,
            tradeStage: tradeStage,
            source: 'triage_action',
            conid: position.conid,
            createdAt: new Date(),
          })
          .returning({ id: blotterActions.id });

        if (inserted) {
          insertedBlotterActions.push(inserted);

          // Attempt to match with existing trade blotter entry
          try {
            await matchTriageActionToTradeBlotter(
              inserted.id,
              strategyId || triage.strategyId,
              position.symbol,
              position.conid,
              actionDate
            );
          } catch (error) {
            console.error('Failed to match triage action to trade blotter:', error);
            // Continue - matching is optional
          }
        }
      }

      // Ensure at least one blotter action was created
      if (insertedBlotterActions.length === 0) {
        return NextResponse.json(
          { error: "No blotter actions were created. Check that positions exist and have conid values." },
          { status: 400 }
        );
      }

      // Update triage record severity
      if (severityOverride) {
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
        message: "Trade Action recorded in blotter",
        blotterIds: insertedBlotterActions.map(a => a.id),
      });
    }

    // Handle non-TRADE actions (existing logic)
    // Resolve identifiers for matching (prefer conid, fallback to ticker)
    let conid: number | null = null;
    let ticker: string | null = triage.symbol ?? null;

    // From explicit position (best)
    if (positionId || triage.positionId) {
      const position = await db
        .select({
          conid: positions.conid,
          symbol: positions.symbol,
          snapshotDate: positions.snapshotDate,
        })
        .from(positions)
        .where(eq(positions.id, positionId || triage.positionId!))
        .limit(1);
      if (position.length > 0) {
        conid = position[0].conid ?? conid;
        ticker = ticker ?? position[0].symbol ?? ticker;
      }
    }

    // Fallback: latest position for the strategy (helps QUANTITY_CHANGE with null positionId)
    if ((!conid || !ticker) && triage.strategyId) {
      const latestPosition = await db
        .select({
          conid: positions.conid,
          symbol: positions.symbol,
        })
        .from(positions)
        .where(eq(positions.strategyId, triage.strategyId))
        .orderBy(desc(positions.snapshotDate))
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
      strategyId: strategyId || triage.strategyId,
      positionId: positionId || triage.positionId,
      strategyKey: triage.symbol,
        ticker: ticker,
      triageFlagAtAction: triage.recommendedAction,
      actionClass,
      actionDetail: actionType,
      reasonCode: triage.recommendedAction || null,
      notes: notes || triage.notes || null,
      completed: actionType === "UPDATE" || actionType === "MARK_REVIEWED",
      severityOverride,
      overrideExpiresDate,
      monitorDays: monitorDaysValue,
        tradeReason: tradeReason || null,
        tradeStage: tradeStage || null,
        source: 'triage_action',
        conid: conid ?? null,
      createdAt: new Date(),
      })
      .returning({ id: blotterActions.id });

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

