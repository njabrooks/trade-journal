import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, signalEntityLinks, strategies, triageRecords } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow';

/**
 * GET /api/signals/strategy?strategyId=xxx
 *
 * Get all signals for a strategy.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get('strategyId');

    if (!strategyId) {
      return NextResponse.json(
        { error: 'strategyId is required' },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(
        and(
          eq(signalEntityLinks.entityType, 'strategy'),
          eq(signalEntityLinks.strategyId, strategyId)
        )
      )
      .orderBy(signals.createdAt);

    return NextResponse.json({ signals: rows.map(r => r.signals) });
  } catch (error) {
    console.error('Error fetching strategy signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signals/strategy
 *
 * Create a new signal for a strategy.
 *
 * Body:
 * {
 *   strategyId: string;
 *   statement: string;
 *   type: 'confirmation' | 'warning';
 *   importance: 'critical' | 'significant' | 'supporting';
 *   notes?: string;
 *   explicitDetails: {
 *     logic: 'all' | 'any';
 *     conditions: Array<{
 *       type: string;
 *       value: number;
 *       ticker?: string;
 *       tvAlertName?: string;
 *     }>;
 *     recommendedAction: string;
 *     actionNotes?: string;
 *   };
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategyId, statement, type, importance, notes, explicitDetails } = body;

    // Validate required fields
    if (!strategyId || !statement || !type || !importance || !explicitDetails) {
      return NextResponse.json(
        { error: 'Missing required fields: strategyId, statement, type, importance, explicitDetails' },
        { status: 400 }
      );
    }

    if (!['confirmation', 'warning'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "confirmation" or "warning"' },
        { status: 400 }
      );
    }

    if (!['critical', 'significant', 'supporting'].includes(importance)) {
      return NextResponse.json(
        { error: 'importance must be "critical", "significant", or "supporting"' },
        { status: 400 }
      );
    }

    // Validate explicitDetails
    if (!explicitDetails.logic || !explicitDetails.conditions || !explicitDetails.recommendedAction) {
      return NextResponse.json(
        { error: 'explicitDetails must include logic, conditions, and recommendedAction' },
        { status: 400 }
      );
    }

    // Verify strategy exists
    const [strategy] = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Create the signal
    const [createdSignal] = await db
      .insert(signals)
      .values({
        entityType: 'strategy',
        strategyId,
        thesisId: null,
        thesisType: null,
        statement,
        type,
        category: 'data_driven',
        importance,
        status: 'active',
        notes: notes || null,
        explicitDetails,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create junction link
    await db.insert(signalEntityLinks).values({
      signalId: createdSignal.id,
      entityType: 'strategy',
      strategyId,
    });

    // Log to journal
    await logToJournal({
      objectType: 'strategy',
      objectId: strategyId,
      objectTitle: strategy.autoDerivedLabel || strategy.strategyKey,
      actionType: 'signal_created',
      actionDescription: `Created ${type} signal: "${statement}"`,
      previousState: undefined,
      newState: {
        signalId: createdSignal.id,
        type,
        importance,
        conditions: explicitDetails.conditions.length,
        recommendedAction: explicitDetails.recommendedAction,
      },
      source: 'user',
      metadata: {
        signalId: createdSignal.id,
        strategyKey: strategy.strategyKey,
      },
    });

    // Check if this resolves DEFINE_SIGNALS triage
    // (If this is the first signal, the user has started configuring signals)
    await checkAndResolveTriage(strategyId, strategy);

    return NextResponse.json({
      success: true,
      signal: createdSignal,
    });
  } catch (error) {
    console.error('Error creating strategy signal:', error);
    return NextResponse.json(
      { error: 'Failed to create signal' },
      { status: 500 }
    );
  }
}

/**
 * Helper to check if DEFINE_SIGNALS triage should be resolved.
 * Resolves when at least one signal has been created for the strategy.
 */
async function checkAndResolveTriage(
  strategyId: string,
  strategy: { autoDerivedLabel: string | null; strategyKey: string; accountId: string | null }
) {
  try {
    // Find pending DEFINE_SIGNALS triage record (status != 'done')
    const [triageRecord] = await db
      .select()
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.recommendedAction, 'DEFINE_SIGNALS'),
          sql`${triageRecords.status} IS NULL OR ${triageRecords.status} != 'done'`
        )
      )
      .limit(1);

    if (triageRecord) {
      // Count signals for this strategy (via junction table)
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(signalEntityLinks)
        .where(
          and(
            eq(signalEntityLinks.entityType, 'strategy'),
            eq(signalEntityLinks.strategyId, strategyId)
          )
        );

      if (count >= 1) {
        // At least one signal configured - mark triage as done
        // Set status to 'done' (workflow complete), leave severity unchanged (historical importance)
        await db
          .update(triageRecords)
          .set({
            status: 'done',
            updatedAt: new Date(),
          })
          .where(eq(triageRecords.id, triageRecord.id));

        // Log resolution
        await logToJournal({
          objectType: 'strategy',
          objectId: strategyId,
          objectTitle: strategy.autoDerivedLabel || strategy.strategyKey,
          actionType: 'triage_resolved',
          actionDescription: `DEFINE_SIGNALS triage resolved - ${count} signal(s) configured`,
          previousState: { status: triageRecord.status, severity: triageRecord.severity },
          newState: { status: 'done', signalCount: count },
          source: 'user',
          metadata: {
            triageRecordId: triageRecord.id,
          },
        });
      }
    }
  } catch (error) {
    console.error('Error checking/resolving triage:', error);
    // Don't throw - this is a secondary operation
  }
}
