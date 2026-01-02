import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetTheses, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * POST /api/macro-theses/[id]/link-asset-theses
 *
 * Link asset theses to a macro thesis.
 * Can set as primary or add as related.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: macroThesisId } = await params;
    const body = await req.json();
    const { targetIds, linkType = 'related' } = body as {
      targetIds: string[];
      linkType?: 'primary' | 'related';
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

    if (linkType === 'primary') {
      // Set as primary macro thesis (update FK)
      await db
        .update(assetTheses)
        .set({
          primaryMacroThesisId: macroThesisId,
          updatedAt: new Date(),
        })
        .where(inArray(assetTheses.id, targetIds));
    } else {
      // Add as related macro theses (junction table)
      // Insert only if not already exists
      const existingRelations = await db
        .select({ assetThesisId: assetThesisRelatedMacroTheses.assetThesisId })
        .from(assetThesisRelatedMacroTheses)
        .where(
          inArray(assetThesisRelatedMacroTheses.assetThesisId, targetIds)
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
    }

    return NextResponse.json({
      success: true,
      linkedCount: targetIds.length,
      linkType,
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
 * GET /api/macro-theses/[id]/available-asset-theses
 *
 * Get available asset theses that can be linked to this macro thesis
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // Await params even if not using the id

    // Get all asset theses (could add filters here)
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
