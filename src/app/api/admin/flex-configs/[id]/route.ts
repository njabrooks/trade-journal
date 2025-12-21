/**
 * Flex Query Config Admin API - Individual Config Operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { flexQueryConfigs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const configId = id;
    const body = await request.json();
    const { accountId, queryName, queryType, flexToken, queryId, isActive, scheduleCron } = body;

    // Check if config exists
    const existing = await db
      .select()
      .from(flexQueryConfigs)
      .where(eq(flexQueryConfigs.id, configId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    // Build update object (only include fields that are provided)
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (accountId !== undefined) updateData.accountId = accountId;
    if (queryName !== undefined) updateData.queryName = queryName;
    if (queryType !== undefined) {
      if (!['positions', 'trades'].includes(queryType)) {
        return NextResponse.json(
          { error: 'queryType must be "positions" or "trades"' },
          { status: 400 }
        );
      }
      updateData.queryType = queryType;
    }
    // Only update token/queryId if provided (for security, don't overwrite with empty)
    if (flexToken && flexToken.trim().length > 0) updateData.flexToken = flexToken;
    if (queryId && queryId.trim().length > 0) updateData.queryId = queryId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (scheduleCron !== undefined) updateData.scheduleCron = scheduleCron || null;

    const [updated] = await db
      .update(flexQueryConfigs)
      .set(updateData)
      .where(eq(flexQueryConfigs.id, configId))
      .returning();

    return NextResponse.json({
      success: true,
      config: {
        id: updated.id,
        accountId: updated.accountId,
        queryName: updated.queryName,
        queryType: updated.queryType,
        isActive: updated.isActive,
        scheduleCron: updated.scheduleCron,
      },
    });
  } catch (error) {
    console.error('Failed to update Flex config:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
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
    const configId = id;

    // Check if config exists
    const existing = await db
      .select()
      .from(flexQueryConfigs)
      .where(eq(flexQueryConfigs.id, configId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    await db.delete(flexQueryConfigs).where(eq(flexQueryConfigs.id, configId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete Flex config:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

