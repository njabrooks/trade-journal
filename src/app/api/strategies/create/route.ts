import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies } from '@/db/schema';

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
 *   status?: 'open' | 'closed';
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
      status = 'open',
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

    // Create the strategy
    const [createdStrategy] = await db
      .insert(strategies)
      .values({
        strategyKey,
        label: finalLabel,
        description: description || null,
        direction,
        status,
        assetThesisId: assetThesisId || null, // Inherits macro thesis through asset thesis
        rationale: rationale || null,
        exitStrategy: exitStrategy || null,
        riskManagement: riskManagement || null,
        tradeManagement: tradeManagement || null,
        capitalAllocation: capitalAllocation || null,
        expectedReturn: expectedReturn || null,
        maxDrawdown: maxDrawdown || null,
        timeHorizon: timeHorizon || null,
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      success: true,
      id: createdStrategy.id,
      strategyKey: createdStrategy.strategyKey,
      label: createdStrategy.label,
      message: 'Strategy created successfully',
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

