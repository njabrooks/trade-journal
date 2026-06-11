import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, accounts } from '@/db/schema';

/**
 * POST /api/strategies/create
 *
 * Creates a new strategy with optional links to asset thesis and macro thesis.
 *
 * Request body:
 * {
 *   strategyKey: string;             // Required: Unique identifier
 *   label?: string;                  // Optional: Will be auto-generated if not provided
 *   description?: string;
 *   direction: 'long' | 'short' | 'neutral';
 *   status?: 'draft' | 'active' | 'complete' | 'rejected';
 *   assetThesisId?: string;          // Auto-link to this asset thesis (inherits macro thesis)
 *   rationale?: string;
 *   exitStrategy?: string;
 *   riskManagement?: string;
 *   tradeManagement?: string;
 *   capitalAllocation?: string;
 *   expectedReturn?: number;
 *   maxDrawdown?: number;
 *   timeHorizon?: string;
 *   notes?: object;
 * }
 *
 * Response:
 * {
 *   success: true;
 *   id: string;
 *   strategyKey: string;
 *   label: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      strategyKey,
      label,
      description,
      direction,
      status = 'active',
      assetThesisId, // Strategy inherits macro thesis through asset thesis
      rationale,
      exitStrategy,
      riskManagement,
      tradeManagement,
      capitalAllocation,
      expectedReturn,
      maxDrawdown,
      timeHorizon,
      notes = {},
    } = body;

    // Validate required fields
    if (!strategyKey) {
      return NextResponse.json(
        { error: 'Missing required field: strategyKey' },
        { status: 400 }
      );
    }

    if (!direction || !['long', 'short', 'neutral'].includes(direction)) {
      return NextResponse.json(
        { error: 'Invalid direction. Must be: long, short, or neutral' },
        { status: 400 }
      );
    }

    // Auto-generate label if not provided
    const finalLabel = label || `${direction.toUpperCase()} ${strategyKey}`;

    // Get default account (first account in system)
    const [defaultAccount] = await db.select().from(accounts).limit(1);

    // Create the strategy
    // Note: Using placeholder strategyTemplateId - in production, this should be provided or looked up
    // Note: thesis, exitCriteria, profitRules, defenseRules, timeRules, entryContext removed - these now come from linked asset thesis
    const [createdStrategy] = await db
      .insert(strategies)
      .values({
        strategyKey,
        strategyTemplateId: '00000000-0000-0000-0000-000000000000', // TODO: Should be provided in request
        autoDerivedLabel: finalLabel,
        status,
        openedAt: new Date(),
        assetThesisId: assetThesisId || null, // Inherits macro thesis through asset thesis
        accountId: defaultAccount?.id || null,
        timeHorizon: timeHorizon || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      success: true,
      id: createdStrategy.id,
      strategyKey: createdStrategy.strategyKey,
      label: createdStrategy.autoDerivedLabel,
      message: 'Strategy created successfully.',
    });
  } catch (error: any) {
    console.error('Error creating strategy:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A strategy with this key already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create strategy', details: error.message },
      { status: 500 }
    );
  }
}

