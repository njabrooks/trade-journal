/**
 * Flex Query Configs Admin API
 * 
 * CRUD operations for Flex query configurations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { flexQueryConfigs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const configs = await db.select().from(flexQueryConfigs);

    return NextResponse.json({
      configs: configs.map((config) => ({
        id: config.id,
        accountId: config.accountId,
        queryName: config.queryName,
        queryType: config.queryType,
        isActive: config.isActive,
        scheduleCron: config.scheduleCron,
        lastRunAt: config.lastRunAt,
        lastRunStatus: config.lastRunStatus,
        lastRunError: config.lastRunError,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, queryName, queryType, flexToken, queryId, isActive, scheduleCron } = body;

    // Validation - flexToken and queryId are optional if env vars are set
    if (!accountId || !queryName || !queryType) {
      return NextResponse.json(
        { error: 'Missing required fields: accountId, queryName, queryType' },
        { status: 400 }
      );
    }

    // Check if we have token/queryId in config or env
    const hasToken = flexToken && flexToken.trim().length > 0;
    const hasQueryId = queryId && queryId.trim().length > 0;
    const hasEnvToken = !!process.env.IBKR_FLEX_TOKEN;
    const hasEnvQueryId = queryType === 'positions' 
      ? !!process.env.IBKR_FLEX_POSITIONS_QUERY_ID
      : !!process.env.IBKR_FLEX_TRADES_QUERY_ID;

    if (!hasToken && !hasEnvToken) {
      return NextResponse.json(
        { error: 'FLEX_TOKEN is required (provide in config or set IBKR_FLEX_TOKEN environment variable)' },
        { status: 400 }
      );
    }

    if (!hasQueryId && !hasEnvQueryId) {
      return NextResponse.json(
        { error: `QUERY_ID is required (provide in config or set IBKR_FLEX_${queryType.toUpperCase()}_QUERY_ID environment variable)` },
        { status: 400 }
      );
    }

    if (!['positions', 'trades'].includes(queryType)) {
      return NextResponse.json(
        { error: 'queryType must be "positions" or "trades"' },
        { status: 400 }
      );
    }

    // Check for duplicate query name for this account
    const existing = await db
      .select()
      .from(flexQueryConfigs)
      .where(and(eq(flexQueryConfigs.accountId, accountId), eq(flexQueryConfigs.queryName, queryName)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'A configuration with this name already exists for this account' },
        { status: 400 }
      );
    }

    const [config] = await db
      .insert(flexQueryConfigs)
      .values({
        accountId,
        queryName,
        queryType,
        flexToken: hasToken ? flexToken : '', // Store empty string if using env var
        queryId: hasQueryId ? queryId : '', // Store empty string if using env var
        isActive: isActive !== undefined ? isActive : true,
        scheduleCron: scheduleCron || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        accountId: config.accountId,
        queryName: config.queryName,
        queryType: config.queryType,
        isActive: config.isActive,
        scheduleCron: config.scheduleCron,
      },
    });
  } catch (error) {
    console.error('Failed to create Flex config:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

