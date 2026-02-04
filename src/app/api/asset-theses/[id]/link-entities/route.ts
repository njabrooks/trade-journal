import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetTheses, strategies, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq, inArray, and } from 'drizzle-orm';

/**
 * POST /api/asset-theses/[id]/link-entities
 *
 * Link entities to an asset thesis.
 * Supports linking to:
 * - Macro theses (via junction table)
 * - Strategies
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetThesisId } = await params;
    const body = await req.json();
    const { targetType, targetIds } = body as {
      targetType: 'macroThesis' | 'strategy';
      targetIds: string[];
    };

    if (!targetType) {
      return NextResponse.json(
        { error: 'targetType is required' },
        { status: 400 }
      );
    }

    if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
      return NextResponse.json(
        { error: 'targetIds array is required' },
        { status: 400 }
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

    if (targetType === 'macroThesis') {
      // Link to macro theses via junction table
      const existingRelations = await db
        .select({ macroThesisId: assetThesisRelatedMacroTheses.macroThesisId })
        .from(assetThesisRelatedMacroTheses)
        .where(eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId));

      const existingSet = new Set(existingRelations.map(r => r.macroThesisId));
      const newRelations = targetIds
        .filter(id => !existingSet.has(id))
        .map(macroThesisId => ({
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
    } else if (targetType === 'strategy') {
      // Link to strategies
      // Verify strategies exist
      const strategiesExist = await db
        .select({ id: strategies.id })
        .from(strategies)
        .where(inArray(strategies.id, targetIds));

      if (strategiesExist.length !== targetIds.length) {
        return NextResponse.json(
          { error: 'One or more strategies not found' },
          { status: 404 }
        );
      }

      // Update strategies to link to this asset thesis
      await db
        .update(strategies)
        .set({
          assetThesisId,
          updatedAt: new Date(),
        })
        .where(inArray(strategies.id, targetIds));

      return NextResponse.json({
        success: true,
        linkedCount: targetIds.length,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid targetType' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error linking entities to asset thesis:', error);
    return NextResponse.json(
      { error: 'Failed to link entities' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/asset-theses/[id]/link-entities
 *
 * Get available entities that can be linked to this asset thesis
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetThesisId } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'macroThesis' or 'strategy'

    // Fetch the asset thesis to get currently linked entities
    const assetThesis = await db.query.assetTheses.findFirst({
      where: (at, { eq }) => eq(at.id, assetThesisId),
      with: {
        linkedMacroTheses: {
          with: {
            macroThesis: true,
          },
        },
        linkedStrategies: true,
      },
    });

    if (!assetThesis) {
      return NextResponse.json(
        { error: 'Asset thesis not found' },
        { status: 404 }
      );
    }

    if (type === 'macroThesis' || !type) {
      // Get all macro theses
      const allMacroTheses = await db.query.macroTheses.findMany({
        orderBy: (mt, { desc }) => [desc(mt.createdAt)],
      });

      // Get currently linked IDs from junction table
      const linkedIds = new Set<string>();
      for (const rel of (assetThesis.linkedMacroTheses ?? [])) {
        linkedIds.add(rel.macroThesisId);
      }

      // Separate into currently linked and available (include description and sectors for keyword search)
      const currentlyLinked = allMacroTheses
        .filter(mt => linkedIds.has(mt.id))
        .map(mt => ({
          id: mt.id,
          title: mt.title,
          type: 'macroThesis' as const,
          thesisType: mt.thesisType,
          status: mt.status,
          description: mt.description,
          sectors: mt.sectors,
        }));

      const available = allMacroTheses
        .filter(mt => !linkedIds.has(mt.id))
        .map(mt => ({
          id: mt.id,
          title: mt.title,
          type: 'macroThesis' as const,
          thesisType: mt.thesisType,
          status: mt.status,
          description: mt.description,
          sectors: mt.sectors,
        }));

      return NextResponse.json({ entities: available, currentlyLinked });
    } else if (type === 'strategy') {
      // Get all strategies
      const allStrategies = await db.query.strategies.findMany({
        orderBy: (s, { desc }) => [desc(s.openedAt)],
      });

      // Get currently linked strategy IDs
      const linkedIds = new Set<string>();
      for (const s of (assetThesis.linkedStrategies ?? [])) {
        linkedIds.add(s.id);
      }

      // Separate into currently linked and available
      const currentlyLinked = allStrategies
        .filter(s => linkedIds.has(s.id))
        .map(s => ({
          id: s.id,
          title: s.autoDerivedLabel || s.strategyKey,
          type: 'strategy' as const,
          status: s.status,
        }));

      const available = allStrategies
        .filter(s => !linkedIds.has(s.id))
        .map(s => ({
          id: s.id,
          title: s.autoDerivedLabel || s.strategyKey,
          type: 'strategy' as const,
          status: s.status,
        }));

      return NextResponse.json({ entities: available, currentlyLinked });
    }

    return NextResponse.json({ entities: [], currentlyLinked: [] });
  } catch (error) {
    console.error('Error fetching available entities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available entities' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/asset-theses/[id]/link-entities
 *
 * Unlink an entity from an asset thesis.
 * Supports unlinking:
 * - Macro theses (via junction table)
 * - Strategies
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetThesisId } = await params;
    const body = await req.json();
    const { targetType, targetId } = body as {
      targetType: 'macroThesis' | 'strategy';
      targetId: string;
    };

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: 'targetType and targetId are required' },
        { status: 400 }
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

    if (targetType === 'macroThesis') {
      // Remove from junction table
      await db
        .delete(assetThesisRelatedMacroTheses)
        .where(
          and(
            eq(assetThesisRelatedMacroTheses.assetThesisId, assetThesisId),
            eq(assetThesisRelatedMacroTheses.macroThesisId, targetId)
          )
        );
    } else if (targetType === 'strategy') {
      // Unlink strategy
      await db
        .update(strategies)
        .set({
          assetThesisId: null,
          updatedAt: new Date(),
        })
        .where(eq(strategies.id, targetId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unlinking entity:', error);
    return NextResponse.json(
      { error: 'Failed to unlink entity' },
      { status: 500 }
    );
  }
}
