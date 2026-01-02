import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { assetTheses, strategies, assetThesisRelatedMacroTheses } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * POST /api/asset-theses/[id]/link-entities
 *
 * Link entities to an asset thesis.
 * Supports linking to:
 * - Macro theses (primary or related)
 * - Strategies
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetThesisId } = await params;
    const body = await req.json();
    const { targetType, targetIds, linkType } = body as {
      targetType: 'macroThesis' | 'strategy';
      targetIds: string[];
      linkType?: 'primary' | 'related';
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
      // Link to macro theses
      if (linkType === 'primary') {
        // Set as primary macro thesis (only one allowed)
        if (targetIds.length > 1) {
          return NextResponse.json(
            { error: 'Only one primary macro thesis allowed' },
            { status: 400 }
          );
        }

        await db
          .update(assetTheses)
          .set({
            primaryMacroThesisId: targetIds[0],
            updatedAt: new Date(),
          })
          .where(eq(assetTheses.id, assetThesisId));
      } else {
        // Add as related macro theses (junction table)
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
      }

      return NextResponse.json({
        success: true,
        linkedCount: targetIds.length,
        linkType: linkType || 'related',
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
 * GET /api/asset-theses/[id]/available-macro-theses
 *
 * Get available macro theses that can be linked to this asset thesis
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // Await params even if not using the id
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'macroThesis' or 'strategy'

    if (type === 'macroThesis' || !type) {
      const availableMacroTheses = await db.query.macroTheses.findMany({
        orderBy: (mt, { desc }) => [desc(mt.createdAt)],
      });

      const entities = availableMacroTheses.map(mt => ({
        id: mt.id,
        title: mt.title,
        thesisType: mt.thesisType,
        status: mt.status,
      }));

      return NextResponse.json({ entities });
    } else if (type === 'strategy') {
      const availableStrategies = await db.query.strategies.findMany({
        orderBy: (s, { desc }) => [desc(s.openedAt)],
      });

      const entities = availableStrategies.map(s => ({
        id: s.id,
        title: s.autoDerivedLabel || s.strategyKey,
        status: s.status,
      }));

      return NextResponse.json({ entities });
    }

    return NextResponse.json({ entities: [] });
  } catch (error) {
    console.error('Error fetching available entities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available entities' },
      { status: 500 }
    );
  }
}
