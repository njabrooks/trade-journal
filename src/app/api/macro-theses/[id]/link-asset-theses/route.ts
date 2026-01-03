import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetTheses, assetThesisRelatedMacroTheses, underlyings } from '@/db/schema';
import { eq, inArray, and, desc } from 'drizzle-orm';

/**
 * POST /api/macro-theses/[id]/link-asset-theses
 *
 * Link asset theses to a macro thesis via the junction table.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: macroThesisId } = await params;
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

    // Verify macro thesis exists
    const macroThesisExists = await db.query.macroTheses.findFirst({
      where: (mt, { eq }) => eq(mt.id, macroThesisId),
    });

    if (!macroThesisExists) {
      return NextResponse.json(
        { error: 'Macro thesis not found' },
        { status: 404 }
      );
    }

    // Verify all asset theses exist
    const assetThesesExist = await db
      .select({ id: assetTheses.id })
      .from(assetTheses)
      .where(inArray(assetTheses.id, targetIds));

    if (assetThesesExist.length !== targetIds.length) {
      return NextResponse.json(
        { error: 'One or more asset theses not found' },
        { status: 404 }
      );
    }

    // Add to junction table (insert only if not already exists)
    const existingRelations = await db
      .select({ assetThesisId: assetThesisRelatedMacroTheses.assetThesisId })
      .from(assetThesisRelatedMacroTheses)
      .where(
        and(
          inArray(assetThesisRelatedMacroTheses.assetThesisId, targetIds),
          eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId)
        )
      );

    const existingSet = new Set(existingRelations.map(r => r.assetThesisId));
    const newRelations = targetIds
      .filter(id => !existingSet.has(id))
      .map(assetThesisId => ({
        assetThesisId,
        macroThesisId,
        addedAt: new Date(),
      }));

    if (newRelations.length > 0) {
      await db
        .insert(assetThesisRelatedMacroTheses)
        .values(newRelations);
    }

    return NextResponse.json({
      success: true,
      linkedCount: targetIds.length,
    });
  } catch (error) {
    console.error('Error linking asset theses to macro thesis:', error);
    return NextResponse.json(
      { error: 'Failed to link asset theses' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/macro-theses/[id]/link-asset-theses
 *
 * Get available asset theses that can be linked to this macro thesis
 * Returns both available entities and currently linked entities
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: macroThesisId } = await params;

    // Verify macro thesis exists
    const macroThesisExists = await db.query.macroTheses.findFirst({
      where: (mt, { eq }) => eq(mt.id, macroThesisId),
    });

    if (!macroThesisExists) {
      return NextResponse.json(
        { error: 'Macro thesis not found' },
        { status: 404 }
      );
    }

    // Get all asset theses with underlying data (for ticker)
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

    // Get linked asset theses from junction table
    const linkedAssetTheses = await db
      .select({ assetThesisId: assetThesisRelatedMacroTheses.assetThesisId })
      .from(assetThesisRelatedMacroTheses)
      .where(eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId));

    const linkedSet = new Set(linkedAssetTheses.map(r => r.assetThesisId));

    // Separate into currently linked and available
    const currentlyLinked = allAssetTheses
      .filter(at => linkedSet.has(at.id))
      .map(at => ({
        id: at.id,
        title: at.title,
        ticker: at.ticker,
        status: at.status,
      }));

    const available = allAssetTheses
      .filter(at => !linkedSet.has(at.id))
      .map(at => ({
        id: at.id,
        title: at.title,
        ticker: at.ticker,
        status: at.status,
      }));

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
 * DELETE /api/macro-theses/[id]/link-asset-theses
 *
 * Unlink an asset thesis from this macro thesis via the junction table
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: macroThesisId } = await params;
    const body = await req.json();
    const { targetId } = body as {
      targetId: string;
    };

    if (!targetId) {
      return NextResponse.json(
        { error: 'targetId is required' },
        { status: 400 }
      );
    }

    // Verify macro thesis exists
    const macroThesisExists = await db.query.macroTheses.findFirst({
      where: (mt, { eq }) => eq(mt.id, macroThesisId),
    });

    if (!macroThesisExists) {
      return NextResponse.json(
        { error: 'Macro thesis not found' },
        { status: 404 }
      );
    }

    // Verify asset thesis exists
    const assetThesis = await db.query.assetTheses.findFirst({
      where: (at, { eq }) => eq(at.id, targetId),
    });

    if (!assetThesis) {
      return NextResponse.json(
        { error: 'Asset thesis not found' },
        { status: 404 }
      );
    }

    // Remove from junction table
    await db
      .delete(assetThesisRelatedMacroTheses)
      .where(
        and(
          eq(assetThesisRelatedMacroTheses.assetThesisId, targetId),
          eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unlinking asset thesis from macro thesis:', error);
    return NextResponse.json(
      { error: 'Failed to unlink asset thesis' },
      { status: 500 }
    );
  }
}
