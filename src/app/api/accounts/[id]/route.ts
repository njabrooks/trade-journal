import { NextRequest, NextResponse } from 'next/server';
import { updateAccount, deleteAccount, getAccountById } from '@/lib/ingestion/flex/account';
import { db } from '@/db';
import { strategies, trades, positions } from '@/db/schema';
import { eq, and, count } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accountId = id;
    const body = await request.json();
    const { brokerName, baseCurrency, label } = body;

    // Verify account exists
    const account = await getAccountById(accountId);
    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Update account
    const updated = await updateAccount(accountId, {
      brokerName,
      baseCurrency,
      label,
    });

    return NextResponse.json({ account: updated, success: true });
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json(
      {
        error: 'Failed to update account',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accountId = id;

    // Verify account exists
    const account = await getAccountById(accountId);
    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Check for linked data (for warning purposes)
    const [strategyCount] = await db
      .select({ count: count() })
      .from(strategies)
      .where(eq(strategies.accountId, accountId));

    const [tradeCount] = await db
      .select({ count: count() })
      .from(trades)
      .where(eq(trades.accountId, accountId));

    const [positionCount] = await db
      .select({ count: count() })
      .from(positions)
      .where(eq(positions.accountId, accountId));

    const hasLinkedData =
      (strategyCount.count ?? 0) > 0 ||
      (tradeCount.count ?? 0) > 0 ||
      (positionCount.count ?? 0) > 0;

    // Delete account (cascade will handle related records)
    const deleted = await deleteAccount(accountId);

    return NextResponse.json({
      account: deleted,
      success: true,
      deletedLinkedData: hasLinkedData,
      counts: {
        strategies: strategyCount.count ?? 0,
        trades: tradeCount.count ?? 0,
        positions: positionCount.count ?? 0,
      },
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete account',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

