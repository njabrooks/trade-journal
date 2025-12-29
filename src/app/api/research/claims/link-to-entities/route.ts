import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { claimThesisMappings, mainClaims } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/research/claims/link-to-entities
 *
 * Links a main claim to existing macro theses and/or asset thesiss.
 * Also sets the claim status to 'confirmed' after linking.
 *
 * Request body:
 * {
 *   claimId: string;              // Main claim UUID
 *   thesisIds?: string[];         // Array of macro thesis UUIDs to link
 *   viewIds?: string[];           // Array of asset thesis UUIDs to link
 * }
 *
 * Response:
 * {
 *   success: true;
 *   linkedThesesCount: number;
 *   linkedViewsCount: number;
 *   message: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId, thesisIds = [], viewIds = [] } = body;

    // Validate required fields
    if (!claimId) {
      return NextResponse.json(
        { error: 'Missing required field: claimId' },
        { status: 400 }
      );
    }

    if (thesisIds.length === 0 && viewIds.length === 0) {
      return NextResponse.json(
        { error: 'Must provide at least one thesis or view to link to' },
        { status: 400 }
      );
    }

    // Verify claim exists
    const [claim] = await db
      .select()
      .from(mainClaims)
      .where(eq(mainClaims.id, claimId))
      .limit(1);

    if (!claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    let linkedThesesCount = 0;
    let linkedViewsCount = 0;

    // Link to theses
    if (thesisIds.length > 0) {
      const thesisLinks = thesisIds.map((thesisId: string) => ({
        mainClaimId: claimId,
        macroThesisId: thesisId,
        assetThesisId: null,
        mappingType: 'supports',
        mappedBy: 'user_link', // User manually linked via dialog
      }));

      await db.insert(claimThesisMappings).values(thesisLinks).onConflictDoNothing();
      linkedThesesCount = thesisLinks.length;
    }

    // Link to views
    if (viewIds.length > 0) {
      const viewLinks = viewIds.map((viewId: string) => ({
        mainClaimId: claimId,
        macroThesisId: null,
        assetThesisId: viewId,
        mappingType: 'supports',
        mappedBy: 'user_link', // User manually linked via dialog
      }));

      await db.insert(claimThesisMappings).values(viewLinks).onConflictDoNothing();
      linkedViewsCount = viewLinks.length;
    }

    // Update claim status to confirmed
    await db
      .update(mainClaims)
      .set({
        status: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(mainClaims.id, claimId));

    return NextResponse.json({
      success: true,
      linkedThesesCount,
      linkedViewsCount,
      message: `Claim linked to ${linkedThesesCount} theses and ${linkedViewsCount} views, status set to confirmed`,
    });
  } catch (error: any) {
    console.error('Error linking claim to entities:', error);
    return NextResponse.json(
      { error: 'Failed to link claim', details: error.message },
      { status: 500 }
    );
  }
}
