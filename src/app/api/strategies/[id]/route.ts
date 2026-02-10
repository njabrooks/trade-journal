import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, strategyTemplates, strategyTypes, underlyings, positions } from '@/db/schema';
import { eq, aliasedTable, and, isNull, ne, sql } from 'drizzle-orm';
import { resolveOrCreateStrategyType } from '@/lib/services/strategyTypes';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';
import { recomputeStrategyStatus } from '@/lib/services/strategies';
import { deriveStrategyKeyFromPosition } from '@/lib/derived/strategyAuto';

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
    const { assetThesisId, status, strategyType, strategyTypeId, direction } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};

    if (assetThesisId !== undefined) updates.assetThesisId = assetThesisId;
    if (status !== undefined) updates.status = status;
    if (direction !== undefined) updates.direction = direction;

    // Handle strategy type: prefer strategyTypeId, fall back to resolving from name
    if (strategyTypeId !== undefined) {
      updates.strategyTypeId = strategyTypeId;
      // Keep legacy text column in sync
      if (strategyType !== undefined) {
        updates.strategyType = strategyType;
      }
    } else if (strategyType !== undefined) {
      updates.strategyType = strategyType;
      // Resolve to FK
      const resolvedId = await resolveOrCreateStrategyType(strategyType);
      updates.strategyTypeId = resolvedId;
    }

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

    // When a strategy is rejected, link all matching unlinked positions to it
    // so they become hidden from the portfolio (instead of showing as "unlinked")
    if (status === 'rejected' && updated.strategyKey && updated.accountId) {
      // Find all unlinked positions that match this strategy's key
      const unlinkedPositions = await db
        .select({
          id: positions.id,
          symbol: positions.symbol,
          assetClass: positions.assetClass,
          expiry: positions.expiry,
          snapshotDate: positions.snapshotDate,
          openDate: positions.openDate,
          underlyingId: positions.underlyingId,
          accountId: positions.accountId,
        })
        .from(positions)
        .where(
          and(
            eq(positions.accountId, updated.accountId),
            isNull(positions.strategyId),
            ne(positions.quantity, '0')
          )
        );

      // Filter to positions that would derive the same strategy key
      const matchingPositionIds: string[] = [];
      for (const pos of unlinkedPositions) {
        const derivedKey = deriveStrategyKeyFromPosition({
          id: pos.id,
          accountId: pos.accountId,
          symbol: pos.symbol,
          assetClass: pos.assetClass,
          expiry: pos.expiry,
          snapshotDate: pos.snapshotDate,
          openDate: pos.openDate,
          underlyingId: pos.underlyingId,
        });
        if (derivedKey === updated.strategyKey) {
          matchingPositionIds.push(pos.id);
        }
      }

      // Link matching positions to the rejected strategy
      if (matchingPositionIds.length > 0) {
        await db
          .update(positions)
          .set({ strategyId: id, updatedAt: new Date() })
          .where(
            sql`${positions.id} = ANY(${matchingPositionIds})`
          );

        console.log(
          `Linked ${matchingPositionIds.length} unlinked positions to rejected strategy ${id} (${updated.autoDerivedLabel})`
        );
      }
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

    // Join through strategyTemplates to underlyings to get the ticker,
    // and resolve parent underlying if set
    const parentUnderlyings = aliasedTable(underlyings, 'parent_underlyings');

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
        strategyTypeId: strategies.strategyTypeId,
        strategyTypeName: strategyTypes.name,
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
        underlyingId: underlyings.id,
        parentUnderlyingId: underlyings.parentUnderlyingId,
        // From parent underlying (via underlying.parentUnderlyingId)
        parentUnderlyingTicker: parentUnderlyings.ticker,
      })
      .from(strategies)
      .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .leftJoin(strategyTypes, eq(strategies.strategyTypeId, strategyTypes.id))
      .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
      .leftJoin(parentUnderlyings, eq(underlyings.parentUnderlyingId, parentUnderlyings.id))
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

