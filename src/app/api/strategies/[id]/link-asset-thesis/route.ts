import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, assetTheses, underlyings } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

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
 * GET /api/strategies/[id]/link-asset-thesis
 *
 * Get available asset theses that can be linked to this strategy
 * Returns both available entities and currently linked entity
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: strategyId } = await params;

    // Fetch the strategy to get currently linked asset thesis
    const strategy = await db.query.strategies.findFirst({
      where: (s, { eq }) => eq(s.id, strategyId),
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Get all asset theses with tickers (join with underlyings)
    const allAssetThesesRaw = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        status: assetTheses.status,
        ticker: underlyings.ticker,
        createdAt: assetTheses.createdAt,
      })
      .from(assetTheses)
      .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .orderBy(desc(assetTheses.createdAt));

    const allAssetTheses = allAssetThesesRaw.map(at => ({
      ...at,
      ticker: at.ticker || undefined,
    }));

    // Fetch currently linked asset thesis if it exists
    let currentlyLinked: typeof allAssetTheses = [];
    if (strategy.assetThesisId) {
      const linkedAssetThesis = allAssetTheses.find(at => at.id === strategy.assetThesisId);
      if (linkedAssetThesis) {
        currentlyLinked = [linkedAssetThesis];
      }
    }

    const available = allAssetTheses.filter(at => at.id !== strategy.assetThesisId);

    return NextResponse.json({ entities: available, currentlyLinked });
  } catch (error) {
    console.error('Error fetching available asset theses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available asset theses' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/strategies/[id]/link-asset-thesis
 *
 * Unlink the asset thesis from this strategy
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: strategyId } = await params;

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

    // Unlink asset thesis
    await db
      .update(strategies)
      .set({
        assetThesisId: null,
        updatedAt: new Date(),
      })
      .where(eq(strategies.id, strategyId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unlinking strategy from asset thesis:', error);
    return NextResponse.json(
      { error: 'Failed to unlink strategy' },
      { status: 500 }
    );
  }
}
