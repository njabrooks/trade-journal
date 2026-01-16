import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions, triageRecords, strategies, positions, underlyings } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
// REMOVED: matchTriageActionToTradeBlotter - blotter system deprecated, replaced by journal
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

    // Map action types to action classes
    const actionClassMap: Record<string, string> = {
      TRADE: "TRADE",
      MONITOR: "NOTE_ONLY",
      DISMISS: "NOTE_ONLY",
      UPDATE: "NOTE_ONLY",
    };

    const actionClass = actionClassMap[actionType] || "NOTE_ONLY";

    // Determine triage record updates and blotter severity override based on action type
    // Note: Triage records have separate status (workflow) and severity (importance) fields
    // Blotter actions use severityOverride column for both severity overrides and workflow status
    let triageStatusUpdate: string | null = null;  // Status for triage record
    let triageSeverityUpdate: string | null = null;  // Severity for triage record (only for overrides)
    let blotterSeverityOverride: string | null = null;  // Value for blotter_actions.severity_override
    let overrideExpiresDate: string | null = null;
    let monitorDaysValue: number | null = null;

    if (actionType === "DISMISS") {
      // Dismiss: mark as done, override severity to 'info'
      triageStatusUpdate = "done";
      triageSeverityUpdate = "info";
      blotterSeverityOverride = "info";
      overrideExpiresDate = null;
    } else if (actionType === "MONITOR") {
      // Monitor: keep in_progress, override severity to 'monitor'
      triageStatusUpdate = "in_progress";
      triageSeverityUpdate = "monitor";
      blotterSeverityOverride = "monitor";
      const days = monitorDays || 7;
      monitorDaysValue = days;
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + days);
      overrideExpiresDate = expiresDate.toISOString().split("T")[0];
    } else if (actionType === "TRADE") {
      // Trade: mark workflow status
      if (commonTrigger === "QUANTITY_CHANGE" && tradeReason && tradeStage) {
        // Already validated trade - mark as done
        triageStatusUpdate = "done";
        blotterSeverityOverride = "done";
      } else {
        // Trade action in progress
        triageStatusUpdate = "in_progress";
        blotterSeverityOverride = "in_progress";
      }
    } else if (actionType === "UPDATE") {
      if (commonTrigger === "CONFIRM_STRATEGIES") {
        triageStatusUpdate = "done";
        blotterSeverityOverride = "done";
      }
      // For PROVIDE_STRATEGY_METADATA, we'd need more data, so we'll leave updates as null
    }

    // Handle TRADE action with multiple positions
    // QUANTITY_CHANGE now uses TRADE action type (not UPDATE), so check for TRADE action
    const needsTradeActions = actionType === "TRADE" && tradePositions;

    if (needsTradeActions) {
      if (!tradePositions || !Array.isArray(tradePositions) || tradePositions.length === 0) {
        return NextResponse.json(
          { error: "tradePositions array is required for TRADE action or QUANTITY_CHANGE with Trade Actions" },
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
      const isQuantityChange = commonTrigger === "QUANTITY_CHANGE";
      
      // For QUANTITY_CHANGE, always use TRADE action class/detail
      const finalActionClass = isQuantityChange ? "TRADE" : actionClass;
      const finalActionDetail = isQuantityChange ? "TRADE" : actionType;

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

          // Determine actionDate based on triage type
          let actionDate: string;
          if (triage.recommendedAction === 'QUANTITY_CHANGE') {
            // For QUANTITY_CHANGE, use snapshotDate directly (matches trade date)
            if (!triage.snapshotDate) {
              errors.push({
                triageId: triage.id,
                error: "Triage record missing snapshotDate",
              });
              continue;
            }
            actionDate = typeof triage.snapshotDate === 'string' 
              ? triage.snapshotDate 
              : (triage.snapshotDate as Date).toISOString().split('T')[0];
          } else {
            // For other actions, snapshotDate + 1 day (intended for next day's trades)
            if (!triage.snapshotDate) {
              errors.push({
                triageId: triage.id,
                error: "Triage record missing snapshotDate",
              });
              continue;
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
              errors.push({
                triageId: triage.id,
                error: `Position ${tradePosition.positionId} not found`,
              });
              continue;
            }

            const position = positionResult[0];

            if (!position.conid) {
              errors.push({
                triageId: triage.id,
                error: `Position ${tradePosition.positionId} missing conid`,
              });
              continue;
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
              underlyingSymbol = position.symbol;
            }

            // Build trade details JSON
            const tradeDetails = {
              assetClass: position.assetClass,
              quantity: tradePosition.quantity,
              underlying: underlyingSymbol || position.symbol,
              expiry: position.expiry,
              strike: position.strike,
              optionRight: position.optionRight,
            };

            const notesJson = JSON.stringify({
              text: notes || triage.notes || null,
              tradeDetails,
            });

            const blotterId = `${actionDate}_${triage.strategyId || 'unknown'}_${position.conid}_${Date.now()}`;

            // Create blotter entry
            const [inserted] = await db
              .insert(blotterActions)
              .values({
                blotterId,
                actionDate: actionDate,
                snapshotDate: triage.snapshotDate,
                strategyId: triage.strategyId,
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
                severityOverride: 'in_progress',  // Workflow status: trade action in progress
                tradeReason: tradeReason,
                tradeStage: tradeStage,
                source: 'triage_action',
                conid: position.conid,
                createdAt: new Date(),
              })
              .returning({ id: blotterActions.id });

            if (inserted) {
              insertedBlotterActions.push(inserted);
              // REMOVED: matchTriageActionToTradeBlotter - blotter system deprecated, replaced by journal
              // Journal entries now serve as the primary audit trail
            }
          }

          // Ensure at least one blotter action was created
          if (insertedBlotterActions.length === 0) {
            errors.push({
              triageId: triage.id,
              error: "No blotter actions were created. Check that positions exist and have conid values.",
            });
            continue;
          }

          // Update triage record status (and severity if overridden)
          const triageUpdate: Record<string, unknown> = { updatedAt: new Date() };
          if (triageStatusUpdate) {
            triageUpdate.status = triageStatusUpdate;
          }
          if (triageSeverityUpdate) {
            triageUpdate.severity = triageSeverityUpdate;
          }
          if (Object.keys(triageUpdate).length > 1) {
            await db
              .update(triageRecords)
              .set(triageUpdate)
              .where(eq(triageRecords.id, triage.id));
          }

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
              blotterIds: insertedBlotterActions.map(a => a.id),
            },
          });

          results.push({ triageId: triage.id, success: true, blotterIds: insertedBlotterActions.map(a => a.id) });
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

    // Process non-TRADE actions (existing logic for MONITOR, DISMISS, UPDATE without tradePositions)
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
            strategyId: triage.strategyId,
            positionId: triage.positionId,
            strategyKey: triage.symbol,
            ticker: ticker,
            triageFlagAtAction: triage.recommendedAction,
            actionClass,
            actionDetail: actionType,
            reasonCode: triage.recommendedAction || null,
            notes: notes || triage.notes || null,
            completed: triageStatusUpdate === "done",
            severityOverride: blotterSeverityOverride,
            overrideExpiresDate,
            monitorDays: monitorDaysValue,
            tradeReason: tradeReason || null,
            tradeStage: tradeStage || null,
            source: "triage_action",
            conid: conid ?? null,
            createdAt: new Date(),
          })
          .returning({ id: blotterActions.id });

        // REMOVED: matchTriageActionToTradeBlotter - blotter system deprecated, replaced by journal
        // Journal entries now serve as the primary audit trail

        // Update triage record status (and severity if overridden)
        const triageUpdateNonTrade: Record<string, unknown> = { updatedAt: new Date() };
        if (triageStatusUpdate) {
          triageUpdateNonTrade.status = triageStatusUpdate;
        }
        if (triageSeverityUpdate) {
          triageUpdateNonTrade.severity = triageSeverityUpdate;
        }
        if (Object.keys(triageUpdateNonTrade).length > 1) {
          await db
            .update(triageRecords)
            .set(triageUpdateNonTrade)
            .where(eq(triageRecords.id, triage.id));
        }

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
            actionClass,
            monitorDays: monitorDaysValue,
            overrideExpiresDate,
          },
          rationale: notes || undefined,
          source: 'user',
          metadata: {
            bulkAction: true,
            blotterId,
            blotterActionId: insertedBlotterAction?.id,
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

