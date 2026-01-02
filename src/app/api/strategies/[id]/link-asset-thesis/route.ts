import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, assetTheses } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/strategies/[id]/link-asset-thesis
 *
 * Link a strategy to an asset thesis (one-to-one relationship)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: strategyId } = await params;
    const body = await req.json();
    const { targetIds } = body as {
      targetIds: string[];
    };

    if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
      return NextResponse.json(
        { error: 'targetIds array is required' },
        { status: 400 }
      );
    }

    // Strategy can only link to ONE asset thesis
    if (targetIds.length > 1) {
      return NextResponse.json(
        { error: 'Strategy can only link to one asset thesis' },
        { status: 400 }
      );
    }

    const assetThesisId = targetIds[0];

    // Verify strategy exists
    const strategyExists = await db.query.strategies.findFirst({
      where: (s, { eq }) => eq(s.id, strategyId),
    });

    if (!strategyExists) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Verify asset thesis exists
    const assetThesisExists = await db.query.assetTheses.findFirst({
      where: (at, { eq }) => eq(at.id, assetThesisId),
    });

    if (!assetThesisExists) {
      return NextResponse.json(
        { error: 'Asset thesis not found' },
        { status: 404 }
      );
    }

    // Update strategy to link to asset thesis
    await db
      .update(strategies)
      .set({
        assetThesisId,
        updatedAt: new Date(),
      })
      .where(eq(strategies.id, strategyId));

    return NextResponse.json({
      success: true,
      linkedAssetThesisId: assetThesisId,
    });
  } catch (error) {
    console.error('Error linking strategy to asset thesis:', error);
    return NextResponse.json(
      { error: 'Failed to link strategy' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/strategies/[id]/available-asset-theses
 *
 * Get available asset theses that can be linked to this strategy
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // Await params even if not using the id
    const availableAssetTheses = await db.query.assetTheses.findMany({
      orderBy: (at, { desc }) => [desc(at.createdAt)],
    });

    const entities = availableAssetTheses.map(at => ({
      id: at.id,
      title: at.title,
      status: at.status,
    }));

    return NextResponse.json({ entities });
  } catch (error) {
    console.error('Error fetching available asset theses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available asset theses' },
      { status: 500 }
    );
  }
}
