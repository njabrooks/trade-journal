import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blotterActions, triageRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triageId, actionType, notes, strategyId, positionId } = body;

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

    // Create blotter action
    await db.insert(blotterActions).values({
      blotterId,
      actionDate: new Date().toISOString().split("T")[0],
      snapshotDate: triage.snapshotDate,
      strategyId: strategyId || triage.strategyId,
      strategyKey: triage.symbol,
      triageFlagAtAction: triage.recommendedAction,
      actionClass,
      actionDetail: actionType,
      reasonCode: triage.recommendedAction || null,
      notes: notes || triage.notes || null,
      completed: actionType === "MARK_REVIEWED",
      createdAt: new Date(),
    });

    // If action is "MARK_REVIEWED", we could optionally mark the triage record as resolved
    // For now, we'll keep it in the queue but the blotter entry serves as the record

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

