import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, strategyTemplates, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';
import { recomputeStrategyStatus } from '@/lib/services/strategies';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Handle force close / reopen flow
    if (body.forceClose !== undefined) {
      // Fetch strategy for journal logging
      const [strategy] = await db
        .select({ id: strategies.id, autoDerivedLabel: strategies.autoDerivedLabel, status: strategies.status })
        .from(strategies)
        .where(eq(strategies.id, id))
        .limit(1);

      if (!strategy) {
        return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      }

      if (body.forceClose) {
        // Force close: set status to complete and record closedAt
        const now = new Date();
        const [updated] = await db
          .update(strategies)
          .set({ status: 'complete', closedAt: now, updatedAt: now })
          .where(eq(strategies.id, id))
          .returning();

        await logToJournal({
          objectType: 'strategy',
          objectId: id,
          objectTitle: strategy.autoDerivedLabel ?? id,
          actionType: 'strategy_force_closed',
          actionDescription: `Strategy manually closed (dust positions remain)`,
          previousState: { status: strategy.status },
          newState: { status: 'complete', closedAt: now.toISOString() },
          source: 'user',
        });

        return NextResponse.json({ success: true, strategy: updated });
      } else {
        // Reopen: clear closedAt and recompute status from positions
        await db
          .update(strategies)
          .set({ closedAt: null, updatedAt: new Date() })
          .where(eq(strategies.id, id));

        const newStatus = await recomputeStrategyStatus(id);
        const [updated] = await db
          .update(strategies)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(strategies.id, id))
          .returning();

        await logToJournal({
          objectType: 'strategy',
          objectId: id,
          objectTitle: strategy.autoDerivedLabel ?? id,
          actionType: 'strategy_reopened',
          actionDescription: `Strategy reopened (status recomputed to ${newStatus})`,
          previousState: { status: strategy.status },
          newState: { status: newStatus, closedAt: null },
          source: 'user',
        });

        return NextResponse.json({ success: true, strategy: updated });
      }
    }

    // Extract fields that can be updated on the strategies table
    // Note: label/description/rationale don't exist on strategies - use /api/strategies PATCH for full updates
    const { assetThesisId, status, strategyType, direction } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};

    if (assetThesisId !== undefined) updates.assetThesisId = assetThesisId;
    if (status !== undefined) updates.status = status;
    if (strategyType !== undefined) updates.strategyType = strategyType;
    if (direction !== undefined) updates.direction = direction;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Perform the update
    const [updated] = await db
      .update(strategies)
      .set(updates)
      .where(eq(strategies.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, strategy: updated });
  } catch (error) {
    console.error('Strategy update error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Join through strategyTemplates to underlyings to get the ticker
    const [result] = await db
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        strategyTemplateId: strategies.strategyTemplateId,
        accountId: strategies.accountId,
        assetThesisId: strategies.assetThesisId,
        status: strategies.status,
        openedAt: strategies.openedAt,
        closedAt: strategies.closedAt,
        isAuto: strategies.isAuto,
        autoSource: strategies.autoSource,
        autoDerivedLabel: strategies.autoDerivedLabel,
        confirmedAt: strategies.confirmedAt,
        strategyType: strategies.strategyType,
        direction: strategies.direction,
        timeHorizon: strategies.timeHorizon,
        entrySpot: strategies.entrySpot,
        entryIv30: strategies.entryIv30,
        netPremium: strategies.netPremium,
        entryNotional: strategies.entryNotional,
        totalAbsNotional: strategies.totalAbsNotional,
        totalUnrealizedPnl: strategies.totalUnrealizedPnl,
        createdAt: strategies.createdAt,
        updatedAt: strategies.updatedAt,
        // From template
        label: strategyTemplates.label,
        // From underlying (via template)
        underlyingTicker: underlyings.ticker,
      })
      .from(strategies)
      .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
      .where(eq(strategies.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Strategy fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(strategies)
      .where(eq(strategies.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Strategy deleted' });
  } catch (error) {
    console.error('Strategy delete error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

